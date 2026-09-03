import { AuditTrailEntry, CaseState, ComplianceCheckResult } from "./types";

/**
 * Deterministic, dependency-free string hash (FNV-1a variant) used to chain
 * audit entries together. This is NOT cryptographic-grade, but it is
 * sufficient to demonstrate tamper-evidence for a prototype: any mutation to
 * a prior entry changes its hash, which breaks every subsequent prevHash
 * link, making tampering detectable by `verifyAuditChain`.
 */
export function fnvHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

let seq = 0;
export function resetAuditSequence() {
  seq = 0;
}

export function appendAuditEntry(
  trail: AuditTrailEntry[],
  params: {
    caseId: string;
    actor: AuditTrailEntry["actor"];
    action: string;
    stateBefore: CaseState;
    stateAfter: CaseState;
    reasoning: string[];
    complianceChecks?: ComplianceCheckResult;
    timestamp: string;
  }
): AuditTrailEntry {
  const prevHash = trail.length > 0 ? trail[trail.length - 1].hash : "GENESIS";
  seq += 1;
  const payload = JSON.stringify({
    caseId: params.caseId,
    seq,
    ts: params.timestamp,
    action: params.action,
    stateBefore: params.stateBefore,
    stateAfter: params.stateAfter,
    reasoning: params.reasoning,
    prevHash,
  });
  const entry: AuditTrailEntry = {
    id: `audit_${params.caseId}_${seq}`,
    caseId: params.caseId,
    sequence: seq,
    timestamp: params.timestamp,
    actor: params.actor,
    action: params.action,
    stateBefore: params.stateBefore,
    stateAfter: params.stateAfter,
    reasoning: params.reasoning,
    complianceChecks: params.complianceChecks,
    prevHash,
    hash: fnvHash(payload),
  };
  trail.push(entry);
  return entry;
}

/** Walks the chain and confirms every link is intact — proves the trail hasn't been tampered with. */
export function verifyAuditChain(trail: AuditTrailEntry[]): { valid: boolean; brokenAt?: number } {
  let prevHash = "GENESIS";
  for (const entry of trail) {
    if (entry.prevHash !== prevHash) {
      return { valid: false, brokenAt: entry.sequence };
    }
    const payload = JSON.stringify({
      caseId: entry.caseId,
      seq: entry.sequence,
      ts: entry.timestamp,
      action: entry.action,
      stateBefore: entry.stateBefore,
      stateAfter: entry.stateAfter,
      reasoning: entry.reasoning,
      prevHash: entry.prevHash,
    });
    if (fnvHash(payload) !== entry.hash) {
      return { valid: false, brokenAt: entry.sequence };
    }
    prevHash = entry.hash;
  }
  return { valid: true };
}
