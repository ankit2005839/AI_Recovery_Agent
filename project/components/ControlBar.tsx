"use client";

import { Loader2, PlayCircle, RotateCcw, ShieldCheck } from "lucide-react";

export default function ControlBar({
  caseCount,
  onCaseCountChange,
  onRun,
  onReset,
  isRunning,
  hasResults,
  auditValid,
}: {
  caseCount: number;
  onCaseCountChange: (n: number) => void;
  onRun: () => void;
  onReset: () => void;
  isRunning: boolean;
  hasResults: boolean;
  auditValid: boolean | null;
}) {
  return (
    <div className="card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          Revenue Recovery Agent
          <span className="badge border bg-teal-500/10 text-teal-300 border-teal-500/30">Track 03</span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Autonomous detection → diagnosis → intervention → compliant recovery, with a full immutable audit trail.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {auditValid !== null && (
          <span
            className={`badge border ${
              auditValid
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : "bg-rose-500/15 text-rose-300 border-rose-500/30"
            }`}
          >
            <ShieldCheck className="w-3 h-3" />
            {auditValid ? "Audit chain verified" : "Audit chain broken"}
          </span>
        )}
        <select
          value={caseCount}
          onChange={(e) => onCaseCountChange(Number(e.target.value))}
          disabled={isRunning}
          className="bg-base-800 border border-base-700 text-sm rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
        >
          <option value={55}>55 cases</option>
          <option value={75}>75 cases</option>
          <option value={100}>100 cases</option>
        </select>
        {hasResults && (
          <button
            onClick={onReset}
            disabled={isRunning}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-base-700 text-slate-400 hover:bg-base-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        )}
        <button
          onClick={onRun}
          disabled={isRunning}
          className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-teal-500 text-base-950 hover:bg-teal-400 transition-colors disabled:opacity-60"
        >
          {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          {isRunning ? "Running batch…" : "Run Batch Simulation"}
        </button>
      </div>
    </div>
  );
}
