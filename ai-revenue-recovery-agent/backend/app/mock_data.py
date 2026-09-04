"""
Mock Batch Data Generator.

Produces a realistic, seeded batch of recovery cases spanning all four
scenarios, with deliberate edge cases baked in:
  - hard declines (expired card, lost/stolen card)
  - irate / already-disputing customers (must be filtered by compliance)
  - customers who already opted out (must never be contacted)
  - valid promise-to-pay candidates
  - gateway degradation storms (multiple customers same code, same window)
  - B2B invoices ranging from just-overdue to severely overdue
  - customers with no salary-cycle data (agent must fall back gracefully)

Deterministic with a fixed random seed so demo runs are reproducible, but a
`seed` param is exposed for the "regenerate batch" button in the UI.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import List

from .models import (
    Customer, Transaction, RecoveryCase, ScenarioType, DeclineCode,
    DeclineClass, CustomerSegment, Language, CaseStatus,
)

FIRST_NAMES = [
    "Aarav", "Priya", "Rohan", "Ananya", "Vikram", "Sneha", "Karan", "Isha",
    "Aditya", "Meera", "Rahul", "Divya", "Arjun", "Kavya", "Siddharth",
    "Neha", "Manish", "Pooja", "Sanjay", "Ritu", "Amit", "Deepika",
    "Nikhil", "Shreya", "Raj", "Anjali", "Varun", "Tanvi", "Suresh", "Lakshmi",
]
LAST_NAMES = [
    "Sharma", "Verma", "Gupta", "Iyer", "Patel", "Reddy", "Nair", "Singh",
    "Mehta", "Kapoor", "Joshi", "Rao", "Kulkarni", "Chatterjee", "Bose",
    "Malhotra", "Bhat", "Agarwal", "Desai", "Pillai",
]
B2B_COMPANIES = [
    "Nimbus Retail Pvt Ltd", "Orbit Logistics", "Sapphire Textiles",
    "Vertex Consulting Group", "Bluepeak Manufacturing", "Crestline Foods",
    "Havenwell Pharma", "Ironclad Distributors", "Meridian Software Labs",
    "Pinnacle Traders",
]
PRODUCTS = ["Pro Plan Subscription", "Premium Membership", "SaaS Seats (Annual)",
            "Cloud Storage Plus", "Team Workspace", "Analytics Add-on"]

DECLINE_PROFILES = {
    DeclineCode.INSUFFICIENT_FUNDS: DeclineClass.SOFT,
    DeclineCode.EXPIRED_CARD: DeclineClass.HARD,
    DeclineCode.CARD_LOST_STOLEN: DeclineClass.HARD,
    DeclineCode.ISSUER_DOWN: DeclineClass.SOFT,
    DeclineCode.DO_NOT_HONOR: DeclineClass.SOFT,
    DeclineCode.THREE_DS_FAILED: DeclineClass.FRICTION,
    DeclineCode.GATEWAY_TIMEOUT: DeclineClass.SOFT,
    DeclineCode.LIMIT_EXCEEDED: DeclineClass.SOFT,
    DeclineCode.CVV_MISMATCH: DeclineClass.HARD,
    DeclineCode.NO_FAILURE_CHECKOUT_ABANDONED: DeclineClass.NOT_APPLICABLE,
    DeclineCode.INVOICE_OVERDUE: DeclineClass.NOT_APPLICABLE,
}


def _rand_phone(rng: random.Random) -> str:
    return f"+91-{rng.randint(70000, 99999)}{rng.randint(10000, 99999)}"


def _rand_name(rng: random.Random) -> str:
    return f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"


def _make_customer(rng: random.Random, segment: CustomerSegment, *, b2b: bool = False,
                    force_opt_out: bool = False, force_dispute: bool = False,
                    force_irate: bool = False) -> Customer:
    name = rng.choice(B2B_COMPANIES) if b2b else _rand_name(rng)
    lang = rng.choices(
        [Language.HINGLISH, Language.ENGLISH, Language.HINDI],
        weights=[0.55, 0.35, 0.10],
    )[0] if not b2b else Language.ENGLISH
    email_base = name.lower().replace(" ", ".").replace("pvt.ltd", "").strip(".")
    return Customer(
        name=name,
        segment=segment,
        preferred_language=lang,
        phone=_rand_phone(rng),
        email=f"{email_base}@{'corp' if b2b else 'mail'}example.com",
        opted_out=force_opt_out,
        dispute_flag=force_dispute,
        salary_cycle_day=None if b2b else rng.choice([1, 1, 1, 5, 7, 28, 30, None]),
        lifetime_value_inr=round(rng.uniform(2000, 250000), 2),
        is_irate=force_irate,
    )


def _make_txn(rng: random.Random, customer_id: str, scenario: ScenarioType,
              decline_code: DeclineCode, amount: float, *,
              due_days_ago: int = 0, retry_count: int = 0,
              invoice_number: str | None = None) -> Transaction:
    now = datetime.utcnow()
    return Transaction(
        customer_id=customer_id,
        scenario=scenario,
        amount=round(amount, 2),
        decline_code=decline_code,
        decline_class=DECLINE_PROFILES[decline_code],
        gateway=rng.choice(["razorpay", "stripe", "payu", "ccavenue"]),
        attempted_at=now - timedelta(hours=rng.randint(1, 96)),
        due_date=(now - timedelta(days=due_days_ago)) if due_days_ago else None,
        invoice_number=invoice_number,
        product_name=rng.choice(PRODUCTS),
        retry_count=retry_count,
    )


def generate_mock_batch(n_cases: int = 55, seed: int = 42) -> List[RecoveryCase]:
    rng = random.Random(seed)
    cases: List[RecoveryCase] = []

    # Distribution across the four scenarios (weights tuned for realism)
    scenario_pool = (
        [ScenarioType.FAILED_SUBSCRIPTION] * int(n_cases * 0.35) +
        [ScenarioType.ABANDONED_CHECKOUT] * int(n_cases * 0.25) +
        [ScenarioType.B2B_OVERDUE_INVOICE] * int(n_cases * 0.20) +
        [ScenarioType.PAYMENT_DEGRADATION] * int(n_cases * 0.20)
    )
    while len(scenario_pool) < n_cases:
        scenario_pool.append(rng.choice(list(ScenarioType)))
    rng.shuffle(scenario_pool)

    # --- deliberate edge cases injected first, for guaranteed coverage ---
    edge_cases = []

    # 1. Hard decline - expired card
    c = _make_customer(rng, CustomerSegment.RETAIL_MASS)
    t = _make_txn(rng, c.customer_id, ScenarioType.FAILED_SUBSCRIPTION,
                  DeclineCode.EXPIRED_CARD, 999.0, retry_count=1)
    edge_cases.append(RecoveryCase(customer=c, transaction=t))

    # 2. Hard decline - lost/stolen card (must NOT retry, must escalate to update-method only)
    c = _make_customer(rng, CustomerSegment.RETAIL_PREMIUM)
    t = _make_txn(rng, c.customer_id, ScenarioType.FAILED_SUBSCRIPTION,
                  DeclineCode.CARD_LOST_STOLEN, 2499.0)
    edge_cases.append(RecoveryCase(customer=c, transaction=t))

    # 3. Irate customer - must get de-escalated, low-frequency treatment
    c = _make_customer(rng, CustomerSegment.RETAIL_MASS, force_irate=True)
    t = _make_txn(rng, c.customer_id, ScenarioType.FAILED_SUBSCRIPTION,
                  DeclineCode.INSUFFICIENT_FUNDS, 799.0, retry_count=2)
    edge_cases.append(RecoveryCase(customer=c, transaction=t))

    # 4. Already opted out - agent must take zero action
    c = _make_customer(rng, CustomerSegment.RETAIL_MASS, force_opt_out=True)
    t = _make_txn(rng, c.customer_id, ScenarioType.ABANDONED_CHECKOUT,
                  DeclineCode.NO_FAILURE_CHECKOUT_ABANDONED, 1499.0)
    edge_cases.append(RecoveryCase(customer=c, transaction=t))

    # 5. Dispute flag already raised - instant termination trigger
    c = _make_customer(rng, CustomerSegment.SMB, force_dispute=True)
    t = _make_txn(rng, c.customer_id, ScenarioType.B2B_OVERDUE_INVOICE,
                  DeclineCode.INVOICE_OVERDUE, 84500.0, due_days_ago=21,
                  invoice_number="INV-2026-4471")
    edge_cases.append(RecoveryCase(customer=c, transaction=t))

    # 6. Valid promise-to-pay candidate - premium, high LTV, gentle case
    c = _make_customer(rng, CustomerSegment.RETAIL_PREMIUM)
    t = _make_txn(rng, c.customer_id, ScenarioType.FAILED_SUBSCRIPTION,
                  DeclineCode.INSUFFICIENT_FUNDS, 4999.0, retry_count=1)
    edge_cases.append(RecoveryCase(customer=c, transaction=t))

    # 7. Gateway degradation storm - 3 customers, same code, same window
    for _ in range(3):
        c = _make_customer(rng, CustomerSegment.RETAIL_MASS)
        t = _make_txn(rng, c.customer_id, ScenarioType.PAYMENT_DEGRADATION,
                      DeclineCode.GATEWAY_TIMEOUT, rng.uniform(500, 3000))
        edge_cases.append(RecoveryCase(customer=c, transaction=t))

    # 8. Severely overdue B2B enterprise invoice - needs account-manager handoff
    c = _make_customer(rng, CustomerSegment.ENTERPRISE, b2b=True)
    t = _make_txn(rng, c.customer_id, ScenarioType.B2B_OVERDUE_INVOICE,
                  DeclineCode.INVOICE_OVERDUE, 612000.0, due_days_ago=67,
                  invoice_number="INV-2026-3390")
    edge_cases.append(RecoveryCase(customer=c, transaction=t))

    # 9. Already at max retries - must be stopped, not retried again
    c = _make_customer(rng, CustomerSegment.RETAIL_MASS)
    t = _make_txn(rng, c.customer_id, ScenarioType.FAILED_SUBSCRIPTION,
                  DeclineCode.DO_NOT_HONOR, 1199.0, retry_count=4)
    t.max_retries = 4
    edge_cases.append(RecoveryCase(customer=c, transaction=t))

    # 10. Fresh abandoned checkout, high intent (price hesitation candidate)
    c = _make_customer(rng, CustomerSegment.RETAIL_MASS)
    t = _make_txn(rng, c.customer_id, ScenarioType.ABANDONED_CHECKOUT,
                  DeclineCode.NO_FAILURE_CHECKOUT_ABANDONED, 2199.0)
    edge_cases.append(RecoveryCase(customer=c, transaction=t))

    cases.extend(edge_cases)

    # --- fill the remaining slots with generated variety ---
    remaining = max(0, n_cases - len(cases))
    for i in range(remaining):
        scenario = scenario_pool[i % len(scenario_pool)]

        if scenario == ScenarioType.B2B_OVERDUE_INVOICE:
            segment = rng.choice([CustomerSegment.SMB, CustomerSegment.ENTERPRISE])
            c = _make_customer(rng, segment, b2b=True,
                                force_dispute=rng.random() < 0.06)
            due_days = rng.choice([3, 8, 15, 22, 30, 45, 60, 75])
            amt = rng.uniform(8000, 450000) if segment == CustomerSegment.SMB \
                else rng.uniform(150000, 900000)
            t = _make_txn(rng, c.customer_id, scenario, DeclineCode.INVOICE_OVERDUE,
                          amt, due_days_ago=due_days,
                          invoice_number=f"INV-2026-{rng.randint(1000,9999)}")

        elif scenario == ScenarioType.ABANDONED_CHECKOUT:
            segment = rng.choices(
                [CustomerSegment.RETAIL_MASS, CustomerSegment.RETAIL_PREMIUM],
                weights=[0.75, 0.25])[0]
            c = _make_customer(rng, segment,
                                force_opt_out=rng.random() < 0.05,
                                force_irate=rng.random() < 0.05)
            t = _make_txn(rng, c.customer_id, scenario,
                          DeclineCode.NO_FAILURE_CHECKOUT_ABANDONED,
                          rng.uniform(299, 6999))

        elif scenario == ScenarioType.PAYMENT_DEGRADATION:
            segment = rng.choice([CustomerSegment.RETAIL_MASS, CustomerSegment.RETAIL_PREMIUM])
            c = _make_customer(rng, segment)
            code = rng.choice([DeclineCode.GATEWAY_TIMEOUT, DeclineCode.ISSUER_DOWN,
                                DeclineCode.THREE_DS_FAILED])
            t = _make_txn(rng, c.customer_id, scenario, code, rng.uniform(399, 8999),
                          retry_count=rng.choice([0, 1]))

        else:  # FAILED_SUBSCRIPTION
            segment = rng.choices(
                [CustomerSegment.RETAIL_MASS, CustomerSegment.RETAIL_PREMIUM],
                weights=[0.7, 0.3])[0]
            c = _make_customer(rng, segment,
                                force_irate=rng.random() < 0.07,
                                force_opt_out=rng.random() < 0.04)
            code = rng.choices(
                [DeclineCode.INSUFFICIENT_FUNDS, DeclineCode.EXPIRED_CARD,
                 DeclineCode.LIMIT_EXCEEDED, DeclineCode.DO_NOT_HONOR,
                 DeclineCode.CVV_MISMATCH, DeclineCode.CARD_LOST_STOLEN],
                weights=[0.40, 0.18, 0.15, 0.15, 0.08, 0.04])[0]
            t = _make_txn(rng, c.customer_id, scenario, code, rng.uniform(199, 5999),
                          retry_count=rng.choice([0, 0, 1, 2]))

        cases.append(RecoveryCase(customer=c, transaction=t))

    rng.shuffle(cases)
    return cases
