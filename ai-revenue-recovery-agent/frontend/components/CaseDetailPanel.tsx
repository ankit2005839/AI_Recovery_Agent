"use client";

import { X, ShieldCheck, ShieldAlert, MessageSquare, Phone, Mail, Cpu, MessageCircle } from "lucide-react";
import type { RecoveryCase, Channel } from "@/lib/types";
import StatusPill from "./StatusPill";
import {
  inr, dateTime, SCENARIO_LABEL, DECLINE_LABEL, ROOT_CAUSE_LABEL,
  INTERVENTION_LABEL, CHANNEL_LABEL, LANGUAGE_LABEL, pct,
} from "@/lib/format";

const CHANNEL_ICON: Record<Channel, React.ComponentType<{ className?: string }>> = {
  sms: MessageSquare,
  email: Mail,
  voice: Phone,
  system: Cpu,
  none: MessageCircle,
};

export default function CaseDetailPanel({
  caseData, onClose,
}: { caseData: RecoveryCase; onClose: () => void }) {
  const c = caseData;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        className="relative z-50 h-full w-full max-w-3xl overflow-y-auto thin-scroll bg-paper border-l border-line"
        style={{ animation: "slidein 0.22s ease" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-line bg-paper-raised px-6 py-4">
          <div>
            <div className="text-xs font-mono text-ink-muted">{c.case_id}</div>
            <h2 className="font-serif text-2xl text-ink mt-0.5">{c.customer.name}</h2>
            <div className="mt-1.5 flex items-center gap-2">
              <StatusPill status={c.status} />
              <span className="text-xs text-ink-muted">{SCENARIO_LABEL[c.transaction.scenario]}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-sm p-1.5 hover:bg-paper text-ink-muted hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-px bg-line border-b border-line">
          {/* Left: summary */}
          <div className="md:col-span-2 bg-paper-raised p-5 space-y-5">
            <section>
              <h4 className="text-xs uppercase tracking-wide text-ink-muted mb-2">Transaction</h4>
              <dl className="text-sm space-y-1.5">
                <Row label="Amount at risk" value={inr(c.transaction.amount)} />
                <Row label="Recovered" value={c.amount_recovered > 0 ? inr(c.amount_recovered) : "—"} />
                <Row label="Product" value={c.transaction.product_name} />
                <Row label="Gateway" value={c.transaction.gateway} />
                <Row label="Decline code" value={DECLINE_LABEL[c.transaction.decline_code]} />
                {c.transaction.invoice_number && <Row label="Invoice" value={c.transaction.invoice_number} />}
                {c.transaction.due_date && <Row label="Due date" value={dateTime(c.transaction.due_date)} />}
              </dl>
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-wide text-ink-muted mb-2">Diagnosis</h4>
              <dl className="text-sm space-y-1.5">
                <Row label="Root cause" value={c.root_cause ? ROOT_CAUSE_LABEL[c.root_cause] : "—"} />
                <Row label="Confidence" value={pct(c.root_cause_confidence * 100)} />
              </dl>
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-wide text-ink-muted mb-2">Customer</h4>
              <dl className="text-sm space-y-1.5">
                <Row label="Segment" value={c.customer.segment.replace("_", " ")} />
                <Row label="Language" value={LANGUAGE_LABEL[c.customer.preferred_language]} />
                <Row label="Phone" value={c.customer.phone} />
                <Row label="Email" value={c.customer.email} />
                <Row label="Opted out" value={c.customer.opted_out ? "Yes" : "No"}
                  flag={c.customer.opted_out} />
                <Row label="Dispute flag" value={c.customer.dispute_flag ? "Yes" : "No"}
                  flag={c.customer.dispute_flag} />
                <Row label="Irate flag" value={c.customer.is_irate ? "Yes" : "No"} flag={c.customer.is_irate} />
                <Row label="Contact attempts" value={`${c.contact_attempts}`} />
              </dl>
            </section>

            {c.p2p.status !== "none" && (
              <section>
                <h4 className="text-xs uppercase tracking-wide text-ink-muted mb-2">Promise to pay</h4>
                <dl className="text-sm space-y-1.5">
                  <Row label="Status" value={c.p2p.status} />
                  <Row label="Promised amount" value={c.p2p.promised_amount ? inr(c.p2p.promised_amount) : "—"} />
                  <Row label="Promised date" value={dateTime(c.p2p.promised_date)} />
                </dl>
              </section>
            )}

            {c.stop_reason && (
              <section>
                <h4 className="text-xs uppercase tracking-wide text-ink-muted mb-2">Stop reason</h4>
                <p className="text-sm text-stopped leading-relaxed">{c.stop_reason}</p>
              </section>
            )}
          </div>

          {/* Right: audit trail + messages */}
          <div className="md:col-span-3 bg-paper-raised p-5">
            <h4 className="text-xs uppercase tracking-wide text-ink-muted mb-3">
              Reasoning &amp; audit trail ({c.audit_trail.length} entries)
            </h4>
            <ol className="space-y-0">
              {c.audit_trail.map((entry, idx) => (
                <li key={entry.audit_id} className="relative pl-6 pb-5 border-l border-line last:border-transparent last:pb-0">
                  <span
                    className={`absolute -left-[5px] top-0.5 h-2.5 w-2.5 rounded-full ${
                      entry.compliance_check === "blocked" ? "bg-stopped" : "bg-ledger"
                    }`}
                  />
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <span className="font-mono">{dateTime(entry.timestamp)}</span>
                    <span>·</span>
                    <span className="uppercase tracking-wide">{entry.event_type.replace(/_/g, " ")}</span>
                    {entry.event_type === "compliance_check" && (
                      entry.compliance_check === "pass" ? (
                        <ShieldCheck className="h-3.5 w-3.5 text-recovered" />
                      ) : (
                        <ShieldAlert className="h-3.5 w-3.5 text-stopped" />
                      )
                    )}
                  </div>
                  <p className="mt-1 text-sm text-ink leading-relaxed">{entry.detail}</p>
                  {entry.compliance_rule && (
                    <span className="mt-1 inline-block rounded-sm bg-paper px-1.5 py-0.5 text-[11px] font-mono text-ink-muted border border-line">
                      rule: {entry.compliance_rule}
                    </span>
                  )}
                </li>
              ))}
            </ol>

            {c.interventions.length > 0 && (
              <div className="mt-6">
                <h4 className="text-xs uppercase tracking-wide text-ink-muted mb-3">
                  Messages &amp; actions ({c.interventions.length})
                </h4>
                <div className="space-y-3">
                  {c.interventions.map((iv) => {
                    const Icon = CHANNEL_ICON[iv.channel];
                    return (
                      <div key={iv.intervention_id} className="border border-line rounded-sm p-3 bg-paper">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 text-sm text-ink font-medium">
                            <Icon className="h-4 w-4 text-ledger" />
                            {INTERVENTION_LABEL[iv.intervention_type]}
                            <span className="text-xs text-ink-muted font-normal">
                              via {CHANNEL_LABEL[iv.channel]}
                            </span>
                          </div>
                          <span className="text-xs font-mono text-ink-muted tabular">
                            conf {pct(iv.confidence_score * 100, 0)}
                          </span>
                        </div>
                        {iv.message_text && (
                          <pre className="whitespace-pre-wrap font-sans text-sm text-ink bg-paper-raised border border-line rounded-sm p-2.5 mb-1.5">
                            {iv.message_text}
                          </pre>
                        )}
                        <p className="text-xs text-ink-muted leading-relaxed">{iv.reasoning}</p>
                        {iv.outcome && (
                          <span className="mt-1.5 inline-block text-xs font-medium text-ledger">
                            Outcome: {iv.outcome.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, flag }: { label: string; value: string; flag?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`text-right tabular ${flag ? "text-stopped font-medium" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
