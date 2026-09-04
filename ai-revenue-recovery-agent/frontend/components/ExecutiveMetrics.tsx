"use client";

import { useEffect, useState } from "react";
import { inr, pct } from "@/lib/format";
import type { RecoveryBatch } from "@/lib/types";

function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}

function Stat({
  label, value, sub, accent,
}: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="flex-1 min-w-[200px] border-line border-t sm:border-t-0 sm:border-l first:border-l-0 first:border-t-0 px-6 py-5">
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`mt-1.5 font-serif text-3xl tabular ${accent ?? "text-ink"}`}>{value}</div>
      <div className="mt-1 text-xs text-ink-muted">{sub}</div>
    </div>
  );
}

export default function ExecutiveMetrics({ batch }: { batch: RecoveryBatch }) {
  const recovered = useCountUp(batch.total_recovered);
  const atRisk = useCountUp(batch.total_revenue_at_risk);
  const rate = useCountUp(batch.recovery_rate_pct);
  const audit = useCountUp(batch.audit_compliance_rate_pct);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-line bg-paper-raised">
      <Stat
        label="Total Revenue at Risk"
        value={inr(atRisk)}
        sub={`${batch.cases.length} cases in this batch`}
      />
      <Stat
        label="Total Recovered"
        value={inr(recovered)}
        sub="Confirmed payments + kept promises"
        accent="text-recovered"
      />
      <Stat
        label="Recovery Rate"
        value={pct(rate)}
        sub="Recovered ÷ revenue at risk"
        accent="text-ledger"
      />
      <Stat
        label="Audit Compliance Rate"
        value={pct(audit, 1)}
        sub={`${batch.compliance_pass_count} passed · ${batch.compliance_blocked_count} correctly blocked`}
        accent="text-recovered"
      />
    </div>
  );
}
