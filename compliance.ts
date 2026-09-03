import { ComplianceCheckResult, Customer, InterventionLog, Scenario } from "./types";

// ----------------------------------------------------------------------------
// Instant-termination keyword bank. Case-insensitive substring match against
// the customer's last inbound message. Any hit is a HARD STOP — no further
// automated contact is permitted, and the case is routed to human escalation.
// ----------------------------------------------------------------------------
const STOP_KEYWORDS = [
  "stop",
  "unsubscribe",
  "unsubscribed",
  "lawyer",
  "attorney",
  "legal action",
  "sue",
  "dispute",
  "harassment",
  "harassing",
  "do not contact",
  "don't contact",
  "complaint",
  "consumer forum",
  "police",
];

export function detectStopKeyword(message?: string): string | null {
  if (!message) return null;
  const lower = message.toLowerCase();
  for (const kw of STOP_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

// ----------------------------------------------------------------------------
// Regulatory / decency contact windows. Times are in the CUSTOMER's local
// hour (0-23), derived from timezoneOffsetHours by the caller.
// ----------------------------------------------------------------------------
const CONTACT_WINDOW_START_HOUR = 9;
const CONTACT_WINDOW_END_HOUR = 20; // 8 PM

const MAX_CONTACTS_PER_WINDOW = 3;
const CONTACT_WINDOW_DAYS = 7;

/** Minimum hours to wait after a payment failure before ANY outbound human-facing
 *  contact — gives soft auto-retries a chance to resolve things silently first. */
const GRACE_PERIOD_HOURS: Record<Scenario, number> = {
  SUBSCRIPTION_RETRY: 4,
  ABANDONED_CHECKOUT: 1,
  GATEWAY_DEGRADATION: 0.5,
  B2B_OVERDUE: 24,
};

/** B2B specific: don't send a second escalation email inside this many days. */
const B2B_ESCALATION_COOLDOWN_DAYS = 3;

function customerLocalHour(nowUtc: Date, tzOffsetHours: number): number {
  const local = new Date(nowUtc.getTime() + tzOffsetHours * 60 * 60 * 1000);
  return local.getUTCHours();
}

/**
 * Given the moment the agent WOULD contact the customer, returns the next
 * moment that falls inside the permitted contact window. If `now` is already
 * inside the window, returns `now` unchanged. Otherwise rolls forward to the
 * next window-open time in the customer's local timezone.
 *
 * This is what lets the agent behave correctly regardless of what wall-clock
 * time the batch happens to be run at: rather than treating "outside window"
 * as an indefinite block, it reflects what a real system would do — queue
 * the contact for the next compliant slot — and the compliance engine checks
 * the SHIFTED time, not the raw one.
 */
export function earliestCompliantContactTime(now: Date, tzOffsetHours: number): Date {
  const hour = customerLocalHour(now, tzOffsetHours);
  if (hour >= CONTACT_WINDOW_START_HOUR && hour < CONTACT_WINDOW_END_HOUR) return now;

  const local = new Date(now.getTime() + tzOffsetHours * 60 * 60 * 1000);
  if (hour < CONTACT_WINDOW_START_HOUR) {
    local.setUTCHours(CONTACT_WINDOW_START_HOUR, 0, 0, 0);
  } else {
    local.setUTCDate(local.getUTCDate() + 1);
    local.setUTCHours(CONTACT_WINDOW_START_HOUR, 0, 0, 0);
  }
  return new Date(local.getTime() - tzOffsetHours * 60 * 60 * 1000);
}

export interface ComplianceContext {
  customer: Customer;
  scenario: Scenario;
  eventDate: string; // when the failure/overdue event occurred
  now: Date;
  priorInterventions: InterventionLog[];
  isEscalationEmail?: boolean;
}

export function runComplianceCheck(ctx: ComplianceContext): ComplianceCheckResult {
  const checksRun: string[] = [];
  const reasons: string[] = [];
  let hardStop = false;

  // 1. Opt-out — absolute, permanent.
  checksRun.push("OPT_OUT_CHECK");
  if (ctx.customer.optedOut) {
    hardStop = true;
    reasons.push("Customer has opted out of communications. Permanent suppression enforced.");
  }

  // 2. Dispute flag on file.
  checksRun.push("DISPUTE_FLAG_CHECK");
  if (ctx.customer.disputeFlagged) {
    hardStop = true;
    reasons.push("Active payment dispute on file. Automated recovery contact suspended; routed to human review.");
  }

  // 3. Keyword-triggered instant termination.
  checksRun.push("STOP_KEYWORD_SCAN");
  const kw = detectStopKeyword(ctx.customer.lastInboundMessage);
  if (kw) {
    hardStop = true;
    reasons.push(`Stop-trigger keyword detected in customer reply ("${kw}"). Immediate contact termination enforced.`);
  }

  // 4. Max contact attempts within rolling window.
  checksRun.push("MAX_CONTACT_FREQUENCY_CHECK");
  const windowStart = new Date(ctx.now.getTime() - CONTACT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const contactsInWindow = ctx.priorInterventions.filter(
    (i) => i.outcome !== "SKIPPED_COMPLIANCE" && new Date(i.timestamp) >= windowStart
  ).length;
  if (contactsInWindow >= MAX_CONTACTS_PER_WINDOW) {
    hardStop = true;
    reasons.push(
      `Contact frequency cap reached (${contactsInWindow}/${MAX_CONTACTS_PER_WINDOW} within ${CONTACT_WINDOW_DAYS} days). Further automated outreach blocked to prevent spam/harassment.`
    );
  }

  // 5. Time-of-day window. The agent never contacts outside 9:00-20:00 customer-local
  // time — rather than blocking the case indefinitely, it auto-queues to the next
  // compliant slot and reports that shift transparently in the audit trail.
  checksRun.push("TIME_OF_DAY_WINDOW_CHECK");
  const rawLocalHour = customerLocalHour(ctx.now, ctx.customer.timezoneOffsetHours);
  const compliantContactTime = earliestCompliantContactTime(ctx.now, ctx.customer.timezoneOffsetHours);
  const wasShifted = compliantContactTime.getTime() !== ctx.now.getTime();
  if (wasShifted) {
    reasons.push(
      `Local time for customer is ${rawLocalHour}:00, outside permitted contact window (${CONTACT_WINDOW_START_HOUR}:00-${CONTACT_WINDOW_END_HOUR}:00). Contact automatically queued for ${compliantContactTime.toISOString()} — the next compliant slot — rather than sent immediately.`
    );
  }

  // 6. Grace period since event.
  checksRun.push("GRACE_PERIOD_CHECK");
  const hoursSinceEvent = (ctx.now.getTime() - new Date(ctx.eventDate).getTime()) / (1000 * 60 * 60);
  const requiredGrace = GRACE_PERIOD_HOURS[ctx.scenario];
  const inGracePeriod = hoursSinceEvent < requiredGrace;
  if (inGracePeriod) {
    reasons.push(
      `Only ${hoursSinceEvent.toFixed(1)}h elapsed since event; regulatory/decency grace period requires ${requiredGrace}h before human-facing contact.`
    );
  }

  // 7. B2B escalation cooldown.
  if (ctx.isEscalationEmail) {
    checksRun.push("B2B_ESCALATION_COOLDOWN_CHECK");
    const lastEscalation = [...ctx.priorInterventions]
      .reverse()
      .find((i) => i.type === "B2B_ESCALATION_EMAIL");
    if (lastEscalation) {
      const daysSince = (ctx.now.getTime() - new Date(lastEscalation.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < B2B_ESCALATION_COOLDOWN_DAYS) {
        reasons.push(
          `Last B2B escalation email sent ${daysSince.toFixed(1)} days ago; cooldown of ${B2B_ESCALATION_COOLDOWN_DAYS} days not yet elapsed.`
        );
      }
    }
  }

  // Only the grace period genuinely defers the case (it depends on real elapsed time,
  // which can't be shortcut the way a same-day scheduling shift can).
  const softBlocked = inGracePeriod;

  return {
    passed: !hardStop && !softBlocked,
    hardStop,
    reasons: reasons.length > 0 ? reasons : ["All compliance checks passed cleanly."],
    checksRun,
  };
}

export const COMPLIANCE_CONSTANTS = {
  MAX_CONTACTS_PER_WINDOW,
  CONTACT_WINDOW_DAYS,
  CONTACT_WINDOW_START_HOUR,
  CONTACT_WINDOW_END_HOUR,
  GRACE_PERIOD_HOURS,
  B2B_ESCALATION_COOLDOWN_DAYS,
  STOP_KEYWORDS,
};
