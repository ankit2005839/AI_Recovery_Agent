"""
Promise-to-Pay (P2P) State Machine.

Tracks a customer's stated intent to pay by a specific date, separate from
the main case state machine, so a case can sit in "promise made" for days
without triggering the aggressive retry/contact cadence -- only a single,
non-intrusive soft reminder near the promised date, and automatic
resolution (kept/broken) once the date passes.

States: NONE -> PROMISED -> REMINDED -> {KEPT | BROKEN}
"""

from __future__ import annotations

from datetime import datetime, timedelta

from .models import RecoveryCase, P2PStatus, PromiseToPay

SOFT_REMINDER_LEAD_HOURS = 24    # send the soft reminder 24h before the promised date
GRACE_AFTER_PROMISE_HOURS = 12   # how long after the promised date before calling it broken


def make_promise(case: RecoveryCase, promised_amount: float, promised_date: datetime,
                  now: datetime | None = None) -> PromiseToPay:
    now = now or datetime.utcnow()
    case.p2p = PromiseToPay(
        status=P2PStatus.PROMISED,
        promised_amount=promised_amount,
        promised_date=promised_date,
        made_at=now,
    )
    case.add_audit(
        event_type="p2p_created",
        detail=f"Customer promised to pay {promised_amount:,.2f} by "
               f"{promised_date.strftime('%Y-%m-%d')}. Case moved to low-intrusion "
               f"P2P tracking; standard contact cadence suspended until this date.",
    )
    return case.p2p


def should_send_soft_reminder(case: RecoveryCase, now: datetime | None = None) -> bool:
    now = now or datetime.utcnow()
    p2p = case.p2p
    if p2p.status != P2PStatus.PROMISED or not p2p.promised_date:
        return False
    lead_start = p2p.promised_date - timedelta(hours=SOFT_REMINDER_LEAD_HOURS)
    return lead_start <= now < p2p.promised_date


def send_soft_reminder(case: RecoveryCase, now: datetime | None = None) -> None:
    now = now or datetime.utcnow()
    case.p2p.status = P2PStatus.REMINDED
    case.p2p.reminder_sent_at = now
    case.add_audit(
        event_type="p2p_soft_reminder_sent",
        detail=f"Sent a single non-intrusive reminder ahead of the promised payment "
               f"date ({case.p2p.promised_date.strftime('%Y-%m-%d')}). No pressure "
               f"language used; this counts toward the contact-frequency guardrail.",
    )


def resolve_promise(case: RecoveryCase, paid: bool, now: datetime | None = None) -> None:
    now = now or datetime.utcnow()
    case.p2p.status = P2PStatus.KEPT if paid else P2PStatus.BROKEN
    case.p2p.resolved_at = now
    case.add_audit(
        event_type="p2p_resolved",
        detail=(f"Promise-to-pay was KEPT — payment received on time."
                if paid else
                f"Promise-to-pay was BROKEN — no payment received by "
                f"{case.p2p.promised_date.strftime('%Y-%m-%d') if case.p2p.promised_date else 'the promised date'}. "
                f"Case re-enters the standard escalation path with the broken-promise "
                f"context retained for tone calibration."),
    )


def is_promise_overdue(case: RecoveryCase, now: datetime | None = None) -> bool:
    now = now or datetime.utcnow()
    p2p = case.p2p
    if p2p.status not in (P2PStatus.PROMISED, P2PStatus.REMINDED) or not p2p.promised_date:
        return False
    return now > p2p.promised_date + timedelta(hours=GRACE_AFTER_PROMISE_HOURS)
