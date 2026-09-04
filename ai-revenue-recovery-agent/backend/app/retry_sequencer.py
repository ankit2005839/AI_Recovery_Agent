"""
Smart Mandate Retry Sequencer.

Predicts the optimal next retry timestamp for a failed payment by combining:
  1. Decline-code semantics (soft vs hard, and known bank-side timing patterns)
  2. Customer salary-cycle heuristics (retrying right after payday materially
     improves success probability for insufficient-funds declines)
  3. Known bank/issuer downtime windows (avoid retrying during maintenance)
  4. Exponential-ish backoff bounded by the guardrail's max_retries, so we
     never hammer a gateway or a customer's bank.

This is a deterministic scheduling heuristic (not a black box), so every
predicted timestamp comes with a `reasoning` string for the audit trail.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, time

from .models import RecoveryCase, DeclineCode, DeclineClass

# Known issuer-side maintenance windows (illustrative, IST) -- retries avoid these.
BANK_DOWNTIME_WINDOWS = [
    (time(23, 30), time(1, 30)),   # nightly batch settlement across most Indian banks
    (time(2, 0), time(4, 0)),      # NEFT/RTGS maintenance window
]

# Backoff schedule (hours after previous attempt) keyed by attempt index.
BASE_BACKOFF_HOURS = [4, 24, 72, 168]  # 4h, 1d, 3d, 7d


@dataclass
class RetryPlan:
    next_attempt_at: datetime
    reasoning: str
    confidence: float


def _avoids_bank_downtime(dt: datetime) -> datetime:
    """Nudges a candidate timestamp forward if it falls inside a known
    bank-side downtime window."""
    t = dt.time()
    for start, end in BANK_DOWNTIME_WINDOWS:
        if start > end:  # window wraps midnight
            in_window = t >= start or t <= end
        else:
            in_window = start <= t <= end
        if in_window:
            # push to the end of the window (+ small buffer)
            push_to = datetime.combine(dt.date(), end) + timedelta(minutes=30)
            if push_to < dt:
                push_to += timedelta(days=1)
            return push_to
    return dt


def _nearest_salary_aligned_date(now: datetime, salary_day: int) -> datetime:
    """Returns the nearest upcoming date matching the customer's salary
    cycle day, biased 1 day after payday (funds typically clear same-day
    but retrying T+1 avoids same-day payroll processing queues)."""
    candidate = now.replace(day=min(salary_day, 28), hour=11, minute=0, second=0, microsecond=0)
    candidate += timedelta(days=1)  # T+1 after payday
    if candidate <= now:
        # move to next month
        if candidate.month == 12:
            candidate = candidate.replace(year=candidate.year + 1, month=1)
        else:
            candidate = candidate.replace(month=candidate.month + 1)
    return candidate


def predict_retry_window(case: RecoveryCase, now: datetime | None = None) -> RetryPlan:
    now = now or datetime.utcnow()
    txn = case.transaction
    customer = case.customer
    attempt_idx = min(txn.retry_count, len(BASE_BACKOFF_HOURS) - 1)
    backoff_hours = BASE_BACKOFF_HOURS[attempt_idx]
    baseline = now + timedelta(hours=backoff_hours)

    reasoning_parts = [
        f"Base exponential backoff for retry #{txn.retry_count + 1} is {backoff_hours}h "
        f"from now, bounded by the {len(BASE_BACKOFF_HOURS)}-attempt guardrail cap."
    ]
    confidence = 0.6

    # Insufficient-funds soft declines: align to salary cycle if known.
    if txn.decline_code == DeclineCode.INSUFFICIENT_FUNDS:
        if customer.salary_cycle_day:
            salary_aligned = _nearest_salary_aligned_date(now, customer.salary_cycle_day)
            # Only use the salary-aligned date if it's not drastically later than baseline
            # (avoid delaying a recoverable case by 3+ weeks unnecessarily).
            if salary_aligned <= baseline + timedelta(days=10):
                baseline = salary_aligned
                confidence = 0.88
                reasoning_parts.append(
                    f"Decline code is insufficient_funds and customer's salary-cycle day "
                    f"({customer.salary_cycle_day}) is known -- retry re-timed to "
                    f"T+1 after expected payday ({baseline.strftime('%Y-%m-%d %H:%M')}) "
                    f"for materially higher clear-rate."
                )
            else:
                reasoning_parts.append(
                    "Salary-aligned date was more than 10 days out; kept the shorter "
                    "backoff window instead to avoid unnecessary recovery delay."
                )
        else:
            confidence = 0.55
            reasoning_parts.append(
                "Decline code is insufficient_funds but no salary-cycle data is available "
                "for this customer -- falling back to standard backoff only."
            )

    # Issuer/gateway downtime: retry sooner once the outage typically clears, but avoid
    # exact-downtime windows.
    elif txn.decline_code in (DeclineCode.ISSUER_DOWN, DeclineCode.GATEWAY_TIMEOUT):
        baseline = now + timedelta(hours=1)  # these clear fast; retry soon
        confidence = 0.75
        reasoning_parts.append(
            "Decline is issuer/gateway-side and typically transient -- shortened retry "
            "window to 1h instead of the standard backoff, since holding longer only "
            "delays a likely-successful retry."
        )

    elif txn.decline_code == DeclineCode.DO_NOT_HONOR:
        confidence = 0.5
        reasoning_parts.append(
            "'Do not honor' is an ambiguous soft-decline code with mixed root causes -- "
            "kept the conservative standard backoff and flagged lower confidence."
        )

    elif txn.decline_class == DeclineClass.HARD:
        confidence = 0.1
        reasoning_parts.append(
            "Decline is a hard decline; scheduling an automated retry is not appropriate "
            "-- this plan should not be executed, only a customer-initiated update should "
            "trigger the next attempt."
        )

    adjusted = _avoids_bank_downtime(baseline)
    if adjusted != baseline:
        reasoning_parts.append(
            f"Adjusted from {baseline.strftime('%H:%M')} to {adjusted.strftime('%H:%M')} "
            f"to avoid a known bank settlement/maintenance downtime window."
        )

    return RetryPlan(
        next_attempt_at=adjusted,
        reasoning=" ".join(reasoning_parts),
        confidence=round(confidence, 2),
    )
