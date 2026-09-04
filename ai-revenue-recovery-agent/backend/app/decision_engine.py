"""
Agent Diagnostic & Decision Engine.

Two responsibilities, kept explicit and separately testable:

1. `diagnose(case)`      -> RootCause + confidence + human-readable reasoning
2. `select_intervention`  -> the single next-best InterventionType given the
                              diagnosis, scenario, customer segment, and
                              how many attempts have already happened.

Both are deterministic rule-engines (not an LLM call) so that every decision
is explainable, reproducible, and auditable end-to-end -- a hard requirement
for a fintech compliance story. An LLM could sit "above" this to translate
`reasoning` into a natural message (see messaging.py), but the money-moving
decision logic itself stays deterministic.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .models import (
    RecoveryCase, RootCause, DeclineCode, DeclineClass, ScenarioType,
    InterventionType, CustomerSegment, Channel, Language,
)


@dataclass
class Diagnosis:
    root_cause: RootCause
    confidence: float
    reasoning: str


@dataclass
class InterventionDecision:
    intervention_type: InterventionType
    channel: Channel
    confidence: float
    reasoning: str


# --------------------------------------------------------------------------- #
# 1. Root-cause classification
# --------------------------------------------------------------------------- #

_DECLINE_TO_ROOT_CAUSE = {
    DeclineCode.INSUFFICIENT_FUNDS: (RootCause.INSUFFICIENT_FUNDS, 0.93),
    DeclineCode.EXPIRED_CARD: (RootCause.EXPIRED_OR_INVALID_CARD, 0.97),
    DeclineCode.CVV_MISMATCH: (RootCause.EXPIRED_OR_INVALID_CARD, 0.82),
    DeclineCode.CARD_LOST_STOLEN: (RootCause.SUSPECTED_FRAUD_BLOCK, 0.90),
    DeclineCode.ISSUER_DOWN: (RootCause.BANK_ISSUER_DOWNTIME, 0.88),
    DeclineCode.GATEWAY_TIMEOUT: (RootCause.GATEWAY_DEGRADATION, 0.86),
    DeclineCode.DO_NOT_HONOR: (RootCause.INSUFFICIENT_FUNDS, 0.55),  # ambiguous soft decline
    DeclineCode.LIMIT_EXCEEDED: (RootCause.INSUFFICIENT_FUNDS, 0.80),
    DeclineCode.THREE_DS_FAILED: (RootCause.UI_CHECKOUT_FRICTION, 0.84),
}


def diagnose(case: RecoveryCase) -> Diagnosis:
    txn = case.transaction

    if txn.scenario == ScenarioType.B2B_OVERDUE_INVOICE:
        days_overdue = (txn.due_date and (txn.due_date.date())) and \
            (__import__("datetime").datetime.utcnow().date() - txn.due_date.date()).days or 0
        if case.customer.dispute_flag:
            return Diagnosis(
                RootCause.B2B_INVOICE_DISPUTE_RISK, 0.95,
                f"Customer account flagged with an active dispute on invoice "
                f"{txn.invoice_number}. Treating as dispute-risk, not simple lateness."
            )
        if days_overdue >= 45:
            return Diagnosis(
                RootCause.B2B_CASHFLOW_DELAY, 0.78,
                f"Invoice {txn.invoice_number} is {days_overdue} days overdue -- "
                f"pattern consistent with B2B cash-flow / AP-cycle delay rather than refusal to pay."
            )
        return Diagnosis(
            RootCause.B2B_CASHFLOW_DELAY, 0.65,
            f"Invoice {txn.invoice_number} is {days_overdue} days past due, within normal "
            f"B2B payment-cycle variance. Low-severity nudge appropriate."
        )

    if txn.scenario == ScenarioType.ABANDONED_CHECKOUT:
        if case.customer.segment == CustomerSegment.RETAIL_PREMIUM and txn.amount > 3000:
            return Diagnosis(
                RootCause.PRICE_HESITATION, 0.71,
                "High-value cart abandoned by a premium-segment customer with no payment "
                "failure recorded -- pattern matches price/consideration hesitation over a "
                "technical failure."
            )
        return Diagnosis(
            RootCause.UI_CHECKOUT_FRICTION, 0.74,
            "Checkout session ended before payment was attempted; no gateway error present. "
            "Most likely cause is flow friction (form complexity, load time, distraction)."
        )

    if txn.scenario == ScenarioType.PAYMENT_DEGRADATION:
        root, conf = _DECLINE_TO_ROOT_CAUSE.get(
            txn.decline_code, (RootCause.GATEWAY_DEGRADATION, 0.7))
        return Diagnosis(
            root, conf,
            f"Gateway '{txn.gateway}' returned '{txn.decline_code.value}' during a payment "
            f"attempt with no customer-side input issue detected -- classified as "
            f"infrastructure-side degradation."
        )

    # FAILED_SUBSCRIPTION (card retry) -- the richest branch
    root, conf = _DECLINE_TO_ROOT_CAUSE.get(txn.decline_code, (RootCause.UNKNOWN, 0.4))
    reasoning = (
        f"Gateway decline code '{txn.decline_code.value}' "
        f"({txn.decline_class.value} decline) mapped to root cause "
        f"'{root.value}' with {conf:.0%} historical confidence based on decline-code "
        f"taxonomy."
    )
    if txn.retry_count >= 2 and root == RootCause.INSUFFICIENT_FUNDS:
        conf = min(0.97, conf + 0.05)
        reasoning += " Confidence boosted: repeated soft declines on funds strongly confirm cash-timing issue."
    return Diagnosis(root, round(conf, 2), reasoning)


# --------------------------------------------------------------------------- #
# 2. Intervention selector matrix
# --------------------------------------------------------------------------- #

def select_intervention(case: RecoveryCase, diagnosis: Diagnosis) -> InterventionDecision:
    """
    Chooses exactly one next action. Escalation logic (attempt count, tone,
    channel) intensifies gradually across attempts, and de-escalates
    automatically for irate / premium / enterprise customers.
    """
    txn = case.transaction
    customer = case.customer
    attempt = case.contact_attempts  # 0-indexed: how many contacts already made
    hard_decline = txn.decline_class == DeclineClass.HARD

    # --- B2B invoices ---
    if txn.scenario == ScenarioType.B2B_OVERDUE_INVOICE:
        if diagnosis.root_cause == RootCause.B2B_INVOICE_DISPUTE_RISK:
            return InterventionDecision(
                InterventionType.HUMAN_ESCALATION, Channel.NONE, 0.95,
                "Dispute-risk accounts are routed straight to a human account manager; "
                "the agent does not attempt automated collection language on disputed invoices."
            )
        days_overdue = (txn.due_date and
                        (__import__("datetime").datetime.utcnow().date() - txn.due_date.date()).days) or 0
        if customer.segment == CustomerSegment.ENTERPRISE and days_overdue >= 45:
            return InterventionDecision(
                InterventionType.B2B_ACCOUNT_MANAGER_HANDOFF, Channel.EMAIL, 0.88,
                f"Enterprise account, {days_overdue} days overdue, above the "
                f"automated-collections threshold (45 days) -- handed to the named "
                f"account manager with full context instead of a templated email."
            )
        if attempt == 0:
            return InterventionDecision(
                InterventionType.EMAIL_REMINDER, Channel.EMAIL, 0.82,
                "First touch on an overdue B2B invoice: a courteous itemized reminder "
                "email, not an escalation, per the compliant-first-touch policy."
            )
        return InterventionDecision(
            InterventionType.B2B_ESCALATION_EMAIL, Channel.EMAIL, 0.80,
            f"Second+ touch ({attempt + 1}) with no payment or promise recorded -- "
            f"escalation email including payment link and finance-team CC."
        )

    # --- Abandoned checkout ---
    if txn.scenario == ScenarioType.ABANDONED_CHECKOUT:
        if diagnosis.root_cause == RootCause.PRICE_HESITATION and attempt >= 1:
            return InterventionDecision(
                InterventionType.DYNAMIC_DISCOUNT_OFFER,
                Channel.EMAIL if customer.segment == CustomerSegment.RETAIL_PREMIUM else Channel.SMS,
                0.73,
                "Second nudge on a price-hesitation case: a bounded, single-use discount "
                "converts materially better than a repeated plain reminder."
            )
        return InterventionDecision(
            InterventionType.SMS_REMINDER if attempt == 0 else InterventionType.EMAIL_REMINDER,
            Channel.SMS if attempt == 0 else Channel.EMAIL, 0.68,
            "Light-touch cart reminder; abandoned-checkout customers convert best from a "
            "quick nudge within a short recency window rather than an aggressive push."
        )

    # --- Payment degradation (infra-side) ---
    if txn.scenario == ScenarioType.PAYMENT_DEGRADATION:
        if attempt == 0:
            return InterventionDecision(
                InterventionType.SILENT_AUTO_RETRY, Channel.SYSTEM, 0.85,
                "Root cause is infrastructure-side (gateway/issuer), not the customer -- "
                "the correct first action is a silent backend retry once the gateway "
                "health signal clears, with zero customer contact."
            )
        return InterventionDecision(
            InterventionType.SMS_REMINDER, Channel.SMS, 0.6,
            "Silent retry did not clear the failure; a light SMS nudge with a direct "
            "payment link is now warranted since repeated infra failure is now visible "
            "to the customer as a stalled order."
        )

    # --- Failed subscription / card retry (richest branch) ---
    if hard_decline:
        # Never blindly retry a hard decline -- always requires the customer to act.
        if customer.is_irate or attempt >= 1:
            return InterventionDecision(
                InterventionType.EMAIL_REMINDER, Channel.EMAIL, 0.75,
                "Hard decline requiring customer action; customer is irate or already "
                "contacted once, so channel is downgraded to low-intrusion email rather "
                "than a call."
            )
        return InterventionDecision(
            InterventionType.UPDATE_PAYMENT_METHOD_LINK,
            Channel.SMS if customer.preferred_language != Language.ENGLISH else Channel.EMAIL,
            0.9,
            "Hard decline (expired/lost card) cannot be resolved by retrying -- the only "
            "correct action is a secure update-payment-method link, sent once."
        )

    # Soft decline path
    if attempt == 0:
        return InterventionDecision(
            InterventionType.SMART_RETRY_SCHEDULED, Channel.SYSTEM, 0.87,
            "First response to a soft decline is always a scheduled smart retry timed to "
            "bank settlement / salary-cycle windows before any customer contact is made."
        )
    if attempt == 1 and customer.is_irate:
        return InterventionDecision(
            InterventionType.EMAIL_REMINDER, Channel.EMAIL, 0.7,
            "Customer flagged irate: de-escalate to a single low-pressure email instead "
            "of a voice call, and slow the cadence."
        )
    if attempt == 1:
        return InterventionDecision(
            InterventionType.HINGLISH_VOICE_CALL if customer.preferred_language.value in ("hinglish", "hindi")
            else InterventionType.SMS_REMINDER,
            Channel.VOICE if customer.preferred_language.value in ("hinglish", "hindi") else Channel.SMS,
            0.77,
            "Second touch on a still-unresolved soft decline: a warm, localized voice "
            "call converts noticeably better than another silent retry for this segment."
        )
    if attempt >= 2 and customer.segment in (CustomerSegment.RETAIL_PREMIUM,):
        return InterventionDecision(
            InterventionType.DYNAMIC_DISCOUNT_OFFER, Channel.EMAIL, 0.62,
            "Premium customer still unresolved after two touches: a small loyalty credit "
            "protects the relationship and lifetime value rather than pushing a third "
            "reminder."
        )
    return InterventionDecision(
        InterventionType.EMAIL_REMINDER, Channel.EMAIL, 0.55,
        "Final permitted touch before the max-contact guardrail triggers: a plain, "
        "low-pressure email reminder."
    )
