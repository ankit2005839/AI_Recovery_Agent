"use client";

import { ShieldCheck } from "lucide-react";
import type { CompliancePolicy } from "@/lib/types";

export default function CompliancePolicyPanel({ policy }: { policy: CompliancePolicy | null }) {
  if (!policy) return null;

  const rules = [
    { label: "Max contacts", value: `${policy.max_contacts_per_window} per ${policy.contact_window_days} days` },
    { label: "Contact window", value: `${policy.quiet_hours_start}–${policy.quiet_hours_end} local` },
    { label: "Grace period (B2C)", value: `${policy.grace_period_hours_b2c}h before first contact` },
    { label: "Grace period (B2B)", value: `${policy.grace_period_hours_b2b}h before first contact` },
    { label: "Max voice calls", value: `${policy.max_voice_calls_per_case} per case` },
  ];

  return (
    <div className="border border-line bg-paper-raised p-5">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-recovered" />
        <h3 className="font-serif text-lg text-ink">Guardrail policy in force</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
        {rules.map((r) => (
          <div key={r.label}>
            <div className="text-xs text-ink-muted">{r.label}</div>
            <div className="text-sm text-ink mt-0.5 tabular">{r.value}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="text-xs text-ink-muted mb-1.5">Instant termination triggers on inbound keywords</div>
        <div className="flex flex-wrap gap-1.5">
          {policy.termination_keywords.map((k) => (
            <span key={k} className="rounded-sm bg-stopped-pale px-1.5 py-0.5 text-[11px] font-mono text-stopped">
              {k}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
