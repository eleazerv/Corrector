import type { ReactNode } from "react";
import { Lock, TriangleAlert } from "lucide-react";
import { Icon } from "./icon";

export const inputClass =
  "block w-full min-h-11 rounded-md border border-rule-strong bg-surface px-3 py-2 text-ink placeholder:text-pencil " +
  "md:min-h-10 aria-[invalid=true]:border-2 aria-[invalid=true]:border-attention disabled:bg-sunken";

export const textareaClass = `${inputClass} leading-relaxed`;

export function describedBy(id: string, hint?: unknown, error?: unknown) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

export function Field({
  id,
  label,
  hint,
  error,
  secret,
  optional,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Marks rubric-only fields that students never see. */
  secret?: boolean;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex flex-wrap items-baseline gap-x-2 font-medium">
        <span>{label}</span>
        {optional && <span className="text-sm font-normal text-pencil">opsional</span>}
        {secret && (
          <span className="inline-flex items-center gap-1 text-sm font-normal text-pencil">
            <Icon icon={Lock} size={13} />
            hanya dosen
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-pencil">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-attention">
      <Icon icon={TriangleAlert} size={15} className="mt-0.5" />
      {message}
    </p>
  );
}

export function Switch({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="text-sm text-pencil">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-11 w-14 shrink-0 items-center rounded-full md:h-7 md:w-12 ${
          checked ? "bg-ink" : "border border-rule-strong bg-sunken"
        }`}
      >
        <span className="sr-only">{checked ? "Aktif" : "Nonaktif"}</span>
        <span
          aria-hidden="true"
          className={`absolute h-5 w-5 rounded-full ${checked ? "left-7 bg-surface md:left-6" : "left-1.5 bg-pencil"}`}
        />
      </button>
    </div>
  );
}
