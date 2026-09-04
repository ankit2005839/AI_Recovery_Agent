"use client";

import { useEffect, useState, useCallback } from "react";
import { BookOpenText, AlertTriangle } from "lucide-react";
import { runBatch, getPolicy } from "@/lib/api";
import type { RecoveryBatch, RecoveryCase, CompliancePolicy } from "@/lib/types";
import ExecutiveMetrics from "@/components/ExecutiveMetrics";
import RecoveryCharts from "@/components/RecoveryCharts";
import BatchControls from "@/components/BatchControls";
import CaseLedger from "@/components/CaseLedger";
import CaseDetailPanel from "@/components/CaseDetailPanel";
import CompliancePolicyPanel from "@/components/CompliancePolicyPanel";

export default function Home() {
  const [batch, setBatch] = useState<RecoveryBatch | null>(null);
  const [policy, setPolicy] = useState<CompliancePolicy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RecoveryCase | null>(null);

  const load = useCallback(async (n = 55, seed = 42) => {
    setLoading(true);
    setError(null);
    try {
      const b = await runBatch(n, seed);
      setBatch(b);
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message} — is the backend running? See README for \`uvicorn app.main:app --reload\`.`
          : "Unknown error"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    getPolicy().then(setPolicy).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-paper">
      {/* Header */}
      <header className="border-b border-line bg-ink text-paper">
        <div className="mx-auto max-w-7xl px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BookOpenText className="h-6 w-6" />
            <div>
              <h1 className="font-serif text-2xl tracking-tightish">Ledger</h1>
              <p className="text-xs text-paper/60">AI Revenue Recovery Agent — Track 03</p>
            </div>
          </div>
          <div className="text-paper">
            <BatchControls onRun={load} running={loading} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {error && (
          <div className="flex items-start gap-2 border border-stopped bg-stopped-pale text-stopped text-sm px-4 py-3 rounded-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!batch && !error && (
          <div className="text-center py-24 text-ink-muted">
            <p className="text-sm">Running the first batch simulation…</p>
          </div>
        )}

        {batch && (
          <>
            <ExecutiveMetrics batch={batch} />
            <RecoveryCharts batch={batch} />
            <CompliancePolicyPanel policy={policy} />
            <CaseLedger
              cases={batch.cases}
              onSelect={setSelected}
              selectedId={selected?.case_id}
              batchKey={batch.batch_id}
            />
          </>
        )}
      </div>

      {selected && (
        <CaseDetailPanel caseData={selected} onClose={() => setSelected(null)} />
      )}

      <footer className="mx-auto max-w-7xl px-6 py-8 text-xs text-ink-muted">
        Every action shown above passed through the compliance guardrail before execution;
        blocked actions are logged, not hidden. Full audit trail is immutable and
        append-only per case.
      </footer>
    </main>
  );
}
