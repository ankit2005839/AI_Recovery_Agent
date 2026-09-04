"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import type { RecoveryBatch, ScenarioType, CaseStatus } from "@/lib/types";
import { SCENARIO_SHORT, STATUS_LABEL, inr } from "@/lib/format";

const SCENARIO_ORDER: ScenarioType[] = [
  "failed_subscription", "abandoned_checkout", "b2b_overdue_invoice", "payment_degradation",
];

const STATUS_ORDER: CaseStatus[] = [
  "recovered", "promise_to_pay", "escalated_human",
  "stopped_max_attempts", "stopped_compliance", "failed_exhausted",
];

const STATUS_BAR_COLOR: Record<string, string> = {
  recovered: "#1F7A5C",
  promise_to_pay: "#B5790C",
  escalated_human: "#6A4C93",
  stopped_max_attempts: "#B0402F",
  stopped_compliance: "#B0402F",
  failed_exhausted: "#8A8272",
};

export default function RecoveryCharts({ batch }: { batch: RecoveryBatch }) {
  const byScenario = SCENARIO_ORDER.map((s) => {
    const cases = batch.cases.filter((c) => c.transaction.scenario === s);
    const atRisk = cases.reduce((sum, c) => sum + c.transaction.amount, 0);
    const recovered = cases.reduce((sum, c) => sum + c.amount_recovered, 0);
    return { scenario: SCENARIO_SHORT[s], atRisk, recovered };
  });

  const byStatus = STATUS_ORDER
    .map((s) => ({
      status: STATUS_LABEL[s],
      count: batch.cases_by_status[s] || 0,
      key: s,
    }))
    .filter((d) => d.count > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-line border border-line">
      <div className="bg-paper-raised p-5">
        <h3 className="font-serif text-lg text-ink">Recovered vs. at risk, by scenario</h3>
        <p className="text-xs text-ink-muted mt-0.5 mb-4">Amounts in ₹ across the batch</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={byScenario} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="0" stroke="#DCD7C8" vertical={false} />
            <XAxis dataKey="scenario" tick={{ fontSize: 11, fill: "#5B6472" }} axisLine={{ stroke: "#DCD7C8" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#5B6472" }} axisLine={false} tickLine={false}
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={48} />
            <Tooltip
              formatter={(value: number, name: string) => [inr(value), name === "atRisk" ? "At risk" : "Recovered"]}
              contentStyle={{ fontSize: 12, borderRadius: 4, border: "1px solid #DCD7C8" }}
            />
            <Bar dataKey="atRisk" fill="#E7EEF3" radius={[2, 2, 0, 0]} />
            <Bar dataKey="recovered" fill="#1F7A5C" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-paper-raised p-5">
        <h3 className="font-serif text-lg text-ink">Case outcomes</h3>
        <p className="text-xs text-ink-muted mt-0.5 mb-4">Terminal state distribution across the batch</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={byStatus} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="0" stroke="#DCD7C8" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: "#5B6472" }} axisLine={false} tickLine={false} />
            <YAxis dataKey="status" type="category" tick={{ fontSize: 11, fill: "#10161F" }}
              axisLine={false} tickLine={false} width={140} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4, border: "1px solid #DCD7C8" }} />
            <Bar dataKey="count" radius={[0, 2, 2, 0]}>
              {byStatus.map((d) => (
                <Cell key={d.key} fill={STATUS_BAR_COLOR[d.key] || "#1C3D5A"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
