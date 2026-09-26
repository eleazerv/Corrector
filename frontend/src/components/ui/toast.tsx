"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Icon } from "./icon";

type ToastTone = "success" | "info" | "error";
interface Toast {
  id: number;
  tone: ToastTone;
  text: string;
  action?: { label: string; onClick: () => void };
}

const ToastContext = createContext<(t: Omit<Toast, "id">) => void>(() => {});

const STYLE: Record<ToastTone, { icon: typeof Info; cls: string }> = {
  success: { icon: CircleCheck, cls: "text-success" },
  info: { icon: Info, cls: "text-info" },
  error: { icon: CircleAlert, cls: "text-danger" },
};

let next = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = next++;
      setToasts((ts) => [...ts, { ...t, id }]);
      // Errors stay until dismissed so the retry action is not lost (design.md §7.11).
      if (t.tone !== "error") setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:inset-x-auto sm:top-20 sm:right-6 sm:bottom-auto sm:w-96"
      >
        {toasts.map((t) => {
          const s = STYLE[t.tone];
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex items-start gap-3 rounded-md border border-border bg-surface px-4 py-3 shadow-md"
            >
              <Icon icon={s.icon} className={`mt-0.5 shrink-0 ${s.cls}`} />
              <div className="flex-1">
                <p>{t.text}</p>
                {t.action && (
                  <button
                    type="button"
                    onClick={() => {
                      dismiss(t.id);
                      t.action!.onClick();
                    }}
                    className="mt-1 min-h-11 font-semibold text-primary underline underline-offset-4"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Tutup notifikasi"
                className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg"
              >
                <Icon icon={X} size={18} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
