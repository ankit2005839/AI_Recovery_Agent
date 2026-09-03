import { Customer, DeclineClass, DiagnosisResult, GatewayErrorCode, RootCause, Transaction } from "./types";

// Maps each raw gateway error code to a decline classification. This is the
// backbone signal for both diagnosis and the retry sequencer's soft/hard
// decline branching.
const DECLINE_CLASS_MAP: Record<GatewayErrorCode, DeclineClass> = {
  INSUFFICIENT_FUNDS: "SOFT",
  ISSUER_TIMEOUT: "SOFT",
  BANK_SERVER_DOWN: "INFRA",
  EXPIRED_CARD: "HARD",
  STOLEN_LOST_CARD: "FRAUD",
  DO_NOT_HONOR: "SOFT",
  INVALID_CVV: "HARD",
  GATEWAY_TIMEOUT_5XX: "INFRA",
  UI_ABANDON_NO_ERROR: "NO_ATTEMPT",
  NONE: "NO_ATTEMPT",
};

export function classifyDecline(code: GatewayErrorCode): DeclineClass {
  return DECLINE_CLASS_MAP[code] ?? "SOFT";
}

/**
 * Root-cause classification engine. Combines the scenario type, the raw
 * gateway error code, transaction recency/attempt-count signals, and B2B
 * overdue aging to produce a root cause + confidence score + human-readable
 * reasoning trace (surfaced verbatim in the audit log / case detail viewer).
 */
export function diagnose(transaction: Transaction, customer: Customer): DiagnosisResult {
  const reasoning: string[] = [];
  const declineClass = classifyDecline(transaction.gatewayErrorCode);

  reasoning.push(
    `Scenario=${transaction.scenario}, gatewayErrorCode=${transaction.gatewayErrorCode}, declineClass=${declineClass}, attemptCount=${transaction.attemptCount}.`
  );

  // -------------------------------------------------------------
  // Fraud path — highest priority, short-circuits everything else
  // -------------------------------------------------------------
  if (declineClass === "FRAUD") {
    reasoning.push("Stolen/lost card signal from processor. Classifying as suspected fraud — no retry, route to human/security review.");
    return { rootCause: "SUSPECTED_FRAUD", declineClass, confidence: 0.95, reasoning };
  }

  // -------------------------------------------------------------
  // B2B overdue receivables
  // -------------------------------------------------------------
  if (transaction.scenario === "B2B_OVERDUE") {
    const overdue = transaction.daysOverdue ?? 0;
    if (customer.disputeFlagged) {
      reasoning.push("Customer has an active dispute flag — classifying as dispute risk rather than simple cashflow delay.");
      return { rootCause: "B2B_DISPUTE_RISK", declineClass, confidence: 0.9, reasoning };
    }
    const confidence = overdue > 60 ? 0.7 : 0.85;
    reasoning.push(
      overdue > 60
        ? `Invoice is ${overdue} days overdue — extended delay lowers confidence that this is simple cashflow timing; escalation path recommended.`
        : `Invoice is ${overdue} days overdue — within typical B2B cashflow-timing range. Treating as routine cashflow delay.`
    );
    return { rootCause: "B2B_CASHFLOW_DELAY", declineClass, confidence, reasoning };
  }

  // -------------------------------------------------------------
  // Abandoned checkout — no payment attempt at all
  // -------------------------------------------------------------
  if (transaction.scenario === "ABANDONED_CHECKOUT" && declineClass === "NO_ATTEMPT") {
    reasoning.push("No gateway error recorded and checkout was not completed — classifying as UI/flow friction rather than a payment failure.");
    return { rootCause: "UI_FRICTION", declineClass, confidence: 0.8, reasoning };
  }

  // -------------------------------------------------------------
  // Infra / gateway degradation
  // -------------------------------------------------------------
  if (declineClass === "INFRA") {
    if (transaction.gatewayErrorCode === "BANK_SERVER_DOWN") {
      reasoning.push("Issuing bank's server reported downtime at time of attempt — classifying as bank downtime, not customer-caused.");
      return { rootCause: "BANK_DOWNTIME", declineClass, confidence: 0.88, reasoning };
    }
    reasoning.push("Gateway returned a 5xx-class timeout — classifying as payment gateway degradation, independent of customer's funding status.");
    return { rootCause: "GATEWAY_DEGRADATION", declineClass, confidence: 0.85, reasoning };
  }

  // -------------------------------------------------------------
  // Hard declines
  // -------------------------------------------------------------
  if (declineClass === "HARD") {
    reasoning.push(
      transaction.gatewayErrorCode === "EXPIRED_CARD"
        ? "Card expiry detected — retrying the same instrument will not succeed; customer must update payment method."
        : "CVV/hard validation failure — retrying without new card details will not succeed."
    );
    return { rootCause: "EXPIRED_CARD", declineClass, confidence: 0.92, reasoning };
  }

  // -------------------------------------------------------------
  // Soft declines — the largest, most nuanced bucket
  // -------------------------------------------------------------
  if (declineClass === "SOFT") {
    if (transaction.gatewayErrorCode === "INSUFFICIENT_FUNDS") {
      const daysToSalary = daysUntilNextSalaryCycle(customer.salaryCycleDay, transaction.eventDate);
      reasoning.push(
        `Insufficient funds at time of attempt. Customer's salary cycle day is ${customer.salaryCycleDay}; ${daysToSalary} day(s) until next likely cash inflow. Recommending timed retry rather than immediate retry.`
      );
      return { rootCause: "INSUFFICIENT_FUNDS", declineClass, confidence: 0.87, reasoning };
    }
    if (transaction.gatewayErrorCode === "ISSUER_TIMEOUT") {
      reasoning.push("Issuer timeout is transient and often self-resolves — classifying as bank downtime pattern.");
      return { rootCause: "BANK_DOWNTIME", declineClass, confidence: 0.7, reasoning };
    }
    reasoning.push("Ambiguous soft decline (DO_NOT_HONOR) — treating conservatively as insufficient-funds-like with lower confidence.");
    return { rootCause: "INSUFFICIENT_FUNDS", declineClass, confidence: 0.55, reasoning };
  }

  reasoning.push("No strong signal matched known patterns — falling back to UNKNOWN for manual/human triage.");
  return { rootCause: "UNKNOWN", declineClass, confidence: 0.3, reasoning };
}

export function daysUntilNextSalaryCycle(salaryCycleDay: number, fromIso: string): number {
  const from = new Date(fromIso);
  const day = from.getUTCDate();
  const daysInMonth = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0)).getUTCDate();
  if (salaryCycleDay >= day) {
    return salaryCycleDay - day;
  }
  return daysInMonth - day + salaryCycleDay;
}
