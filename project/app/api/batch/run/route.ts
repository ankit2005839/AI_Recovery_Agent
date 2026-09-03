import { verifyAuditChain } from "@/lib/auditTrail";
import { runBatch } from "@/lib/agentOrchestrator";
import { MockCasePair } from "@/lib/mockData";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const pairs: MockCasePair[] = body.pairs;
    const seed: number = body.seed ?? 7;

    if (!Array.isArray(pairs) || pairs.length === 0) {
      return NextResponse.json({ error: "No cases provided to run." }, { status: 400 });
    }

    const batch = runBatch(pairs, seed);

    // Verify tamper-evidence of every case's audit chain before returning —
    // demonstrates the "immutable audit trail" guarantee end-to-end.
    const auditIntegrity = batch.cases.map((c) => ({
      caseId: c.id,
      ...verifyAuditChain(c.auditTrail),
    }));
    const allValid = auditIntegrity.every((a) => a.valid);

    return NextResponse.json({ batch, auditIntegrity: { allValid, details: auditIntegrity } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Batch execution failed." }, { status: 500 });
  }
}
