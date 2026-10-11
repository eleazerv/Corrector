"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./button";
import { Icon } from "./icon";

/** Native <dialog>: focus trap, Escape to close, and top-layer stacking come from the browser. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className={`m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] overflow-y-auto rounded-lg border border-border bg-surface p-0 text-text shadow-md ${
        size === "lg" ? "max-w-3xl" : "max-w-lg"
      }`}
    >
      {open && (
        <>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <h2 id={titleId} className="pt-1.5 text-h2">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              title="Tutup"
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg"
            >
              <Icon icon={X} />
            </button>
          </div>
          <div className="px-5 py-5 sm:px-6">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-3 border-t border-border px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              {footer}
            </div>
          )}
        </>
      )}
    </dialog>
  );
}

/**
 * Confirmation for publish, override, reject, delete (design.md §7.10).
 * `requireCheck` adds the "Saya sudah memeriksa" checkbox that gates the action.
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel,
  variant = "primary",
  requireCheck,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  variant?: ButtonVariant;
  requireCheck?: string;
}) {
  const [checked, setChecked] = useState(false);
  const checkId = useId();
  const close = () => {
    setChecked(false);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={
        <>
          <Button onClick={close}>Batal</Button>
          <Button
            variant={variant}
            disabled={Boolean(requireCheck) && !checked}
            onClick={() => {
              setChecked(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">{children}</div>
      {requireCheck && (
        <label htmlFor={checkId} className="mt-5 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-zebra px-3 font-medium">
          <input
            id={checkId}
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="h-4 w-4 accent-ink"
          />
          {requireCheck}
        </label>
      )}
    </Modal>
  );
}
