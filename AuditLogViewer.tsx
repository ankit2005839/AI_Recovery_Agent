"use client";

import { RecoveryCase } from "@/lib/types";
import { formatMoney, STATE_COLORS, STATE_LABELS } from "@/lib/uiHelpers";
import clsx from "clsx";
import {
  CheckCircle2,
  Fingerprint,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";

function ReasoningTrace({ steps }: { steps: string[] }) {
  return (
    <ul className="space-y-1.5">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2 text-xs text-slate-400 leading-relaxed">
          <span className="text-teal-400 mt-0.5">›</span>
          <span>{s}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AuditLogViewer({ recoveryCase }: { recoveryCase: RecoveryCase | null }) {
  if (!recoveryCase) {
    return (
      <div className="card p-8 flex flex-col items-center justify-center text-center gap-2 h-full min-h-[400px]">
        <Fingerprint className="w-8 h-8 text-slate-600" />
        <p className="text-sm text-slate-500">Select a case from the visualizer to inspect its full reasoning trace and audit trail.</p>
      </div>
    );
  }

  const c = recoveryCase;

  return (
    <div className="card flex flex-col h-full max-h-[820px]">
      {/* Header */}
      <div className="p-5 border-b border-base-700">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" />
              <h3 className="font-medium text-white">{c.customer.name}</h3>
              <span className={clsx("badge border", STATE_COLORS[c.currentState])}>{STATE_LABELS[c.currentState]}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {c.id} · {c.transaction.description}
            </p>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-white">{formatMoney(c.transaction.amount, c.transaction.currency)}</div>
            {c.recoveredAmount > 0 && (
              <div className="text-xs text-emerald-400">
                {formatMoney(c.recoveredAmount, c.transaction.currency)} recovered
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
          <div className="bg-base-800/60 rounded-lg px-2.5 py-2">
            <div className="text-slate-500">Segment</div>
            <div className="text-slate-300 font-medium">{c.customer.segment.replaceAll("_", " ")}</div>
          </div>
          <div className="bg-base-800/60 rounded-lg px-2.5 py-2">
            <div className="text-slate-500">Language</div>
            <div className="text-slate-300 font-medium">{c.customer.language}</div>
          </div>
          <div className="bg-base-800/60 rounded-lg px-2.5 py-2">
            <div className="text-slate-500">Attempts</div>
            <div className="text-slate-300 font-medium">{c.transaction.attemptCount}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Diagnosis */}
        {c.diagnosis && (
          <section>
            <h4 className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">Diagnosis</h4>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-sky-300">{c.diagnosis.rootCause.replaceAll("_", " ")}</span>
              <span className="text-xs text-slate-500">confidence {(c.diagnosis.confidence * 100).toFixed(0)}%</span>
            </div>
            <ReasoningTrace steps={c.diagnosis.reasoning} />
          </section>
        )}

        {/* Promise to Pay */}
        {c.promiseToPay.status !== "NONE" && (
          <section>
            <h4 className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">Promise-to-Pay</h4>
            <div className="flex items-center gap-2 text-sm">
              <span
                className={clsx(
                  "badge border",
                  c.promiseToPay.status === "FULFILLED"
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : c.promiseToPay.status === "BROKEN"
                    ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                    : "bg-teal-500/15 text-teal-300 border-teal-500/30"
                )}
              >
                {c.promiseToPay.status}
              </span>
              {c.promiseToPay.promisedDate && (
                <span className="text-xs text-slate-400">
                  Promised: {new Date(c.promiseToPay.promisedDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
              )}
            </div>
          </section>
        )}

        {/* Interventions / message templates */}
        {c.interventions.length > 0 && (
          <section>
            <h4 className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">Messages Sent</h4>
            {c.interventions.map((i) => (
              <div key={i.id} className="bg-base-800/60 rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-violet-300">
                    <MessageSquare className="w-3.5 h-3.5" />
                    {i.type.replaceAll("_", " ")} · {i.channel.replaceAll("_", " ")}
                  </div>
                  <span
                    className={clsx(
                      "text-[10px] px-1.5 py-0.5 rounded-full",
                      i.outcome.includes("POSITIVE")
                        ? "bg-emerald-500/15 text-emerald-300"
                        : i.outcome.includes("NEGATIVE")
                        ? "bg-rose-500/15 text-rose-300"
                        : "bg-slate-500/15 text-slate-300"
                    )}
                  >
                    {i.outcome.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mono text-slate-400 whitespace-pre-wrap leading-relaxed">{i.messageText}</p>
              </div>
            ))}
          </section>
        )}

        {/* Full audit trail */}
        <section>
          <h4 className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-3">Immutable Audit Trail</h4>
          <div className="relative pl-5 space-y-4 border-l border-base-700">
            {c.auditTrail.map((entry) => (
              <div key={entry.id} className="relative">
                <span
                  className={clsx(
                    "absolute -left-[25px] top-0.5 w-3 h-3 rounded-full border-2 border-base-900",
                    entry.actor === "COMPLIANCE_ENGINE"
                      ? entry.complianceChecks?.hardStop
                        ? "bg-rose-500"
                        : "bg-amber-400"
                      : entry.actor === "AGENT"
                      ? "bg-violet-400"
                      : "bg-slate-500"
                  )}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono text-slate-600">#{entry.sequence}</span>
                  {entry.actor === "COMPLIANCE_ENGINE" ? (
                    entry.complianceChecks?.hardStop ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
                    )
                  ) : entry.actor === "AGENT" ? (
                    <Fingerprint className="w-3.5 h-3.5 text-violet-300" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span className="text-xs font-medium text-slate-300">{entry.action}</span>
                </div>
                <div className="mt-1 ml-5">
                  <ReasoningTrace steps={entry.reasoning} />
                  {entry.complianceChecks && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {entry.complianceChecks.checksRun.map((check) => (
                        <span
                          key={check}
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-base-800 text-slate-400 border border-base-700"
                        >
                          {entry.complianceChecks!.hardStop ? (
                            <XCircle className="w-2.5 h-2.5 text-rose-400" />
                          ) : (
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                          )}
                          {check.replaceAll("_", " ")}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-600 font-mono">
                    <Fingerprint className="w-3 h-3" />
                    hash: {entry.hash}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
