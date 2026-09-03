"use client";

import { RecoveryCase } from "@/lib/types";
import { formatMoney, SCENARIO_LABELS, STATE_COLORS, STATE_LABELS } from "@/lib/uiHelpers";
import { ChevronRight } from "lucide-react";
import clsx from "clsx";

export default function BatchVisualizer({
  cases,
  visibleCount,
  selectedCaseId,
  onSelect,
}: {
  cases: RecoveryCase[];
  visibleCount: number;
  selectedCaseId: string | null;
  onSelect: (caseId: string) => void;
}) {
  const visible = cases.slice(0, visibleCount);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-base-700">
        <h3 className="text-sm font-medium text-slate-300">Batch Execution Visualizer</h3>
        <span className="text-xs text-slate-500">
          {visibleCount} / {cases.length} cases processed
        </span>
      </div>
      <div className="max-h-[520px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-base-900/95 backdrop-blur z-10">
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-5 py-2.5 font-medium">Customer</th>
              <th className="px-3 py-2.5 font-medium">Scenario</th>
              <th className="px-3 py-2.5 font-medium">Root Cause</th>
              <th className="px-3 py-2.5 font-medium">Amount</th>
              <th className="px-3 py-2.5 font-medium">State</th>
              <th className="px-3 py-2.5 font-medium w-8"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={clsx(
                  "border-t border-base-700/60 cursor-pointer transition-colors animate-slideIn",
                  selectedCaseId === c.id ? "bg-teal-500/5" : "hover:bg-base-800/50"
                )}
              >
                <td className="px-5 py-2.5">
                  <div className="font-medium text-slate-200">{c.customer.name}</div>
                  <div className="text-xs text-slate-500">{c.transaction.description}</div>
                </td>
                <td className="px-3 py-2.5 text-slate-400 text-xs">{SCENARIO_LABELS[c.transaction.scenario]}</td>
                <td className="px-3 py-2.5 text-slate-400 text-xs">{c.diagnosis?.rootCause.replaceAll("_", " ") ?? "—"}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-slate-300">
                  {formatMoney(c.transaction.amount, c.transaction.currency)}
                </td>
                <td className="px-3 py-2.5">
                  <span className={clsx("badge border", STATE_COLORS[c.currentState])}>{STATE_LABELS[c.currentState]}</span>
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  <ChevronRight className="w-4 h-4" />
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-slate-500 text-sm py-12">
                  Run a batch simulation to see live case execution.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
