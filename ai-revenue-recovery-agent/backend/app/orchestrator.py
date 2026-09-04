"""
Agent Orchestrator.

Drives one RecoveryCase through its full lifecycle:

    DETECTED -> DIAGNOSED -> CONTACTED -> (PROMISE_TO_PAY) -> RECOVERED
                                        -> STOPPED_COMPLIANCE
                                        -> STOPPED_MAX_ATTEMPTS
                                        -> ESCALATED_HUMAN
                                        -> FAILED_EXHAUSTED

Every transition writes an AuditTrailEntry. Every customer-facing action is
gated by compliance.check_compliance(). This module contains the only
"random" element in the whole system: simulate_outcome(), which stands in
for a real payment-gateway / customer-response webhook in this prototype,
so the batch simulator has something realistic to show. All decision logic
upstream of that is fully deterministic.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Optional

from .models import (
    RecoveryCase, CaseStatus, Channel, InterventionType, InterventionLog,
    ComplianceCheckResult, ScenarioType, RootCause,
)
from . import decision_engine, compliance, retry_sequencer, messaging, p2p_state_machine


# Outcome probabilities per (scenario, is_hard_decline) -- illustrative,
# calibrated so the demo batch shows a believable, not-too-perfect recovery rate.
BASE_RECOVERY_PROB = {
    ScenarioType.FAILED_SUBSCRIPTION: 0.52,
    ScenarioType.ABANDONED_CHECKOUT: 0.34,
    ScenarioType.B2B_OVERDUE_INVOICE: 0.61,
    ScenarioType.PAYMENT_DEGRADATION: 0.71,
}
P2P_PROB = {
    ScenarioType.B2B_OVERDUE_INVOICE: 0.22,
    ScenarioType.FAILED_SUBSCRIPTION: 0.10,
}


def run_diagnosis_step(case: RecoveryCase, now: Optional[datetime] = None) -> None:
    now = now or datetime.utcnow()
    diag = decision_engine.diagnose(case)
    case.root_cause = diag.root_cause
    case.root_cause_confidence = diag.confidence
    case.status = CaseStatus.DIAGNOSED
    case.add_audit(
        event_type="diagnosis",
        detail=diag.reasoning,
        data_snapshot={"root_cause": diag.root_cause.value, "confidence": diag.confidence},
    )


def run_contact_step(case: RecoveryCase, rng: random.Random,
                      now: Optional[datetime] = None) -> bool:
    """
    Attempts exactly one contact/action step. Returns True if the case
    reached a terminal state this step (recovered/stopped/escalated),
    False if it should be revisited in a later step.
    """
    now = now or datetime.utcnow()
    diag = decision_engine.Diagnosis(case.root_cause, case.root_cause_confidence, "")
    decision = decision_engine.select_intervention(case, diag)

    verdict = compliance.check_compliance(case, decision.channel, decision.intervention_type, now)
    case.add_audit(
        event_type="compliance_check",
        detail=verdict.detail,
        compliance_check=verdict.result,
        compliance_rule=verdict.rule,
    )

    if verdict.result == ComplianceCheckResult.BLOCKED:
        return _handle_compliance_block(case, decision, verdict, now)

    # Build the concrete action
    template_id, message_text = messaging.generate_message(case, decision.intervention_type)

    scheduled_for = now
    reasoning = decision.reasoning
    if decision.intervention_type in (InterventionType.SMART_RETRY_SCHEDULED,):
        plan = retry_sequencer.predict_retry_window(case, now)
        scheduled_for = plan.next_attempt_at
        reasoning = f"{decision.reasoning} | Retry timing: {plan.reasoning}"

    step_number = len(case.interventions) + 1
    log = InterventionLog(
        case_id=case.case_id,
        step_number=step_number,
        intervention_type=decision.intervention_type,
        channel=decision.channel,
        scheduled_for=scheduled_for,
        executed_at=now,
        message_language=case.customer.preferred_language,
        message_template_id=template_id,
        message_text=message_text,
        confidence_score=decision.confidence,
        reasoning=reasoning,
    )
    case.interventions.append(log)
    case.add_audit(
        event_type="intervention_executed",
        detail=f"Executed '{decision.intervention_type.value}' via {decision.channel.value}. "
               f"{reasoning}",
        data_snapshot={"template_id": template_id, "confidence": decision.confidence},
    )

    if decision.channel != Channel.SYSTEM:
        case.contact_attempts += 1
        case.contact_timestamps.append(now)

    case.status = CaseStatus.CONTACTED

    # Human escalation and B2B account-manager handoff are terminal-ish: hand off and stop
    # automated action, but they are not a compliance "stop" -- log distinctly.
    if decision.intervention_type in (InterventionType.HUMAN_ESCALATION,):
        case.status = CaseStatus.ESCALATED_HUMAN
        case.escalated = True
        case.add_audit(event_type="escalated_to_human",
                        detail="Case handed to a human agent; automated actions halted.")
        return True

    outcome = _simulate_outcome(case, decision, rng, now)
    log.outcome = outcome

    if outcome == "recovered":
        case.status = CaseStatus.RECOVERED
        case.amount_recovered = case.transaction.amount
        case.recovered_at = now
        case.add_audit(event_type="recovered",
                        detail=f"Full amount {case.transaction.amount:,.2f} "
                               f"{case.transaction.currency} recovered following "
                               f"'{decision.intervention_type.value}'.")
        return True

    if outcome == "p2p_made":
        promised_date = now + timedelta(days=rng.randint(2, 10))
        p2p_state_machine.make_promise(case, case.transaction.amount, promised_date, now)
        case.status = CaseStatus.PROMISE_TO_PAY
        return False

    # no_response -- check guardrails for whether we can try again
    if case.contact_attempts >= compliance.MAX_CONTACTS_PER_WINDOW and decision.channel != Channel.SYSTEM:
        case.status = CaseStatus.STOPPED_MAX_ATTEMPTS
        case.stop_reason = (f"Reached the maximum of {compliance.MAX_CONTACTS_PER_WINDOW} "
                             f"contact attempts within {compliance.CONTACT_WINDOW_DAYS} days "
                             f"with no response or payment.")
        case.add_audit(event_type="stopped", detail=case.stop_reason,
                        compliance_check=ComplianceCheckResult.PASS,
                        compliance_rule="max_contact_attempts_reached")
        return True

    if case.transaction.retry_count >= case.transaction.max_retries and decision.channel == Channel.SYSTEM:
        case.status = CaseStatus.FAILED_EXHAUSTED
        case.stop_reason = "Automated retry budget exhausted with no successful charge."
        case.add_audit(event_type="stopped", detail=case.stop_reason)
        return True

    if decision.intervention_type == InterventionType.SMART_RETRY_SCHEDULED:
        case.transaction.retry_count += 1

    return False


def _handle_compliance_block(case: RecoveryCase, decision, verdict, now: datetime) -> bool:
    """A blocked action always halts automated contact for this step. Some
    block reasons are permanently terminal for the case; others (quiet
    hours) just defer to the next cycle."""
    deferring_rules = {"quiet_hours", "grace_period"}
    if verdict.rule in deferring_rules:
        # Not terminal -- caller should re-invoke on a later simulated tick.
        return False

    case.status = CaseStatus.STOPPED_COMPLIANCE
    case.stop_reason = verdict.detail
    if verdict.rule in ("opt_out_list", "active_dispute_flag") or \
            decision.intervention_type == InterventionType.HUMAN_ESCALATION:
        case.escalated = verdict.rule == "active_dispute_flag"
        if case.escalated:
            case.status = CaseStatus.ESCALATED_HUMAN
    return True


def _simulate_outcome(case: RecoveryCase, decision, rng: random.Random, now: datetime) -> str:
    """Stand-in for real-world payment/response webhooks. Weighted by
    scenario, intervention quality (confidence), attempt fatigue, and
    whether the decline is fundamentally recoverable."""
    scenario = case.transaction.scenario
    base = BASE_RECOVERY_PROB.get(scenario, 0.4)

    # confidence of the chosen intervention nudges the odds
    base = base * (0.6 + 0.5 * decision.confidence)

    # fatigue: each additional contact attempt on the same case converts worse
    fatigue_penalty = 0.06 * case.contact_attempts
    base = max(0.03, base - fatigue_penalty)

    # hard declines through a non-update-link channel basically never self-resolve
    if case.transaction.decline_class.value == "hard" and \
            decision.intervention_type != InterventionType.UPDATE_PAYMENT_METHOD_LINK:
        base *= 0.3

    p2p_prob = P2P_PROB.get(scenario, 0.0) if decision.intervention_type not in (
        InterventionType.SILENT_AUTO_RETRY, InterventionType.SMART_RETRY_SCHEDULED) else 0.0

    roll = rng.random()
    if roll < base:
        return "recovered"
    if roll < base + p2p_prob:
        return "p2p_made"
    return "no_response"


def run_case_to_completion(case: RecoveryCase, rng: random.Random,
                            max_steps: int = 6,
                            start_time: Optional[datetime] = None) -> RecoveryCase:
    """Advances a single case through the full state machine until it hits a
    terminal state or exhausts max_steps (safety valve)."""
    now = start_time or datetime.utcnow()
    case.add_audit(event_type="detected",
                    detail=f"At-risk revenue event detected: {case.transaction.scenario.value} "
                           f"for {case.transaction.amount:,.2f} {case.transaction.currency}.")

    run_diagnosis_step(case, now)

    for step in range(max_steps):
        # simulate time passing between steps so retry/compliance windows behave realistically
        now = now + timedelta(hours=rng.randint(6, 30))
        terminal = run_contact_step(case, rng, now)
        if case.status == CaseStatus.PROMISE_TO_PAY:
            # resolve the promise probabilistically before continuing / ending
            kept = rng.random() < 0.72
            resolve_time = (case.p2p.promised_date or now) + timedelta(hours=2)
            if kept:
                p2p_state_machine.resolve_promise(case, True, resolve_time)
                case.status = CaseStatus.RECOVERED
                case.amount_recovered = case.transaction.amount
                case.recovered_at = resolve_time
                case.add_audit(event_type="recovered",
                                detail=f"Promise-to-pay kept; {case.transaction.amount:,.2f} "
                                       f"{case.transaction.currency} recovered.")
                return case
            else:
                p2p_state_machine.resolve_promise(case, False, resolve_time)
                now = resolve_time
                continue
        if terminal:
            return case

    if case.status not in (CaseStatus.RECOVERED,):
        case.status = CaseStatus.FAILED_EXHAUSTED
        case.stop_reason = case.stop_reason or "Max simulation steps reached without resolution."
        case.add_audit(event_type="stopped", detail=case.stop_reason)
    return case
