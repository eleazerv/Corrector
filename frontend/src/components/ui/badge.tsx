import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { COMPLAINT_STATUS, FILE_STATUS, type Tone } from "@/lib/grading";
import type { ComplaintStatus, FileStatus } from "@/lib/types";
import { Icon } from "./icon";

const TONES: Record<Tone, { chip: string; dot: string }> = {
  neutral: { chip: "bg-disabled text-text", dot: "bg-border-strong" },
  info: { chip: "bg-info-soft text-info", dot: "bg-info" },
  warning: { chip: "bg-warning-soft text-warning", dot: "bg-[#d98a00]" },
  danger: { chip: "bg-danger-soft text-danger", dot: "bg-danger" },
  success: { chip: "bg-success-soft text-success", dot: "bg-success" },
};

/** Status chip. The dot repeats the state's color next to its label; it never appears without text. */
export function Badge({ tone, children, busy }: { tone: Tone; children: ReactNode; busy?: boolean }) {
  const t = TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-small font-medium ${t.chip}`}
    >
      {busy ? (
        <Icon icon={LoaderCircle} size={12} className="animate-spin" />
      ) : (
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}

export function FileBadge({ status }: { status: FileStatus }) {
  const s = FILE_STATUS[status];
  return (
    <Badge tone={s.tone} busy={status === "processing"}>
      {s.label}
    </Badge>
  );
}

export function ComplaintBadge({ status }: { status: ComplaintStatus }) {
  const s = COMPLAINT_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
