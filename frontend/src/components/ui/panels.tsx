import { CircleAlert, CircleCheck, Info, Lock, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./icon";

/**
 * Wraps answer keys, rubric weights, keywords, and internal AI reasoning (design.md §7.7).
 * The maroon left rule marks confidential content; it is a state marker, not decoration.
 */
export function InternalPanel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-r-md border-l-4 border-accent bg-accent-soft px-4 py-4 sm:px-5">
      <p className="flex flex-wrap items-center gap-x-2 text-small text-accent">
        <Icon icon={Lock} size={16} />
        <span>
          <span className="label-caps">Internal</span>
          <span className="font-semibold">: Tidak terlihat oleh mahasiswa</span>
        </span>
      </p>
      {title && <h3 className="mt-3 text-h3 font-bold">{title}</h3>}
      <div className="mt-3 border-t border-accent/25 pt-3">{children}</div>
    </section>
  );
}

const BANNER: Record<"info" | "warning" | "danger" | "success", { cls: string; icon: LucideIcon }> = {
  info: { cls: "border-info bg-info-soft text-text", icon: Info },
  warning: { cls: "border-warning bg-warning-soft text-text", icon: TriangleAlert },
  danger: { cls: "border-danger bg-danger-soft text-text", icon: CircleAlert },
  success: { cls: "border-success bg-success-soft text-text", icon: CircleCheck },
};

const ICON_COLOR = { info: "text-info", warning: "text-warning", danger: "text-danger", success: "text-success" };

export function Banner({
  tone,
  title,
  children,
  action,
}: {
  tone: keyof typeof BANNER;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const b = BANNER[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={`flex flex-col gap-3 rounded-md border px-4 py-3 sm:flex-row sm:items-center ${b.cls}`}
    >
      <div className="flex flex-1 gap-3">
        <Icon icon={b.icon} className={`mt-0.5 shrink-0 ${ICON_COLOR[tone]}`} />
        <div>
          {title && <p className="font-semibold">{title}</p>}
          {children && <div>{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
      <Icon icon={icon} size={48} className="mx-auto text-border-strong" />
      <p className="mt-4 text-h3 font-bold">{title}</p>
      <p className="mx-auto mt-1 max-w-[52ch] text-text-muted">{children}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function SampleNotice() {
  return (
    <p className="border-b border-border bg-warning-soft px-4 py-2 text-center text-small text-text sm:px-8">
      <span className="font-semibold">Prototipe dengan data contoh.</span> OCR dan penilaian AI disimulasikan;
      perubahan hilang saat halaman dimuat ulang.
    </p>
  );
}
