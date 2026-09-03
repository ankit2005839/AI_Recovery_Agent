"use client";

import { BatchMetrics } from "@/lib/types";
import { SCENARIO_COLORS, SCENARIO_LABELS } from "@/lib/uiHelpers";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function RecoveryChart({ metrics }: { metrics: BatchMetrics | null }) {
  if (!metrics) {
    return <div className="card p-5 h-[320px] animate-pulseSoft" />;
  }

  const barData = Object.entries(metrics.byScenario).map(([scenario, v]) => ({
    name: SCENARIO_LABELS[scenario as keyof typeof SCENARIO_LABELS],
    atRisk: v.atRisk,
    recovered: v.recovered,
    color: SCENARIO_COLORS[scenario as keyof typeof SCENARIO_COLORS],
  }));

  const pieData = Object.entries(metrics.byScenario).map(([scenario, v]) => ({
    name: SCENARIO_LABELS[scenario as keyof typeof SCENARIO_LABELS],
    value: v.count,
    color: SCENARIO_COLORS[scenario as keyof typeof SCENARIO_COLORS],
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="card p-5 lg:col-span-2">
        <h3 className="text-sm font-medium text-slate-300 mb-4">Revenue at Risk vs. Recovered by Scenario</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={barData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1b2438" vertical={false} />
            <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: "#0d1220", border: "1px solid #1b2438", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#e2e8f0" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="atRisk" name="At Risk" fill="#334155" radius={[4, 4, 0, 0]} />
            <Bar dataKey="recovered" name="Recovered" radius={[4, 4, 0, 0]}>
              {barData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="card p-5">
        <h3 className="text-sm font-medium text-slate-300 mb-4">Case Volume by Scenario</h3>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3}>
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: "#0d1220", border: "1px solid #1b2438", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
