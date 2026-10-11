import type { ReactNode } from "react";
import { Check, CircleDashed, Info, Minus, TriangleAlert, type LucideIcon } from "lucide-react";
import { MODE } from "@/lib/config";
import { NotAvailableError, errorMessage, servedByMock, type EndpointName } from "@/lib/data";
import type { Tone } from "@/lib/format";
import { Button } from "./button";
import { Icon } from "./icon";

// Only "attention" gets a fill: it is the one state that asks the lecturer to act.
const TONE: Record<Tone, { cls: string; icon: LucideIcon }> = {
  neutral: { cls: "text-pencil", icon: Minus },
  progress: { cls: "text-ink", icon: CircleDashed },
  attention: { cls: "bg-attention-soft text-attention", icon: TriangleAlert },
  done: { cls: "text-ink", icon: Check },
};

/** A status written as text with a glyph, never as colour alone. */
export function StatusTag({ tone, children }: { tone: Tone; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[13px] font-medium ${t.cls}`}>
      <Icon icon={t.icon} size={14} />
      {children}
    </span>
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
  action,
}: {
  tone?: "neutral" | "attention";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const look = {
    neutral: { cls: "border-rule bg-surface", icon: Info, iconCls: "text-pencil" },
    attention: { cls: "border-attention/40 bg-attention-soft", icon: TriangleAlert, iconCls: "text-attention" },
  }[tone];
  return (
    <div className={`flex gap-3 rounded-md border px-4 py-3 ${look.cls}`}>
      <Icon icon={look.icon} size={18} className={`mt-0.5 ${look.iconCls}`} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-10 text-pencil">
      <Icon icon={CircleDashed} size={18} />
      Memuat {what}...
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof NotAvailableError) {
    // The endpoint name stays in the DOM for whoever wires the backend, not in the sentence.
    return (
      <div className="py-6" data-endpoint={error.endpoint}>
        <Notice title={`${error.feature} belum tersedia`}>Bagian ini belum tersambung ke server.</Notice>
      </div>
    );
  }
  return (
    <div className="py-6" role="alert">
      <Notice
        tone="attention"
        title="Data tidak bisa dimuat"
        action={
          onRetry && (
            <Button compact onClick={onRetry}>
              Coba lagi
            </Button>
          )
        }
      >
        {errorMessage(error)}
      </Notice>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-rule-strong px-5 py-8 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-[52ch] text-pencil">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * In live mode, one quiet line saying a section still shows sample data because its endpoint is missing.
 * In demo mode the top bar already says everything is sample data, so this renders nothing.
 */
export function MockNotice({ endpoint, id }: { endpoint: EndpointName; id?: string }) {
  if (MODE !== "live" || !servedByMock(endpoint, id)) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-pencil">
      <Icon icon={Info} size={15} />
      Data contoh, belum tersambung ke server.
    </p>
  );
}
