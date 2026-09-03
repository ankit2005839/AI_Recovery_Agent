import { Customer, DiagnosisResult, Transaction } from "./types";
import { daysUntilNextSalaryCycle } from "./diagnosticEngine";

export interface RetryPlan {
  retryAt: string; // ISO timestamp
  reasoning: string[];
  shouldAutoRetry: boolean; // false => needs human-facing intervention instead (e.g. card update)
}

/** Known bank-side maintenance windows to avoid (local hour ranges, 24h). */
const BANK_MAINTENANCE_WINDOWS: Array<[number, number]> = [[2, 6]]; // 2 AM - 6 AM local

function isInMaintenanceWindow(localHour: number): boolean {
  return BANK_MAINTENANCE_WINDOWS.some(([start, end]) => localHour >= start && localHour < end);
}

function nextSafeHour(date: Date, tzOffsetHours: number, preferredHour: number): Date {
  const local = new Date(date.getTime() + tzOffsetHours * 60 * 60 * 1000);
  local.setUTCHours(preferredHour, 0, 0, 0);
  if (local.getTime() < date.getTime() + tzOffsetHours * 60 * 60 * 1000) {
    local.setUTCDate(local.getUTCDate() + 1);
  }
  // shift out of maintenance window if needed
  while (isInMaintenanceWindow(local.getUTCHours())) {
    local.setUTCHours(local.getUTCHours() + 1);
  }
  return new Date(local.getTime() - tzOffsetHours * 60 * 60 * 1000);
}

/**
 * Computes the optimal retry time for a failed mandate/charge based on:
 *  - Soft vs hard decline classification (gateway error code semantics)
 *  - Customer salary/cashflow cycle (for INSUFFICIENT_FUNDS)
 *  - Bank/gateway maintenance downtime windows
 *  - Escalating backoff across repeated attempts
 */
export function computeOptimalRetryTime(
  transaction: Transaction,
  customer: Customer,
  diagnosis: DiagnosisResult,
  now: Date
): RetryPlan {
  const reasoning: string[] = [];

  if (diagnosis.declineClass === "HARD" || diagnosis.declineClass === "FRAUD") {
    reasoning.push(
      "Hard decline / fraud signal — auto-retry on the same instrument would not succeed and risks issuer penalty flags. Routing to human-facing intervention (card update / escalation) instead of scheduling a retry."
    );
    return { retryAt: now.toISOString(), reasoning, shouldAutoRetry: false };
  }

  if (diagnosis.rootCause === "BANK_DOWNTIME" || diagnosis.rootCause === "GATEWAY_DEGRADATION") {
    const retryAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 min later
    reasoning.push(
      "Transient infra issue (bank/gateway downtime). Short 30-minute cooldown is sufficient — most infra blips clear within this window."
    );
    return { retryAt: retryAt.toISOString(), reasoning, shouldAutoRetry: true };
  }

  if (diagnosis.rootCause === "INSUFFICIENT_FUNDS") {
    const daysToSalary = daysUntilNextSalaryCycle(customer.salaryCycleDay, now.toISOString());
    // Escalating backoff: don't hammer immediately, wait for cash to land, cap wait at 5 days.
    const waitDays = Math.min(Math.max(daysToSalary, 1), 5);
    const target = new Date(now.getTime() + waitDays * 24 * 60 * 60 * 1000);
    const scheduled = nextSafeHour(target, customer.timezoneOffsetHours, 10); // 10 AM local
    reasoning.push(
      `Insufficient funds diagnosed. Customer's salary cycle suggests cash inflow in ~${daysToSalary} day(s). Scheduling retry ${waitDays} day(s) out at 10:00 local time, clear of the 2-6 AM bank maintenance window, to maximize odds of sufficient balance.`
    );
    // Add mild backoff for repeated attempts.
    if (transaction.attemptCount >= 2) {
      scheduled.setDate(scheduled.getDate() + 1);
      reasoning.push(`This is retry attempt #${transaction.attemptCount + 1} — adding 1 extra day of backoff to avoid repeated failed-attempt fees for the customer.`);
    }
    return { retryAt: scheduled.toISOString(), reasoning, shouldAutoRetry: true };
  }

  if (diagnosis.rootCause === "UI_FRICTION") {
    const retryAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2h later — a nudge, not a charge retry
    reasoning.push("UI friction / abandoned checkout — no charge to retry; scheduling a short-delay nudge message instead while intent is still fresh.");
    return { retryAt: retryAt.toISOString(), reasoning, shouldAutoRetry: false };
  }

  if (diagnosis.rootCause === "B2B_CASHFLOW_DELAY" || diagnosis.rootCause === "B2B_DISPUTE_RISK") {
    const retryAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // check back in 3 days
    reasoning.push("B2B receivable — no card retry applicable; scheduling next follow-up checkpoint in 3 days aligned with escalation cooldown.");
    return { retryAt: retryAt.toISOString(), reasoning, shouldAutoRetry: false };
  }

  reasoning.push("Root cause unresolved — defaulting to a conservative 24-hour re-evaluation window.");
  return { retryAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), reasoning, shouldAutoRetry: false };
}
