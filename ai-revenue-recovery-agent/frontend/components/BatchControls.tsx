"use client";

import { useState } from "react";
import { Play, Loader2, RefreshCw } from "lucide-react";

export default function BatchControls({
  onRun, running,
}: { onRun: (nCases: number, seed: number) => void; running: boolean }) {
  const [nCases, setNCases] = useState(55);
  const [seed, setSeed] = useState(42);

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-ink-muted">Batch size</span>
        <input
          type="number"
          min={5}
          max={200}
          value={nCases}
          onChange={(e) => setNCases(Number(e.target.value))}
          className="w-24 rounded-sm border border-line bg-paper-raised px-2 py-1.5 text-sm tabular focus:border-ledger outline-none"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-ink-muted">Seed</span>
        <input
          type="number"
          value={seed}
          onChange={(e) => setSeed(Number(e.target.value))}
          className="w-24 rounded-sm border border-line bg-paper-raised px-2 py-1.5 text-sm tabular focus:border-ledger outline-none"
        />
      </label>
      <button
        onClick={() => onRun(nCases, seed)}
        disabled={running}
        className="inline-flex items-center gap-2 rounded-sm bg-ledger px-4 py-2 text-sm font-medium text-paper hover:bg-ledger-light transition-colors disabled:opacity-60"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {running ? "Running batch…" : "Run batch simulation"}
      </button>
      <button
        onClick={() => onRun(nCases, seed + 1)}
        disabled={running}
        title="Regenerate with a new seed"
        className="inline-flex items-center gap-2 rounded-sm border border-line px-3 py-2 text-sm text-ink-muted hover:text-ink hover:border-ink transition-colors disabled:opacity-60"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        New seed
      </button>
    </div>
  );
}
