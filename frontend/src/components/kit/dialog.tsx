"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button, type ButtonVariant } from "./button";
import { Icon } from "./icon";

/** Native <dialog>: focus trap, Escape to close and inert background come from the browser. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
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
      onClose={onClose}
      aria-labelledby={titleId}
      className={`m-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-rule bg-surface p-0 text-ink shadow-[0_18px_48px_-12px_rgb(28_26_23/0.35)] ${
        wide ? "max-w-2xl" : "max-w-lg"
      }`}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-32px)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
            <div>
              <h2 id={titleId} className="text-xl">
                {title}
              </h2>
              {description && <div className="mt-1 text-pencil">{description}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-sunken"
            >
              <Icon icon={X} size={20} />
              <span className="sr-only">Tutup</span>
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-rule px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>
          )}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  variant = "primary",
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  variant?: ButtonVariant;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant={variant} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">{body}</div>
    </Dialog>
  );
}
