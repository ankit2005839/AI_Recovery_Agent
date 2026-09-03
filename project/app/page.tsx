"use client";

import AuditLogViewer from "@/components/AuditLogViewer";
import BatchVisualizer from "@/components/BatchVisualizer";
import ControlBar from "@/components/ControlBar";
import ExecutiveMetrics from "@/components/ExecutiveMetrics";
import RecoveryChart from "@/components/RecoveryChart";
import { computeBatchMetrics } from "@/lib/agentOrchestrator";
import { RecoveryCase } from "@/lib/types";
import { useEffect, useMemo, useRef, useState } from "react";

export default function DashboardPage() {
  const [caseCount, setCaseCount] = useState(55);
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [auditValid, setAuditValid] = useState<boolean | null>(null);
  const playbackRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runBatch = async () => {
    setIsRunning(true);
    setCases([]);
    setVisibleCount(0);
    setSelectedCaseId(null);
    setAuditValid(null);
    if (playbackRef.current) clearInterval(playbackRef.current);

    try {
      const dataRes = await fetch(`/api/batch/data?count=${caseCount}`);
      const { pairs } = await dataRes.json();

      const runRes = await fetch("/api/batch/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs, seed: 7 }),
      });
      const { batch, auditIntegrity } = await runRes.json();

      setCases(batch.cases);
      setAuditValid(auditIntegrity.allValid);

      // Reveal cases progressively to simulate a live agent run.
      let i = 0;
      const total = batch.cases.length;
      const tickMs = Math.max(25, Math.min(120, 4000 / total));
      playbackRef.current = setInterval(() => {
        i += 1;
        setVisibleCount(i);
        if (i >= total) {
          if (playbackRef.current) clearInterval(playbackRef.current);
          setIsRunning(false);
        }
      }, tickMs);
    } catch (e) {
      console.error(e);
      setIsRunning(false);
    }
  };

  const resetBatch = () => {
    if (playbackRef.current) clearInterval(playbackRef.current);
    setCases([]);
    setVisibleCount(0);
    setSelectedCaseId(null);
    setAuditValid(null);
    setIsRunning(false);
  };

  useEffect(() => {
    return () => {
      if (playbackRef.current) clearInterval(playbackRef.current);
    };
  }, []);

  const visibleCases = useMemo(() => cases.slice(0, visibleCount), [cases, visibleCount]);
  const liveMetrics = useMemo(() => (visibleCases.length > 0 ? computeBatchMetrics(visibleCases) : null), [visibleCases]);
  const selectedCase = useMemo(() => cases.find((c) => c.id === selectedCaseId) ?? null, [cases, selectedCaseId]);

  return (
    <main className="max-w-[1500px] mx-auto p-4 sm:p-6 space-y-5">
      <ControlBar
        caseCount={caseCount}
        onCaseCountChange={setCaseCount}
        onRun={runBatch}
        onReset={resetBatch}
        isRunning={isRunning}
        hasResults={cases.length > 0}
        auditValid={auditValid}
      />

      <ExecutiveMetrics metrics={liveMetrics} />

      <RecoveryChart metrics={liveMetrics} />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div className="xl:col-span-3">
          <BatchVisualizer
            cases={cases}
            visibleCount={visibleCount}
            selectedCaseId={selectedCaseId}
            onSelect={setSelectedCaseId}
          />
        </div>
        <div className="xl:col-span-2">
          <AuditLogViewer recoveryCase={selectedCase} />
        </div>
      </div>

      <footer className="text-center text-xs text-slate-600 py-4">
        AI Revenue Recovery Agent — prototype built for Track 03. All customer data is synthetically generated.
      </footer>
    </main>
  );
}
