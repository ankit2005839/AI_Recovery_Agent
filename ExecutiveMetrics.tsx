"use client";

import { BatchMetrics } from "@/lib/types";
import { formatMoney } from "@/lib/uiHelpers";
import { AlertTriangle, BadgeCheck, ShieldCheck, TrendingUp } from "lucide-react";

function Kpi({
  icon,
  label,
  value,
  sublabel,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  accent: string;
}) {
  return (
    <div className="card p-5 flex flex-col gap-3 animate-slideIn">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">{label}</span>
        <div className={`p-2 rounded-lg ${accent}`}>{icon}</div>
      </div>
      <div className="text-2xl font-semibold text-white">{value}</div>
      {sublabel && <div className="text-xs text-slate-400">{sublabel}</div>}
    </div>
  );
}

export default function ExecutiveMetrics({ metrics }: { metrics: BatchMetrics | null }) {
  if (!metrics) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-5 h-[110px] animate-pulseSoft" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Kpi
        icon={<AlertTriangle className="w-4 h-4 text-amber-300" />}
        label="Total Revenue at Risk"
        value={formatMoney(metrics.totalRevenueAtRisk, metrics.currency)}
        sublabel={`${metrics.totalCases} cases in batch`}
        accent="bg-amber-500/10"
      />
      <Kpi
        icon={<TrendingUp className="w-4 h-4 text-emerald-300" />}
        label="Total Recovered"
        value={formatMoney(metrics.totalRecovered, metrics.currency)}
        sublabel={`${metrics.promisesFulfilled} via fulfilled promise-to-pay`}
        accent="bg-emerald-500/10"
      />
      <Kpi
        icon={<BadgeCheck className="w-4 h-4 text-teal-300" />}
        label="Recovery Rate"
        value={`${metrics.recoveryRatePct.toFixed(1)}%`}
        sublabel={`${metrics.escalatedToHuman} escalated to human review`}
        accent="bg-teal-500/10"
      />
      <Kpi
        icon={<ShieldCheck className="w-4 h-4 text-violet-300" />}
        label="Audit Compliance Rate"
        value={`${metrics.complianceRatePct.toFixed(1)}%`}
        sublabel={`${metrics.stoppedForCompliance} stopped by guardrails`}
        accent="bg-violet-500/10"
      />
    </div>
  );
}
