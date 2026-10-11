import { CircleAlert, CircleCheck, Info, Lock, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./icon";

/**
 * Wraps answer keys, rubric weights, keywords, and internal AI reasoning. The sienna header is the
 * only place that color appears, so "confidential" is recognisable at a glance on every screen.
 */
export function InternalPanel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#ecd5c6] bg-surface">
      <p className="flex flex-wrap items-center gap-x-2 bg-accent-soft px-4 py-2 text-small text-accent">
        <Icon icon={Lock} size={14} />
        <span>
          <span className="label-caps">Internal</span>
          <span>: tidak terlihat oleh mahasiswa</span>
        </span>
      </p>
      <div className="px-4 py-4">
        {title && <h3 className="mb-2 text-h3">{title}</h3>}
        {children}
      </div>
    </section>
  );
}

const BANNER: Record<"info" | "warning" | "danger" | "success", { cls: string; icon: LucideIcon; ic: string }> = {
  info: { cls: "border-border bg-surface", icon: Info, ic: "text-text-muted" },
  warning: { cls: "border-[#f1d9a6] bg-warning-soft", icon: TriangleAlert, ic: "text-warning" },
  danger: { cls: "border-[#f5c2bd] bg-danger-soft", icon: CircleAlert, ic: "text-danger" },
  success: { cls: "border-[#bfe1cb] bg-success-soft", icon: CircleCheck, ic: "text-success" },
};

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
      className={`flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center ${b.cls}`}
    >
      <div className="flex flex-1 gap-3">
        <Icon icon={b.icon} size={18} className={`mt-0.5 shrink-0 ${b.ic}`} />
        <div>
          {title && <p className="font-medium">{title}</p>}
          {children && <div className={title ? "text-text-muted" : ""}>{children}</div>}
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
    <div className="rounded-lg border border-border bg-surface px-6 py-12 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-bg">
        <Icon icon={icon} size={22} className="text-text-muted" />
      </span>
      <p className="mt-4 text-h3 font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-[52ch] text-text-muted">{children}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function SampleNotice() {
  return (
    <p className="border-b border-[#f1d9a6] bg-warning-soft px-4 py-1.5 text-center text-small text-text sm:px-8">
      <span className="font-medium">Prototipe, data contoh.</span> OCR dan penilaian AI disimulasikan; perubahan hilang saat
      halaman dimuat ulang.
    </p>
  );
}
