"use client";

import { useEffect, useState } from "react";
import type { RecoveryCase } from "@/lib/types";
import StatusPill from "./StatusPill";
import { inr, SCENARIO_SHORT, DECLINE_LABEL, shortDate } from "@/lib/format";

const PAGE_SIZE = 14;

export default function CaseLedger({
  cases, onSelect, selectedId, batchKey,
}: {
  cases: RecoveryCase[];
  onSelect: (c: RecoveryCase) => void;
  selectedId?: string;
  batchKey: string; // changes on every new run, used to re-trigger the reveal animation
}) {
  const [revealCount, setRevealCount] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    setRevealCount(0);
    setPage(0);
    const total = cases.length;
    let i = 0;
    const interval = setInterval(() => {
      i += Math.max(1, Math.ceil(total / 40));
      setRevealCount(Math.min(total, i));
      if (i >= total) clearInterval(interval);
    }, 35);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchKey]);

  const filtered = cases.filter((c) => filter === "all" || c.status === filter);
  const visible = filtered.slice(0, revealCount).slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(Math.min(filtered.length, revealCount) / PAGE_SIZE));

  const statusOptions = Array.from(new Set(cases.map((c) => c.status)));

  return (
    <div className="border border-line bg-paper-raised">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div>
          <h3 className="font-serif text-lg text-ink">Batch execution visualizer</h3>
          <p className="text-xs text-ink-muted mt-0.5">
            {revealCount < cases.length
              ? `Simulating… ${revealCount} / ${cases.length} cases processed`
              : `${filtered.length} of ${cases.length} cases · click a row for the full audit trail`}
          </p>
        </div>
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(0); }}
          className="rounded-sm border border-line bg-paper px-2 py-1.5 text-xs text-ink outline-none focus:border-ledger"
        >
          <option value="all">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-5 py-2 font-medium">Case</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Scenario</th>
              <th className="px-3 py-2 font-medium">Root cause / decline</th>
              <th className="px-3 py-2 font-medium text-right">Amount</th>
              <th className="px-3 py-2 font-medium text-right">Recovered</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr
                key={c.case_id}
                onClick={() => onSelect(c)}
                className={`border-b border-line last:border-b-0 cursor-pointer transition-colors animate-[fadein_0.25s_ease] ${
                  selectedId === c.case_id ? "bg-ledger-pale" : "hover:bg-paper"
                }`}
              >
                <td className="px-5 py-2.5 font-mono text-xs text-ink-muted">{c.case_id.slice(-8)}</td>
                <td className="px-3 py-2.5">
                  <div className="text-ink">{c.customer.name}</div>
                  <div className="text-xs text-ink-muted">{c.customer.segment.replace("_", " ")}</div>
                </td>
                <td className="px-3 py-2.5 text-ink-muted">{SCENARIO_SHORT[c.transaction.scenario]}</td>
                <td className="px-3 py-2.5 text-ink-muted text-xs">
                  {DECLINE_LABEL[c.transaction.decline_code]}
                  {c.transaction.due_date && <span className="block">Due {shortDate(c.transaction.due_date)}</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular text-ink">{inr(c.transaction.amount)}</td>
                <td className="px-3 py-2.5 text-right tabular text-recovered">
                  {c.amount_recovered > 0 ? inr(c.amount_recovered) : "—"}
                </td>
                <td className="px-3 py-2.5"><StatusPill status={c.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-xs text-ink-muted">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-sm border border-line px-2 py-1 disabled:opacity-40 hover:border-ink"
            >Prev</button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-sm border border-line px-2 py-1 disabled:opacity-40 hover:border-ink"
            >Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
