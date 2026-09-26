import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { COMPLAINT_STATUS, FILE_STATUS, type Tone } from "@/lib/grading";
import type { ComplaintStatus, FileStatus } from "@/lib/types";
import { Icon } from "./icon";

const TONES: Record<Tone, string> = {
  neutral: "bg-disabled text-text",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
};

export function Badge({ tone, children, busy }: { tone: Tone; children: ReactNode; busy?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-2 py-0.5 text-small font-semibold ${TONES[tone]}`}
    >
      {busy && <Icon icon={LoaderCircle} size={14} className="animate-spin" />}
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
