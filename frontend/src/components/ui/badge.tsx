// badge memakai status backend (lib/format.ts), bukan lagi status data contoh.
import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { CLASS_TEST_STATUS, COMPLAINT_STATUS, sheetStatus, type Tone } from "@/lib/format";
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

/** Status lembar jawaban 1 mahasiswa. */
export function SheetBadge({ status, needsReview }: { status: string; needsReview?: boolean }) {
  const s = sheetStatus(status, needsReview);
  return (
    <Badge tone={s.tone} busy={"busy" in s ? s.busy : false}>
      {s.label}
    </Badge>
  );
}

/** Tahap ujian di kelas. */
export function ClassTestBadge({ status }: { status: string }) {
  const s = CLASS_TEST_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ComplaintBadge({ status }: { status: string }) {
  const s = COMPLAINT_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
