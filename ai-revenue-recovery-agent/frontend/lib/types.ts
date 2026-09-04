// Mirrors backend/app/models.py. Field names match the FastAPI JSON output
// (snake_case) exactly so no transform layer is needed.

export type ScenarioType =
  | "failed_subscription"
  | "abandoned_checkout"
  | "b2b_overdue_invoice"
  | "payment_degradation";

export type DeclineCode =
  | "insufficient_funds"
  | "expired_card"
  | "card_lost_stolen"
  | "issuer_down"
  | "do_not_honor"
  | "three_ds_failed"
  | "gateway_timeout"
  | "limit_exceeded"
  | "cvv_mismatch"
  | "no_failure_checkout_abandoned"
  | "invoice_overdue";

export type DeclineClass = "soft" | "hard" | "friction" | "not_applicable";

export type RootCause =
  | "insufficient_funds"
  | "expired_or_invalid_card"
  | "gateway_degradation"
  | "bank_issuer_downtime"
  | "ui_checkout_friction"
  | "price_hesitation"
  | "b2b_cashflow_delay"
  | "b2b_invoice_dispute_risk"
  | "suspected_fraud_block"
  | "unknown";

export type InterventionType =
  | "silent_auto_retry"
  | "smart_retry_scheduled"
  | "sms_reminder"
  | "email_reminder"
  | "hinglish_voice_call"
  | "dynamic_discount_offer"
  | "update_payment_method_link"
  | "b2b_escalation_email"
  | "b2b_account_manager_handoff"
  | "p2p_soft_reminder"
  | "no_action_suppressed"
  | "human_escalation";

export type Channel = "system" | "sms" | "email" | "voice" | "none";

export type CaseStatus =
  | "detected"
  | "diagnosed"
  | "contacted"
  | "promise_to_pay"
  | "recovered"
  | "stopped_compliance"
  | "stopped_max_attempts"
  | "escalated_human"
  | "failed_exhausted";

export type P2PStatus = "none" | "promised" | "reminded" | "kept" | "broken";
export type CustomerSegment = "retail_mass" | "retail_premium" | "smb" | "enterprise";
export type Language = "english" | "hinglish" | "hindi";
export type ComplianceCheckResult = "pass" | "blocked";

export interface Customer {
  customer_id: string;
  name: string;
  segment: CustomerSegment;
  preferred_language: Language;
  phone: string;
  email: string;
  timezone: string;
  opted_out: boolean;
  dispute_flag: boolean;
  salary_cycle_day: number | null;
  lifetime_value_inr: number;
  is_irate: boolean;
}

export interface Transaction {
  transaction_id: string;
  customer_id: string;
  scenario: ScenarioType;
  amount: number;
  currency: string;
  decline_code: DeclineCode;
  decline_class: DeclineClass;
  gateway: string;
  attempted_at: string;
  due_date: string | null;
  invoice_number: string | null;
  product_name: string;
  retry_count: number;
  max_retries: number;
}

export interface InterventionLog {
  intervention_id: string;
  case_id: string;
  step_number: number;
  intervention_type: InterventionType;
  channel: Channel;
  scheduled_for: string;
  executed_at: string | null;
  message_language: Language;
  message_template_id: string;
  message_text: string;
  confidence_score: number;
  reasoning: string;
  outcome: string | null;
  suppressed: boolean;
  suppression_reason: string | null;
}

export interface AuditTrailEntry {
  audit_id: string;
  case_id: string;
  timestamp: string;
  actor: string;
  event_type: string;
  detail: string;
  compliance_check: ComplianceCheckResult;
  compliance_rule: string | null;
  data_snapshot: Record<string, unknown>;
}

export interface PromiseToPay {
  status: P2PStatus;
  promised_amount: number | null;
  promised_date: string | null;
  made_at: string | null;
  reminder_sent_at: string | null;
  resolved_at: string | null;
}

export interface RecoveryCase {
  case_id: string;
  customer: Customer;
  transaction: Transaction;
  status: CaseStatus;
  root_cause: RootCause | null;
  root_cause_confidence: number;
  contact_attempts: number;
  contact_timestamps: string[];
  first_detected_at: string;
  amount_recovered: number;
  recovered_at: string | null;
  p2p: PromiseToPay;
  interventions: InterventionLog[];
  audit_trail: AuditTrailEntry[];
  stop_reason: string | null;
  escalated: boolean;
}

export interface RecoveryBatch {
  batch_id: string;
  created_at: string;
  cases: RecoveryCase[];
  total_revenue_at_risk: number;
  total_recovered: number;
  recovery_rate_pct: number;
  compliance_blocked_count: number;
  compliance_pass_count: number;
  audit_compliance_rate_pct: number;
  cases_by_status: Record<string, number>;
  cases_by_scenario: Record<string, number>;
}

export interface CompliancePolicy {
  max_contacts_per_window: number;
  contact_window_days: number;
  grace_period_hours_b2c: number;
  grace_period_hours_b2b: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
  max_voice_calls_per_case: number;
  termination_keywords: string[];
}
