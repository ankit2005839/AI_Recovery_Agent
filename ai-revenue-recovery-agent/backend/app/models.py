"""
Data models for the AI Revenue Recovery Agent platform.

These models are the contract between the agent/decision engine, the
compliance guardrail layer, and the frontend dashboard. Every entity that
the agent touches produces an immutable AuditTrailEntry, so the schema is
built around that requirement first.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from enum import Enum
from typing import List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# Enums
# --------------------------------------------------------------------------- #

class ScenarioType(str, Enum):
    FAILED_SUBSCRIPTION = "failed_subscription"          # card retry
    ABANDONED_CHECKOUT = "abandoned_checkout"
    B2B_OVERDUE_INVOICE = "b2b_overdue_invoice"
    PAYMENT_DEGRADATION = "payment_degradation"           # gateway-level issue


class DeclineCode(str, Enum):
    """Normalized gateway decline / error codes."""
    INSUFFICIENT_FUNDS = "insufficient_funds"              # soft decline
    EXPIRED_CARD = "expired_card"                           # hard decline
    CARD_LOST_STOLEN = "card_lost_stolen"                   # hard decline
    ISSUER_DOWN = "issuer_down"                             # soft, transient
    DO_NOT_HONOR = "do_not_honor"                            # soft, ambiguous
    THREE_DS_FAILED = "three_ds_failed"                     # soft, friction
    GATEWAY_TIMEOUT = "gateway_timeout"                      # soft, infra
    LIMIT_EXCEEDED = "limit_exceeded"                        # soft
    CVV_MISMATCH = "cvv_mismatch"                            # hard, needs re-entry
    NO_FAILURE_CHECKOUT_ABANDONED = "no_failure_checkout_abandoned"
    INVOICE_OVERDUE = "invoice_overdue"                      # B2B, not a decline code


class DeclineClass(str, Enum):
    SOFT = "soft"        # retryable, transient
    HARD = "hard"         # not retryable as-is, needs customer action
    FRICTION = "friction"  # UX/flow issue, not a bank-side decline
    NOT_APPLICABLE = "not_applicable"


class RootCause(str, Enum):
    INSUFFICIENT_FUNDS = "insufficient_funds"
    EXPIRED_OR_INVALID_CARD = "expired_or_invalid_card"
    GATEWAY_DEGRADATION = "gateway_degradation"
    BANK_ISSUER_DOWNTIME = "bank_issuer_downtime"
    UI_CHECKOUT_FRICTION = "ui_checkout_friction"
    PRICE_HESITATION = "price_hesitation"
    B2B_CASHFLOW_DELAY = "b2b_cashflow_delay"
    B2B_INVOICE_DISPUTE_RISK = "b2b_invoice_dispute_risk"
    SUSPECTED_FRAUD_BLOCK = "suspected_fraud_block"
    UNKNOWN = "unknown"


class InterventionType(str, Enum):
    SILENT_AUTO_RETRY = "silent_auto_retry"
    SMART_RETRY_SCHEDULED = "smart_retry_scheduled"
    SMS_REMINDER = "sms_reminder"
    EMAIL_REMINDER = "email_reminder"
    HINGLISH_VOICE_CALL = "hinglish_voice_call"
    DYNAMIC_DISCOUNT_OFFER = "dynamic_discount_offer"
    UPDATE_PAYMENT_METHOD_LINK = "update_payment_method_link"
    B2B_ESCALATION_EMAIL = "b2b_escalation_email"
    B2B_ACCOUNT_MANAGER_HANDOFF = "b2b_account_manager_handoff"
    P2P_SOFT_REMINDER = "p2p_soft_reminder"
    NO_ACTION_SUPPRESSED = "no_action_suppressed"
    HUMAN_ESCALATION = "human_escalation"


class Channel(str, Enum):
    SYSTEM = "system"          # silent, backend-only (e.g. auto retry)
    SMS = "sms"
    EMAIL = "email"
    VOICE = "voice"
    NONE = "none"


class CaseStatus(str, Enum):
    DETECTED = "detected"
    DIAGNOSED = "diagnosed"
    CONTACTED = "contacted"
    PROMISE_TO_PAY = "promise_to_pay"
    RECOVERED = "recovered"
    STOPPED_COMPLIANCE = "stopped_compliance"
    STOPPED_MAX_ATTEMPTS = "stopped_max_attempts"
    ESCALATED_HUMAN = "escalated_human"
    FAILED_EXHAUSTED = "failed_exhausted"


class P2PStatus(str, Enum):
    NONE = "none"
    PROMISED = "promised"
    REMINDED = "reminded"
    KEPT = "kept"
    BROKEN = "broken"


class CustomerSegment(str, Enum):
    RETAIL_MASS = "retail_mass"
    RETAIL_PREMIUM = "retail_premium"
    SMB = "smb"
    ENTERPRISE = "enterprise"


class Language(str, Enum):
    ENGLISH = "english"
    HINGLISH = "hinglish"
    HINDI = "hindi"


class ComplianceCheckResult(str, Enum):
    PASS = "pass"
    BLOCKED = "blocked"


# --------------------------------------------------------------------------- #
# Core entities
# --------------------------------------------------------------------------- #

class Customer(BaseModel):
    customer_id: str = Field(default_factory=lambda: f"cust_{uuid4().hex[:10]}")
    name: str
    segment: CustomerSegment
    preferred_language: Language = Language.ENGLISH
    phone: str
    email: str
    timezone: str = "Asia/Kolkata"
    opted_out: bool = False
    dispute_flag: bool = False
    salary_cycle_day: Optional[int] = None  # day-of-month customer is typically paid
    lifetime_value_inr: float = 0.0
    is_irate: bool = False  # seeded flag for simulation realism


class Transaction(BaseModel):
    """Represents the at-risk revenue event: a failed charge, an abandoned
    cart, a degraded-gateway attempt, or a B2B invoice."""
    transaction_id: str = Field(default_factory=lambda: f"txn_{uuid4().hex[:10]}")
    customer_id: str
    scenario: ScenarioType
    amount: float
    currency: str = "INR"
    decline_code: DeclineCode
    decline_class: DeclineClass
    gateway: str = "razorpay"
    attempted_at: datetime = Field(default_factory=datetime.utcnow)
    due_date: Optional[datetime] = None          # for B2B invoices
    invoice_number: Optional[str] = None          # for B2B invoices
    product_name: str = "Subscription"
    retry_count: int = 0
    max_retries: int = 4


class InterventionLog(BaseModel):
    """One executed (or suppressed) action taken by the agent."""
    intervention_id: str = Field(default_factory=lambda: f"iv_{uuid4().hex[:10]}")
    case_id: str
    step_number: int
    intervention_type: InterventionType
    channel: Channel
    scheduled_for: datetime
    executed_at: Optional[datetime] = None
    message_language: Language = Language.ENGLISH
    message_template_id: str = ""
    message_text: str = ""
    confidence_score: float = 0.0
    reasoning: str = ""
    outcome: Optional[str] = None  # e.g. "recovered", "no_response", "p2p_made"
    suppressed: bool = False
    suppression_reason: Optional[str] = None


class AuditTrailEntry(BaseModel):
    """Immutable, append-only record of every decision and action.
    This is the artifact judges use to verify compliant, explainable behavior."""
    audit_id: str = Field(default_factory=lambda: f"audit_{uuid4().hex[:12]}")
    case_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    actor: str = "ai_recovery_agent"
    event_type: str = ""          # e.g. "diagnosis", "compliance_check", "intervention_executed"
    detail: str = ""
    compliance_check: ComplianceCheckResult = ComplianceCheckResult.PASS
    compliance_rule: Optional[str] = None
    data_snapshot: dict = Field(default_factory=dict)

    class Config:
        frozen = True  # immutability at the object level


class PromiseToPay(BaseModel):
    status: P2PStatus = P2PStatus.NONE
    promised_amount: Optional[float] = None
    promised_date: Optional[datetime] = None
    made_at: Optional[datetime] = None
    reminder_sent_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None


class RecoveryCase(BaseModel):
    """The full lifecycle wrapper for one at-risk revenue event as it moves
    through the agent's state machine."""
    case_id: str = Field(default_factory=lambda: f"case_{uuid4().hex[:10]}")
    customer: Customer
    transaction: Transaction
    status: CaseStatus = CaseStatus.DETECTED
    root_cause: Optional[RootCause] = None
    root_cause_confidence: float = 0.0
    contact_attempts: int = 0
    contact_timestamps: List[datetime] = Field(default_factory=list)
    first_detected_at: datetime = Field(default_factory=datetime.utcnow)
    amount_recovered: float = 0.0
    recovered_at: Optional[datetime] = None
    p2p: PromiseToPay = Field(default_factory=PromiseToPay)
    interventions: List[InterventionLog] = Field(default_factory=list)
    audit_trail: List[AuditTrailEntry] = Field(default_factory=list)
    stop_reason: Optional[str] = None
    escalated: bool = False

    def add_audit(self, event_type: str, detail: str,
                   compliance_check: ComplianceCheckResult = ComplianceCheckResult.PASS,
                   compliance_rule: Optional[str] = None, data_snapshot: Optional[dict] = None):
        entry = AuditTrailEntry(
            case_id=self.case_id,
            event_type=event_type,
            detail=detail,
            compliance_check=compliance_check,
            compliance_rule=compliance_rule,
            data_snapshot=data_snapshot or {},
        )
        self.audit_trail.append(entry)
        return entry


class RecoveryBatch(BaseModel):
    """A simulated run across N cases, produced by the batch runner."""
    batch_id: str = Field(default_factory=lambda: f"batch_{uuid4().hex[:8]}")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    cases: List[RecoveryCase] = Field(default_factory=list)

    # --- derived executive metrics (computed by batch_runner, cached here) ---
    total_revenue_at_risk: float = 0.0
    total_recovered: float = 0.0
    recovery_rate_pct: float = 0.0
    compliance_blocked_count: int = 0
    compliance_pass_count: int = 0
    audit_compliance_rate_pct: float = 100.0
    cases_by_status: dict = Field(default_factory=dict)
    cases_by_scenario: dict = Field(default_factory=dict)
