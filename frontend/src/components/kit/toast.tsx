"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import { Icon } from "./icon";

interface ToastItem {
  id: number;
  message: string;
  tone: "done" | "attention";
}

const ToastContext = createContext<(message: string, tone?: ToastItem["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (message: string, tone: ToastItem["tone"] = "done") => {
      const id = ++seq.current;
      setItems((all) => [...all.slice(-2), { id, message, tone }]);
      setTimeout(() => dismiss(id), tone === "attention" ? 8000 : 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "attention" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border px-4 py-3 shadow-[0_10px_30px_-10px_rgb(28_26_23/0.35)] ${
              t.tone === "attention" ? "border-attention/40 bg-attention-soft" : "border-rule bg-surface"
            }`}
          >
            <Icon
              icon={t.tone === "attention" ? TriangleAlert : Check}
              size={18}
              className={`mt-0.5 ${t.tone === "attention" ? "text-attention" : "text-ink"}`}
            />
            <p className="flex-1">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-sunken md:h-8 md:w-8"
            >
              <Icon icon={X} size={16} />
              <span className="sr-only">Tutup pesan</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
