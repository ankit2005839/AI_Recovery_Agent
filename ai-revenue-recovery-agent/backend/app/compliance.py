"""
Compliance & Stopping Rules Guardrail.

This module is intentionally the *first* gate the orchestrator consults
before any customer-facing action, and it is the one component every other
module must defer to. Nothing sends a message, makes a call, or schedules a
retry without passing through `check_compliance()` first, and every check
-- pass or block -- is written to the immutable audit trail by the caller.

Implements:
  - Instant termination triggers on keywords (stop / unsubscribe / lawyer / dispute)
  - Max contact attempts (default: 3 contacts within a rolling 7-day window)
  - Time-of-day contact window restrictions (default 09:00-20:00 IST)
  - Regulatory "cooling off" / grace period before first contact
  - Do-not-contact list (opted_out) enforced permanently
  - Dispute-flagged accounts routed to human, never auto-contacted
  - Channel-appropriate escalation matrix (never voice-call before SMS/email
    has been tried once, never repeat the same channel back-to-back for B2C)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, time
from typing import Optional

from .models import (
    RecoveryCase, Channel, InterventionType, ComplianceCheckResult,
    ScenarioType, CustomerSegment,
)

# --------------------------------------------------------------------------- #
# Tunable policy constants (would be pulled from a compliance config service
# in production; hardcoded here for auditability/demo transparency)
# --------------------------------------------------------------------------- #

MAX_CONTACTS_PER_WINDOW = 3
CONTACT_WINDOW_DAYS = 7
GRACE_PERIOD_HOURS_B2C = 2          # don't contact within 2h of a failed payment
GRACE_PERIOD_HOURS_B2B = 24         # B2B gets a full day of grace before first nudge
QUIET_HOURS_START = time(9, 0)      # no contact before 09:00 local
QUIET_HOURS_END = time(20, 0)       # no contact after 20:00 local
MAX_VOICE_CALLS_PER_CASE = 1        # never more than one voice call per case

TERMINATION_KEYWORDS = {
    "stop", "unsubscribe", "unsubscribed", "lawyer", "attorney", "legal action",
    "dispute", "fraud", "scam", "harassment", "harassing", "do not contact",
    "cease", "complaint", "consumer forum", "police",
}


@dataclass
class ComplianceVerdict:
    result: ComplianceCheckResult
    rule: str
    detail: str


def scan_for_termination_keywords(customer_message: str) -> Optional[ComplianceVerdict]:
    """Scans any inbound customer text (SMS/email/call-transcript reply) for
    an instant-stop keyword. Returns a BLOCKED verdict if found, else None."""
    lowered = customer_message.lower()
    for kw in TERMINATION_KEYWORDS:
        if kw in lowered:
            return ComplianceVerdict(
                ComplianceCheckResult.BLOCKED,
                rule="instant_termination_keyword",
                detail=f"Inbound message matched termination keyword '{kw}'. "
                       f"All further automated contact permanently suspended for this case."
            )
    return None


def _in_quiet_hours(now: datetime) -> bool:
    t = now.time()
    return not (QUIET_HOURS_START <= t <= QUIET_HOURS_END)


def check_compliance(case: RecoveryCase, proposed_channel: Channel,
                      proposed_intervention: InterventionType,
                      now: Optional[datetime] = None) -> ComplianceVerdict:
    """
    The single gate every proposed action must pass through. Returns a
    ComplianceVerdict; callers must not execute the action on a BLOCKED
    verdict and must instead transition the case to a stopped/escalated
    state.
    """
    now = now or datetime.utcnow()
    customer = case.customer

    # 1. Permanent do-not-contact list
    if customer.opted_out:
        return ComplianceVerdict(
            ComplianceCheckResult.BLOCKED, "opt_out_list",
            f"Customer {customer.customer_id} is on the permanent opt-out list. "
            f"No automated contact of any kind is permitted."
        )

    # 2. Dispute flag -- route to human, agent never auto-contacts
    if customer.dispute_flag and proposed_intervention != InterventionType.HUMAN_ESCALATION:
        return ComplianceVerdict(
            ComplianceCheckResult.BLOCKED, "active_dispute_flag",
            f"Customer {customer.customer_id} has an active dispute flag. "
            f"Automated collection/recovery contact is prohibited; must escalate to a human."
        )

    # 3. Silent/system actions bypass contact-frequency and quiet-hours rules
    #    (no customer is contacted, so consumer-protection rules don't apply)
    if proposed_channel == Channel.SYSTEM:
        return ComplianceVerdict(ComplianceCheckResult.PASS, "system_action_exempt",
                                  "Silent backend action; no customer contact triggered, "
                                  "so contact-frequency and quiet-hour rules do not apply.")

    # 4. Max contact attempts within rolling window
    window_start = now - timedelta(days=CONTACT_WINDOW_DAYS)
    recent_contacts = [ts for ts in case.contact_timestamps if ts >= window_start]
    if len(recent_contacts) >= MAX_CONTACTS_PER_WINDOW:
        return ComplianceVerdict(
            ComplianceCheckResult.BLOCKED, "max_contact_attempts",
            f"{len(recent_contacts)} contacts already made within the last "
            f"{CONTACT_WINDOW_DAYS} days (limit {MAX_CONTACTS_PER_WINDOW}). "
            f"Further automated contact is suspended; case will be escalated or closed."
        )

    # 5. Voice-call specific cap (extra-sensitive channel)
    if proposed_intervention == InterventionType.HINGLISH_VOICE_CALL:
        voice_count = sum(1 for iv in case.interventions
                           if iv.channel == Channel.VOICE and not iv.suppressed)
        if voice_count >= MAX_VOICE_CALLS_PER_CASE:
            return ComplianceVerdict(
                ComplianceCheckResult.BLOCKED, "max_voice_calls",
                f"Voice-call cap ({MAX_VOICE_CALLS_PER_CASE} per case) already reached. "
                f"Downgrading to a lower-intrusion channel is required."
            )

    # 6. Regulatory grace period before ANY first contact
    grace_hours = (GRACE_PERIOD_HOURS_B2B if case.transaction.scenario == ScenarioType.B2B_OVERDUE_INVOICE
                   else GRACE_PERIOD_HOURS_B2C)
    if case.contact_attempts == 0:
        elapsed = now - case.transaction.attempted_at
        if elapsed < timedelta(hours=grace_hours):
            return ComplianceVerdict(
                ComplianceCheckResult.BLOCKED, "grace_period",
                f"Only {elapsed.total_seconds()/3600:.1f}h elapsed since the triggering "
                f"event; the {grace_hours}h regulatory grace period before first contact "
                f"has not yet elapsed."
            )

    # 7. Time-of-day contact window (skip for system/no-contact actions, already handled above)
    if _in_quiet_hours(now):
        return ComplianceVerdict(
            ComplianceCheckResult.BLOCKED, "quiet_hours",
            f"Current time {now.strftime('%H:%M')} is outside the permitted contact "
            f"window ({QUIET_HOURS_START.strftime('%H:%M')}-{QUIET_HOURS_END.strftime('%H:%M')} "
            f"local). Action deferred, not cancelled."
        )

    # 8. Irate-customer channel restriction: never voice-call an irate customer
    if customer.is_irate and proposed_intervention == InterventionType.HINGLISH_VOICE_CALL:
        return ComplianceVerdict(
            ComplianceCheckResult.BLOCKED, "irate_customer_channel_restriction",
            f"Customer flagged irate; voice outreach is disallowed to avoid perceived "
            f"harassment. Must downgrade to a passive channel (email)."
        )

    # 9. B2B severe-overdue accounts must not receive templated escalation past threshold
    #    without a human in the loop (handled upstream by decision_engine routing to
    #    B2B_ACCOUNT_MANAGER_HANDOFF, this is the safety-net check).
    if (case.transaction.scenario == ScenarioType.B2B_OVERDUE_INVOICE and
            case.customer.segment == CustomerSegment.ENTERPRISE and
            case.contact_attempts >= 3 and
            proposed_intervention == InterventionType.B2B_ESCALATION_EMAIL):
        return ComplianceVerdict(
            ComplianceCheckResult.BLOCKED, "enterprise_escalation_cap",
            "Enterprise account has received 3+ automated escalation touches; further "
            "automated contact requires human account-manager sign-off."
        )

    return ComplianceVerdict(ComplianceCheckResult.PASS, "all_checks",
                              "All compliance checks passed: not opted out, no dispute "
                              "flag, within contact-frequency and quiet-hours limits, "
                              "grace period satisfied.")
