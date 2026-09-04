import { STATUS_LABEL, STATUS_COLOR } from "@/lib/format";
import type { CaseStatus } from "@/lib/types";

export default function StatusPill({ status }: { status: CaseStatus }) {
  const c = STATUS_COLOR[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}
