"""
Batch Runner.

Runs the orchestrator across an entire mock batch and rolls the results up
into a RecoveryBatch with the executive metrics the dashboard needs:
total revenue at risk, total recovered, recovery rate, and audit/compliance
pass rate.
"""

from __future__ import annotations

import random
from collections import Counter
from typing import List

from .models import RecoveryCase, RecoveryBatch, CaseStatus, ComplianceCheckResult
from .mock_data import generate_mock_batch
from .orchestrator import run_case_to_completion


def run_batch(n_cases: int = 55, seed: int = 42) -> RecoveryBatch:
    rng = random.Random(seed)
    raw_cases = generate_mock_batch(n_cases=n_cases, seed=seed)

    completed: List[RecoveryCase] = []
    for case in raw_cases:
        case_rng = random.Random(rng.randint(0, 2**31))
        completed.append(run_case_to_completion(case, case_rng))

    batch = RecoveryBatch(cases=completed)
    _compute_metrics(batch)
    return batch


def _compute_metrics(batch: RecoveryBatch) -> None:
    total_at_risk = sum(c.transaction.amount for c in batch.cases)
    total_recovered = sum(c.amount_recovered for c in batch.cases)

    status_counts = Counter(c.status.value for c in batch.cases)
    scenario_counts = Counter(c.transaction.scenario.value for c in batch.cases)

    compliance_pass = 0
    compliance_blocked = 0
    for c in batch.cases:
        for entry in c.audit_trail:
            if entry.event_type == "compliance_check":
                if entry.compliance_check == ComplianceCheckResult.PASS:
                    compliance_pass += 1
                else:
                    compliance_blocked += 1

    total_checks = compliance_pass + compliance_blocked
    # "Audit compliance rate" = % of cases where every single compliance-relevant
    # action taken was correctly gated (i.e. no guardrail was ever violated --
    # BLOCKED verdicts are *expected correct behavior*, not violations, since the
    # orchestrator always honors them. This measures that 100% of actions passed
    # through a logged check, i.e. nothing was ever executed ungated.)
    cases_with_full_audit = sum(
        1 for c in batch.cases
        if len(c.audit_trail) > 0 and all(
            entry.compliance_check in (ComplianceCheckResult.PASS, ComplianceCheckResult.BLOCKED)
            for entry in c.audit_trail
        )
    )

    batch.total_revenue_at_risk = round(total_at_risk, 2)
    batch.total_recovered = round(total_recovered, 2)
    batch.recovery_rate_pct = round((total_recovered / total_at_risk * 100) if total_at_risk else 0, 2)
    batch.compliance_pass_count = compliance_pass
    batch.compliance_blocked_count = compliance_blocked
    batch.audit_compliance_rate_pct = round(
        (cases_with_full_audit / len(batch.cases) * 100) if batch.cases else 100.0, 2
    )
    batch.cases_by_status = dict(status_counts)
    batch.cases_by_scenario = dict(scenario_counts)
