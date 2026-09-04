import type {
  CaseStatus, ScenarioType, InterventionType, Channel, DeclineCode,
  RootCause, ComplianceCheckResult, Language,
} from "./types";

export function inr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export const STATUS_LABEL: Record<CaseStatus, string> = {
  detected: "Detected",
  diagnosed: "Diagnosed",
  contacted: "Contacted",
  promise_to_pay: "Promise to Pay",
  recovered: "Recovered",
  stopped_compliance: "Stopped — Compliance",
  stopped_max_attempts: "Stopped — Max Attempts",
  escalated_human: "Escalated to Human",
  failed_exhausted: "Exhausted",
};

export const STATUS_COLOR: Record<CaseStatus, { bg: string; text: string; dot: string }> = {
  detected: { bg: "bg-paper-raised", text: "text-ink-muted", dot: "bg-ink-muted" },
  diagnosed: { bg: "bg-ledger-pale", text: "text-ledger", dot: "bg-ledger" },
  contacted: { bg: "bg-ledger-pale", text: "text-ledger", dot: "bg-ledger-light" },
  promise_to_pay: { bg: "bg-risk-pale", text: "text-risk", dot: "bg-risk" },
  recovered: { bg: "bg-recovered-pale", text: "text-recovered", dot: "bg-recovered" },
  stopped_compliance: { bg: "bg-stopped-pale", text: "text-stopped", dot: "bg-stopped" },
  stopped_max_attempts: { bg: "bg-stopped-pale", text: "text-stopped", dot: "bg-stopped" },
  escalated_human: { bg: "bg-escalate-pale", text: "text-escalate", dot: "bg-escalate" },
  failed_exhausted: { bg: "bg-stopped-pale", text: "text-stopped", dot: "bg-ink-muted" },
};

export const SCENARIO_LABEL: Record<ScenarioType, string> = {
  failed_subscription: "Failed Subscription / Card Retry",
  abandoned_checkout: "Abandoned Checkout",
  b2b_overdue_invoice: "B2B Overdue Invoice",
  payment_degradation: "Payment Degradation",
};

export const SCENARIO_SHORT: Record<ScenarioType, string> = {
  failed_subscription: "Subscription",
  abandoned_checkout: "Checkout",
  b2b_overdue_invoice: "B2B Invoice",
  payment_degradation: "Gateway",
};

export const INTERVENTION_LABEL: Record<InterventionType, string> = {
  silent_auto_retry: "Silent Auto-Retry",
  smart_retry_scheduled: "Smart Retry (Scheduled)",
  sms_reminder: "SMS Reminder",
  email_reminder: "Email Reminder",
  hinglish_voice_call: "Hinglish Voice Call",
  dynamic_discount_offer: "Dynamic Discount Offer",
  update_payment_method_link: "Update Payment Method Link",
  b2b_escalation_email: "B2B Escalation Email",
  b2b_account_manager_handoff: "Account Manager Handoff",
  p2p_soft_reminder: "P2P Soft Reminder",
  no_action_suppressed: "No Action (Suppressed)",
  human_escalation: "Human Escalation",
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  system: "System",
  sms: "SMS",
  email: "Email",
  voice: "Voice",
  none: "—",
};

export const DECLINE_LABEL: Record<DeclineCode, string> = {
  insufficient_funds: "Insufficient Funds",
  expired_card: "Expired Card",
  card_lost_stolen: "Card Lost / Stolen",
  issuer_down: "Issuer Downtime",
  do_not_honor: "Do Not Honor",
  three_ds_failed: "3-D Secure Failed",
  gateway_timeout: "Gateway Timeout",
  limit_exceeded: "Limit Exceeded",
  cvv_mismatch: "CVV Mismatch",
  no_failure_checkout_abandoned: "No Failure — Abandoned",
  invoice_overdue: "Invoice Overdue",
};

export const ROOT_CAUSE_LABEL: Record<RootCause, string> = {
  insufficient_funds: "Insufficient Funds",
  expired_or_invalid_card: "Expired / Invalid Card",
  gateway_degradation: "Gateway Degradation",
  bank_issuer_downtime: "Bank / Issuer Downtime",
  ui_checkout_friction: "UI Checkout Friction",
  price_hesitation: "Price Hesitation",
  b2b_cashflow_delay: "B2B Cash-flow Delay",
  b2b_invoice_dispute_risk: "B2B Dispute Risk",
  suspected_fraud_block: "Suspected Fraud Block",
  unknown: "Unknown",
};

export const LANGUAGE_LABEL: Record<Language, string> = {
  english: "English",
  hinglish: "Hinglish",
  hindi: "Hindi",
};

export const COMPLIANCE_COLOR: Record<ComplianceCheckResult, string> = {
  pass: "text-recovered",
  blocked: "text-stopped",
};
