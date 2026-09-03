// ============================================================================
// CORE DOMAIN TYPES — AI Revenue Recovery Agent
// ============================================================================

export type Scenario =
  | "SUBSCRIPTION_RETRY" // (a) Failed subscription / card retry
  | "ABANDONED_CHECKOUT" // (b) Abandoned checkout
  | "B2B_OVERDUE" // (c) B2B overdue invoices
  | "GATEWAY_DEGRADATION"; // (d) Payment degradation / gateway issues

export type Currency = "INR" | "USD";

export type CustomerSegment = "RETAIL_MASS" | "RETAIL_PREMIUM" | "SMB" | "ENTERPRISE";

export type LanguagePreference = "ENGLISH" | "HINGLISH" | "HINDI";

export type Channel = "SMS" | "EMAIL" | "VOICE_CALL" | "WHATSAPP" | "IN_APP_NUDGE";

// ----------------------------------------------------------------------------
// Customer
// ----------------------------------------------------------------------------
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  segment: CustomerSegment;
  language: LanguagePreference;
  /** Day of month (1-28) customer's salary/cashflow typically lands - used by retry sequencer */
  salaryCycleDay: number;
  /** UTC offset in hours, used to enforce time-of-day contact windows */
  timezoneOffsetHours: number;
  /** Hard privacy/compliance flags */
  optedOut: boolean;
  disputeFlagged: boolean;
  /** Free-text of the customer's last inbound reply, used for keyword-triggered stop rules */
  lastInboundMessage?: string;
  /** Relationship history signal (0-1). Higher = more trustworthy, allows lighter-touch interventions */
  loyaltyScore: number;
}

// ----------------------------------------------------------------------------
// Gateway error taxonomy (subset of common processor decline codes)
// ----------------------------------------------------------------------------
export type GatewayErrorCode =
  | "INSUFFICIENT_FUNDS" // soft decline
  | "ISSUER_TIMEOUT" // soft decline
  | "BANK_SERVER_DOWN" // soft decline (infra)
  | "EXPIRED_CARD" // hard decline
  | "STOLEN_LOST_CARD" // hard decline (fraud path)
  | "DO_NOT_HONOR" // ambiguous - treated as soft w/ caution
  | "INVALID_CVV" // hard decline
  | "GATEWAY_TIMEOUT_5XX" // infra degradation
  | "UI_ABANDON_NO_ERROR" // no payment attempted - friction
  | "NONE";

export type DeclineClass = "SOFT" | "HARD" | "FRAUD" | "INFRA" | "NO_ATTEMPT";

// ----------------------------------------------------------------------------
// Transaction / Invoice — the unit of revenue at risk
// ----------------------------------------------------------------------------
export interface Transaction {
  id: string;
  customerId: string;
  scenario: Scenario;
  amount: number;
  currency: Currency;
  /** ISO date the payment failed / invoice became due */
  eventDate: string;
  /** For B2B: invoice due date; for subscriptions: next billing date */
  dueDate: string;
  gatewayErrorCode: GatewayErrorCode;
  attemptCount: number;
  /** For B2B specifically */
  daysOverdue?: number;
  description: string;
}

// ----------------------------------------------------------------------------
// Root cause classification
// ----------------------------------------------------------------------------
export type RootCause =
  | "INSUFFICIENT_FUNDS"
  | "EXPIRED_CARD"
  | "GATEWAY_DEGRADATION"
  | "UI_FRICTION"
  | "BANK_DOWNTIME"
  | "SUSPECTED_FRAUD"
  | "B2B_CASHFLOW_DELAY"
  | "B2B_DISPUTE_RISK"
  | "UNKNOWN";

export interface DiagnosisResult {
  rootCause: RootCause;
  declineClass: DeclineClass;
  confidence: number; // 0-1
  reasoning: string[];
}

// ----------------------------------------------------------------------------
// Intervention
// ----------------------------------------------------------------------------
export type InterventionType =
  | "SOFT_AUTO_RETRY"
  | "SMS_REMINDER"
  | "EMAIL_NUDGE"
  | "WHATSAPP_NUDGE"
  | "DYNAMIC_DISCOUNT_OFFER"
  | "HINGLISH_VOICE_CALL"
  | "CARD_UPDATE_REQUEST"
  | "B2B_ESCALATION_EMAIL"
  | "B2B_PAYMENT_PLAN_OFFER"
  | "IN_APP_NUDGE"
  | "HUMAN_ESCALATION"
  | "TERMINATE_NO_ACTION";

export interface InterventionDecision {
  type: InterventionType;
  channel: Channel;
  reasoning: string[];
  confidence: number;
}

// ----------------------------------------------------------------------------
// Promise-to-Pay state machine
// ----------------------------------------------------------------------------
export type P2PStatus = "NONE" | "PENDING" | "REMINDER_SCHEDULED" | "FULFILLED" | "BROKEN";

export interface PromiseToPay {
  status: P2PStatus;
  promisedDate?: string;
  createdAt?: string;
  reminderAt?: string;
  brokenReason?: string;
}

// ----------------------------------------------------------------------------
// Compliance
// ----------------------------------------------------------------------------
export interface ComplianceCheckResult {
  passed: boolean;
  hardStop: boolean;
  reasons: string[];
  checksRun: string[];
}

// ----------------------------------------------------------------------------
// Case state machine
// ----------------------------------------------------------------------------
export type CaseState =
  | "DETECTED"
  | "DIAGNOSING"
  | "DIAGNOSED"
  | "SELECTING_INTERVENTION"
  | "COMPLIANCE_CHECK"
  | "CONTACTING"
  | "AWAITING_RESPONSE"
  | "PROMISED"
  | "RECOVERED"
  | "FAILED"
  | "STOPPED"
  | "ESCALATED";

// ----------------------------------------------------------------------------
// Immutable Audit Trail
// ----------------------------------------------------------------------------
export interface AuditTrailEntry {
  id: string;
  caseId: string;
  sequence: number;
  timestamp: string;
  actor: "AGENT" | "SYSTEM" | "COMPLIANCE_ENGINE";
  action: string;
  stateBefore: CaseState;
  stateAfter: CaseState;
  reasoning: string[];
  complianceChecks?: ComplianceCheckResult;
  /** Chained hash of previous entry — demonstrates tamper-evidence / immutability */
  prevHash: string;
  hash: string;
}

// ----------------------------------------------------------------------------
// Intervention Log — every outbound action taken
// ----------------------------------------------------------------------------
export interface InterventionLog {
  id: string;
  caseId: string;
  timestamp: string;
  type: InterventionType;
  channel: Channel;
  messageText: string;
  language: LanguagePreference;
  confidence: number;
  outcome: "SENT" | "SKIPPED_COMPLIANCE" | "SIMULATED_RESPONSE_POSITIVE" | "SIMULATED_RESPONSE_NEGATIVE" | "NO_RESPONSE";
}

// ----------------------------------------------------------------------------
// Full case record produced by the orchestrator
// ----------------------------------------------------------------------------
export interface RecoveryCase {
  id: string;
  customer: Customer;
  transaction: Transaction;
  currentState: CaseState;
  diagnosis?: DiagnosisResult;
  interventions: InterventionLog[];
  promiseToPay: PromiseToPay;
  auditTrail: AuditTrailEntry[];
  contactAttemptsInWindow: number;
  recoveredAmount: number;
  optimalRetryTime?: string;
  finalOutcome?: "RECOVERED" | "PARTIAL" | "UNRECOVERED" | "STOPPED_COMPLIANCE" | "ESCALATED_HUMAN";
}

// ----------------------------------------------------------------------------
// Batch
// ----------------------------------------------------------------------------
export interface BatchMetrics {
  totalCases: number;
  totalRevenueAtRisk: number;
  totalRecovered: number;
  recoveryRatePct: number;
  complianceRatePct: number;
  stoppedForCompliance: number;
  escalatedToHuman: number;
  promisesToPay: number;
  promisesFulfilled: number;
  byScenario: Record<Scenario, { count: number; recovered: number; atRisk: number }>;
  currency: Currency;
}

export interface RecoveryBatch {
  id: string;
  createdAt: string;
  cases: RecoveryCase[];
  metrics: BatchMetrics;
}
