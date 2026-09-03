import { CaseState, Currency, Scenario } from "./types";

export function formatMoney(amount: number, currency: Currency = "INR"): string {
  const symbol = currency === "INR" ? "₹" : "$";
  return `${symbol}${Math.round(amount).toLocaleString("en-IN")}`;
}

export const STATE_LABELS: Record<CaseState, string> = {
  DETECTED: "Detected",
  DIAGNOSING: "Diagnosing",
  DIAGNOSED: "Diagnosed",
  SELECTING_INTERVENTION: "Selecting Action",
  COMPLIANCE_CHECK: "Compliance Check",
  CONTACTING: "Contacting",
  AWAITING_RESPONSE: "Awaiting Response",
  PROMISED: "Promise-to-Pay",
  RECOVERED: "Recovered",
  FAILED: "Failed",
  STOPPED: "Stopped (Compliance)",
  ESCALATED: "Escalated to Human",
};

export const STATE_COLORS: Record<CaseState, string> = {
  DETECTED: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  DIAGNOSING: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  DIAGNOSED: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  SELECTING_INTERVENTION: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  COMPLIANCE_CHECK: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  CONTACTING: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  AWAITING_RESPONSE: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  PROMISED: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  RECOVERED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  FAILED: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  STOPPED: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  ESCALATED: "bg-orange-500/15 text-orange-300 border-orange-500/30",
};

export const SCENARIO_LABELS: Record<Scenario, string> = {
  SUBSCRIPTION_RETRY: "Failed Subscription",
  ABANDONED_CHECKOUT: "Abandoned Checkout",
  B2B_OVERDUE: "B2B Overdue Invoice",
  GATEWAY_DEGRADATION: "Gateway Degradation",
};

export const SCENARIO_COLORS: Record<Scenario, string> = {
  SUBSCRIPTION_RETRY: "#2dd4bf",
  ABANDONED_CHECKOUT: "#8b5cf6",
  B2B_OVERDUE: "#f59e0b",
  GATEWAY_DEGRADATION: "#fb7185",
};

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (Math.abs(mins) < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}
