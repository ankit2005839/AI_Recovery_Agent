import type { RecoveryBatch, RecoveryCase, CompliancePolicy } from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function runBatch(nCases: number, seed: number): Promise<RecoveryBatch> {
  const res = await fetch(
    `${API_BASE}/api/batch/run?n_cases=${nCases}&seed=${seed}`,
    { method: "POST" }
  );
  return handle<RecoveryBatch>(res);
}

export async function getCase(batchId: string, caseId: string): Promise<RecoveryCase> {
  const res = await fetch(`${API_BASE}/api/batch/${batchId}/cases/${caseId}`);
  return handle<RecoveryCase>(res);
}

export async function getPolicy(): Promise<CompliancePolicy> {
  const res = await fetch(`${API_BASE}/api/compliance/policy`);
  return handle<CompliancePolicy>(res);
}
