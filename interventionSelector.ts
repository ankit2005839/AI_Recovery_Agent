import { Channel, Customer, DiagnosisResult, InterventionDecision, Transaction } from "./types";

/**
 * Intervention selector matrix. Given the diagnosed root cause, the scenario,
 * customer segment/loyalty, and how many attempts have already been made,
 * selects the single best next action. Ordering matters — checked top to
 * bottom, most restrictive/terminal conditions first.
 */
export function selectIntervention(
  diagnosis: DiagnosisResult,
  transaction: Transaction,
  customer: Customer
): InterventionDecision {
  const reasoning: string[] = [];
  const attempt = transaction.attemptCount;

  // ---------------------------------------------------------------
  // Fraud → never contact for recovery, hand to human/security team
  // ---------------------------------------------------------------
  if (diagnosis.rootCause === "SUSPECTED_FRAUD") {
    reasoning.push("Suspected fraud — no automated recovery messaging. Immediate human/security escalation.");
    return { type: "HUMAN_ESCALATION", channel: "EMAIL", reasoning, confidence: 0.95 };
  }

  // ---------------------------------------------------------------
  // B2B dispute risk → escalate to human account manager, not agent
  // ---------------------------------------------------------------
  if (diagnosis.rootCause === "B2B_DISPUTE_RISK") {
    reasoning.push("Dispute risk on a B2B account — automated escalation emails could inflame the relationship. Routing to human account manager.");
    return { type: "HUMAN_ESCALATION", channel: "EMAIL", reasoning, confidence: 0.85 };
  }

  // ---------------------------------------------------------------
  // Expired/invalid card → must collect a new instrument, not retry
  // ---------------------------------------------------------------
  if (diagnosis.rootCause === "EXPIRED_CARD") {
    const channel: Channel = customer.segment === "RETAIL_PREMIUM" ? "WHATSAPP" : "SMS";
    reasoning.push("Hard decline due to card validity — sending a direct card-update link is the only action that can resolve this.");
    return { type: "CARD_UPDATE_REQUEST", channel, reasoning, confidence: 0.9 };
  }

  // ---------------------------------------------------------------
  // Bank downtime / gateway degradation → silent auto-retry, no contact
  // ---------------------------------------------------------------
  if (diagnosis.rootCause === "BANK_DOWNTIME" || diagnosis.rootCause === "GATEWAY_DEGRADATION") {
    reasoning.push("Infra-side failure, not customer-caused — resolving with a silent automated retry avoids unnecessary customer disturbance.");
    return { type: "SOFT_AUTO_RETRY", channel: "IN_APP_NUDGE", reasoning, confidence: 0.8 };
  }

  // ---------------------------------------------------------------
  // Insufficient funds → attempt count driven ladder
  // ---------------------------------------------------------------
  if (diagnosis.rootCause === "INSUFFICIENT_FUNDS") {
    if (attempt === 0) {
      reasoning.push("First soft decline — silent auto-retry scheduled around salary cycle before any human-facing contact.");
      return { type: "SOFT_AUTO_RETRY", channel: "IN_APP_NUDGE", reasoning, confidence: 0.75 };
    }
    if (attempt === 1) {
      const channel: Channel = customer.language === "HINGLISH" ? "WHATSAPP" : "SMS";
      reasoning.push("Second failure — escalating to a lightweight SMS/WhatsApp reminder ahead of the scheduled retry.");
      return { type: "SMS_REMINDER", channel, reasoning, confidence: 0.7 };
    }
    if (attempt === 2 && customer.segment !== "ENTERPRISE") {
      reasoning.push("Third failure with retail/SMB customer — a small dynamic discount can offset friction and nudge completion.");
      return { type: "DYNAMIC_DISCOUNT_OFFER", channel: "EMAIL", reasoning, confidence: 0.65 };
    }
    reasoning.push("Repeated failures — higher-touch human-toned voice outreach is warranted before giving up on recovery.");
    return { type: "HINGLISH_VOICE_CALL", channel: "VOICE_CALL", reasoning, confidence: 0.6 };
  }

  // ---------------------------------------------------------------
  // UI friction (abandoned checkout) → nudge back into the funnel
  // ---------------------------------------------------------------
  if (diagnosis.rootCause === "UI_FRICTION") {
    if (attempt === 0) {
      reasoning.push("Fresh cart abandonment — a same-session nudge while intent is warm converts best.");
      return { type: "IN_APP_NUDGE", channel: "IN_APP_NUDGE", reasoning, confidence: 0.6 };
    }
    if (customer.loyaltyScore > 0.6) {
      reasoning.push("Loyal customer abandoned checkout — a modest discount is a cost-effective way to close the loop.");
      return { type: "DYNAMIC_DISCOUNT_OFFER", channel: "EMAIL", reasoning, confidence: 0.68 };
    }
    reasoning.push("Standard abandoned-checkout reminder via SMS/WhatsApp based on language preference.");
    return {
      type: "SMS_REMINDER",
      channel: customer.language === "HINGLISH" ? "WHATSAPP" : "SMS",
      reasoning,
      confidence: 0.6,
    };
  }

  // ---------------------------------------------------------------
  // B2B cashflow delay → tiered escalation by days overdue
  // ---------------------------------------------------------------
  if (diagnosis.rootCause === "B2B_CASHFLOW_DELAY") {
    const overdue = transaction.daysOverdue ?? 0;
    if (overdue <= 15) {
      reasoning.push("Early-stage overdue invoice — a friendly email nudge is proportionate.");
      return { type: "EMAIL_NUDGE", channel: "EMAIL", reasoning, confidence: 0.7 };
    }
    if (overdue <= 45) {
      reasoning.push("Mid-stage overdue invoice — offering a structured payment plan preserves the relationship while pursuing recovery.");
      return { type: "B2B_PAYMENT_PLAN_OFFER", channel: "EMAIL", reasoning, confidence: 0.65 };
    }
    reasoning.push("Long overdue (45+ days) — formal escalation email required, subject to cooldown compliance checks.");
    return { type: "B2B_ESCALATION_EMAIL", channel: "EMAIL", reasoning, confidence: 0.75 };
  }

  reasoning.push("No confident root cause match — deferring to human triage rather than guessing an action.");
  return { type: "HUMAN_ESCALATION", channel: "EMAIL", reasoning, confidence: 0.4 };
}
