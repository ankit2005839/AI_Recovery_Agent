import { appendAuditEntry, resetAuditSequence } from "./auditTrail";
import { runComplianceCheck } from "./compliance";
import { diagnose } from "./diagnosticEngine";
import { selectIntervention } from "./interventionSelector";
import { generateMessage, generateP2PSoftReminder } from "./messageGenerator";
import { MockCasePair } from "./mockData";
import { createPromise } from "./p2pStateMachine";
import { computeOptimalRetryTime } from "./retrySequencer";
import {
  AuditTrailEntry,
  BatchMetrics,
  CaseState,
  Currency,
  InterventionLog,
  RecoveryBatch,
  RecoveryCase,
  Scenario,
} from "./types";

// Simple seeded PRNG reused for deterministic "simulated customer response" outcomes.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let caseCounter = 1;

/**
 * Runs a single case through the full agent pipeline:
 * DETECTED -> DIAGNOSING -> DIAGNOSED -> SELECTING_INTERVENTION ->
 * COMPLIANCE_CHECK -> CONTACTING -> AWAITING_RESPONSE -> (PROMISED |
 * RECOVERED | FAILED | STOPPED | ESCALATED)
 *
 * Every transition is written to the immutable, hash-chained audit trail.
 */
export function runCase(pair: MockCasePair, now: Date, rand: () => number): RecoveryCase {
  const { customer, transaction } = pair;
  const caseId = `case_${String(caseCounter++).padStart(4, "0")}`;
  const auditTrail: AuditTrailEntry[] = [];
  const interventions: InterventionLog[] = [];

  let state: CaseState = "DETECTED";
  appendAuditEntry(auditTrail, {
    caseId,
    actor: "SYSTEM",
    action: "Revenue-at-risk event detected and ingested into recovery pipeline.",
    stateBefore: "DETECTED",
    stateAfter: "DETECTED",
    reasoning: [`Scenario: ${transaction.scenario}. Amount at risk: ${transaction.currency} ${transaction.amount}.`],
    timestamp: now.toISOString(),
  });

  // ---------------- DIAGNOSING ----------------
  const prevState = state;
  state = "DIAGNOSING";
  const diagnosis = diagnose(transaction, customer);
  state = "DIAGNOSED";
  appendAuditEntry(auditTrail, {
    caseId,
    actor: "AGENT",
    action: `Diagnosed root cause as ${diagnosis.rootCause} (confidence ${(diagnosis.confidence * 100).toFixed(0)}%).`,
    stateBefore: prevState,
    stateAfter: state,
    reasoning: diagnosis.reasoning,
    timestamp: now.toISOString(),
  });

  // ---------------- RETRY SEQUENCING ----------------
  const retryPlan = computeOptimalRetryTime(transaction, customer, diagnosis, now);
  appendAuditEntry(auditTrail, {
    caseId,
    actor: "AGENT",
    action: retryPlan.shouldAutoRetry
      ? `Scheduled optimal auto-retry at ${retryPlan.retryAt}.`
      : `Determined auto-retry is not appropriate; human-facing intervention required.`,
    stateBefore: state,
    stateAfter: state,
    reasoning: retryPlan.reasoning,
    timestamp: now.toISOString(),
  });

  // ---------------- SELECTING INTERVENTION ----------------
  const prevState2 = state;
  state = "SELECTING_INTERVENTION";
  const intervention = selectIntervention(diagnosis, transaction, customer);
  appendAuditEntry(auditTrail, {
    caseId,
    actor: "AGENT",
    action: `Selected intervention: ${intervention.type} via ${intervention.channel} (confidence ${(intervention.confidence * 100).toFixed(0)}%).`,
    stateBefore: prevState2,
    stateAfter: state,
    reasoning: intervention.reasoning,
    timestamp: now.toISOString(),
  });

  // ---------------- COMPLIANCE CHECK ----------------
  const prevState3 = state;
  state = "COMPLIANCE_CHECK";
  const compliance = runComplianceCheck({
    customer,
    scenario: transaction.scenario,
    eventDate: transaction.eventDate,
    now,
    priorInterventions: interventions,
    isEscalationEmail: intervention.type === "B2B_ESCALATION_EMAIL",
  });
  appendAuditEntry(auditTrail, {
    caseId,
    actor: "COMPLIANCE_ENGINE",
    action: compliance.hardStop
      ? "COMPLIANCE HARD STOP — automated contact blocked."
      : compliance.passed
      ? "All compliance checks passed — contact authorized."
      : "Compliance check deferred contact (soft block) — outside window or within grace period.",
    stateBefore: prevState3,
    stateAfter: state,
    reasoning: compliance.reasons,
    complianceChecks: compliance,
    timestamp: now.toISOString(),
  });

  const result: RecoveryCase = {
    id: caseId,
    customer,
    transaction,
    currentState: state,
    diagnosis,
    interventions,
    promiseToPay: { status: "NONE" },
    auditTrail,
    contactAttemptsInWindow: 0,
    recoveredAmount: 0,
    optimalRetryTime: retryPlan.retryAt,
  };

  // ---------------- HARD STOP PATH ----------------
  if (compliance.hardStop) {
    const before = state;
    // Route based on WHY the stop fired: opt-out or a plain "stop/unsubscribe" style
    // keyword is a clean suppression (STOPPED, no human follow-up needed). A dispute
    // flag, or a keyword implying legal/escalation risk (lawyer, sue, complaint,
    // police, consumer forum), needs a human to actually resolve it (ESCALATED).
    const escalationKeywords = ["lawyer", "attorney", "legal action", "sue", "harassment", "harassing", "complaint", "consumer forum", "police"];
    const lastMsg = customer.lastInboundMessage?.toLowerCase() ?? "";
    const impliesEscalation = customer.disputeFlagged || escalationKeywords.some((k) => lastMsg.includes(k));
    state = impliesEscalation ? "ESCALATED" : "STOPPED";
    appendAuditEntry(auditTrail, {
      caseId,
      actor: "SYSTEM",
      action: `Case terminated via guardrail. Final state: ${state}.`,
      stateBefore: before,
      stateAfter: state,
      reasoning: ["No further automated action will be taken on this case per compliance policy."],
      timestamp: now.toISOString(),
    });
    result.currentState = state;
    result.finalOutcome = state === "STOPPED" ? "STOPPED_COMPLIANCE" : "ESCALATED_HUMAN";
    return result;
  }

  // ---------------- HUMAN ESCALATION (non-compliance-driven, e.g. fraud/dispute) ----------------
  if (intervention.type === "HUMAN_ESCALATION") {
    const before = state;
    state = "ESCALATED";
    appendAuditEntry(auditTrail, {
      caseId,
      actor: "AGENT",
      action: "Case routed to human agent — outside automated agent's authority to resolve.",
      stateBefore: before,
      stateAfter: state,
      reasoning: intervention.reasoning,
      timestamp: now.toISOString(),
    });
    result.currentState = state;
    result.finalOutcome = "ESCALATED_HUMAN";
    return result;
  }

  // ---------------- SOFT BLOCK (deferred, not stopped) ----------------
  if (!compliance.passed) {
    const before = state;
    state = "AWAITING_RESPONSE";
    appendAuditEntry(auditTrail, {
      caseId,
      actor: "SYSTEM",
      action: "Contact deferred to next compliant window; case parked for re-evaluation.",
      stateBefore: before,
      stateAfter: state,
      reasoning: ["Will re-attempt once inside the permitted contact window / past grace period."],
      timestamp: now.toISOString(),
    });
    result.currentState = state;
    result.finalOutcome = "UNRECOVERED";
    return result;
  }

  // ---------------- CONTACTING ----------------
  const beforeContact = state;
  state = "CONTACTING";
  const messageText = generateMessage(intervention.type, customer, transaction, { discountPct: 10 });
  const log: InterventionLog = {
    id: `int_${caseId}_${interventions.length + 1}`,
    caseId,
    timestamp: now.toISOString(),
    type: intervention.type,
    channel: intervention.channel,
    messageText,
    language: customer.language,
    confidence: intervention.confidence,
    outcome: "SENT",
  };
  interventions.push(log);
  result.contactAttemptsInWindow += 1;
  appendAuditEntry(auditTrail, {
    caseId,
    actor: "AGENT",
    action: `Executed intervention "${intervention.type}" via ${intervention.channel}.`,
    stateBefore: beforeContact,
    stateAfter: state,
    reasoning: [`Message dispatched to ${intervention.channel}.`, `Confidence score: ${(intervention.confidence * 100).toFixed(0)}%.`],
    timestamp: now.toISOString(),
  });

  // ---------------- SIMULATED CUSTOMER RESPONSE ----------------
  const beforeResponse = state;
  state = "AWAITING_RESPONSE";
  const outcomeRoll = rand();
  // Response probability weighted by diagnosis confidence, intervention confidence, and loyalty.
  const successProbability = clamp(
    0.15 + diagnosis.confidence * 0.25 + intervention.confidence * 0.35 + customer.loyaltyScore * 0.15,
    0.05,
    0.92
  );

  if (outcomeRoll < successProbability * 0.6) {
    // Immediate recovery.
    log.outcome = "SIMULATED_RESPONSE_POSITIVE";
    const beforeRec = state;
    state = "RECOVERED";
    result.recoveredAmount = transaction.amount;
    appendAuditEntry(auditTrail, {
      caseId,
      actor: "SYSTEM",
      action: `Payment recovered in full: ${transaction.currency} ${transaction.amount}.`,
      stateBefore: beforeRec,
      stateAfter: state,
      reasoning: ["Customer completed payment following intervention."],
      timestamp: now.toISOString(),
    });
  } else if (outcomeRoll < successProbability) {
    // Promise-to-pay path.
    log.outcome = "SIMULATED_RESPONSE_POSITIVE";
    const promisedDate = new Date(now.getTime() + (2 + Math.floor(rand() * 5)) * 24 * 60 * 60 * 1000);
    const p2p = createPromise(promisedDate.toISOString(), now);
    result.promiseToPay = p2p;
    const beforeP2P = state;
    state = "PROMISED";
    const reminderMsg = generateP2PSoftReminder(customer, transaction, promisedDate.toISOString());
    appendAuditEntry(auditTrail, {
      caseId,
      actor: "AGENT",
      action: `Customer committed to Promise-to-Pay for ${promisedDate.toDateString()}. Non-intrusive soft reminder scheduled 24h prior.`,
      stateBefore: beforeP2P,
      stateAfter: state,
      reasoning: [`Promise recorded via P2P state machine.`, `Scheduled reminder copy: "${reminderMsg}"`],
      timestamp: now.toISOString(),
    });
    // Resolve promise deterministically for batch metrics (weighted by loyalty).
    const fulfilled = rand() < 0.55 + customer.loyaltyScore * 0.3;
    if (fulfilled) {
      result.promiseToPay.status = "FULFILLED";
      result.recoveredAmount = transaction.amount;
      const beforeFulfilled = state;
      state = "RECOVERED";
      appendAuditEntry(auditTrail, {
        caseId,
        actor: "SYSTEM",
        action: "Promise-to-Pay fulfilled on schedule. Payment recovered.",
        stateBefore: beforeFulfilled,
        stateAfter: state,
        reasoning: ["Payment confirmed on/before promised date."],
        timestamp: now.toISOString(),
      });
    } else {
      result.promiseToPay.status = "BROKEN";
      result.promiseToPay.brokenReason = "Promised date elapsed without payment.";
      const beforeBroken = state;
      state = "FAILED";
      appendAuditEntry(auditTrail, {
        caseId,
        actor: "SYSTEM",
        action: "Promise-to-Pay broken — promised date elapsed without payment. Re-diagnosis queued for next cycle.",
        stateBefore: beforeBroken,
        stateAfter: state,
        reasoning: ["No compliant re-contact will occur until the next contact window opens, respecting frequency caps."],
        timestamp: now.toISOString(),
      });
    }
  } else {
    log.outcome = outcomeRoll > 0.97 ? "NO_RESPONSE" : "SIMULATED_RESPONSE_NEGATIVE";
    const beforeFailed = state;
    state = "FAILED";
    appendAuditEntry(auditTrail, {
      caseId,
      actor: "SYSTEM",
      action: "No successful recovery from this intervention. Case will re-enter diagnosis queue subject to contact frequency cap.",
      stateBefore: beforeFailed,
      stateAfter: state,
      reasoning: [`Customer response: ${log.outcome}.`],
      timestamp: now.toISOString(),
    });
  }

  result.currentState = state;
  result.finalOutcome =
    state === "RECOVERED" ? "RECOVERED" : state === "PROMISED" ? undefined : "UNRECOVERED";
  return result;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function runBatch(pairs: MockCasePair[], seed = 7): RecoveryBatch {
  resetAuditSequence();
  caseCounter = 1;
  const rand = mulberry32(seed);
  const now = new Date();
  const cases = pairs.map((pair) => runCase(pair, now, rand));
  const metrics = computeBatchMetrics(cases);
  return {
    id: `batch_${now.getTime()}`,
    createdAt: now.toISOString(),
    cases,
    metrics,
  };
}

export function computeBatchMetrics(cases: RecoveryCase[]): BatchMetrics {
  const currency: Currency = cases[0]?.transaction.currency ?? "INR";
  const byScenario: BatchMetrics["byScenario"] = {
    SUBSCRIPTION_RETRY: { count: 0, recovered: 0, atRisk: 0 },
    ABANDONED_CHECKOUT: { count: 0, recovered: 0, atRisk: 0 },
    B2B_OVERDUE: { count: 0, recovered: 0, atRisk: 0 },
    GATEWAY_DEGRADATION: { count: 0, recovered: 0, atRisk: 0 },
  };

  let totalRevenueAtRisk = 0;
  let totalRecovered = 0;
  let stoppedForCompliance = 0;
  let escalatedToHuman = 0;
  let promisesToPay = 0;
  let promisesFulfilled = 0;
  let compliantCases = 0;

  for (const c of cases) {
    const scen: Scenario = c.transaction.scenario;
    totalRevenueAtRisk += c.transaction.amount;
    totalRecovered += c.recoveredAmount;
    byScenario[scen].count += 1;
    byScenario[scen].atRisk += c.transaction.amount;
    byScenario[scen].recovered += c.recoveredAmount;

    if (c.finalOutcome === "STOPPED_COMPLIANCE") stoppedForCompliance += 1;
    if (c.finalOutcome === "ESCALATED_HUMAN") escalatedToHuman += 1;
    if (c.promiseToPay.status !== "NONE") promisesToPay += 1;
    if (c.promiseToPay.status === "FULFILLED") promisesFulfilled += 1;

    // A case is "compliant" if it never sent a customer-facing contact without a preceding
    // COMPLIANCE_ENGINE audit entry that explicitly authorized it (passed=true). Since the
    // orchestrator structurally gates every CONTACTING transition behind runComplianceCheck(),
    // this holds by construction — but we verify it here against the actual audit trail rather
    // than assuming it, so the metric reflects what happened, not just what should happen.
    const complianceEntry = c.auditTrail.find((e) => e.actor === "COMPLIANCE_ENGINE");
    const contactingEntry = c.auditTrail.find((e) => e.stateAfter === "CONTACTING");
    const wasCompliant = contactingEntry ? !!complianceEntry?.complianceChecks?.passed : true;
    if (wasCompliant) compliantCases += 1;
  }

  return {
    totalCases: cases.length,
    totalRevenueAtRisk,
    totalRecovered,
    recoveryRatePct: totalRevenueAtRisk > 0 ? (totalRecovered / totalRevenueAtRisk) * 100 : 0,
    complianceRatePct: cases.length > 0 ? (compliantCases / cases.length) * 100 : 100,
    stoppedForCompliance,
    escalatedToHuman,
    promisesToPay,
    promisesFulfilled,
    byScenario,
    currency,
  };
}
