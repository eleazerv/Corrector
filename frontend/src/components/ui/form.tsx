import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./icon";

export const inputClass =
  "min-h-11 md:min-h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text shadow-sm transition-colors duration-[120ms] placeholder:text-text-muted hover:border-border-strong focus:border-ink aria-[invalid=true]:border-danger disabled:bg-disabled";

export const textareaClass = inputClass + " leading-6";

export function Field({
  id,
  label,
  required,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  help?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-medium">
        {label}
        {required && <span className="ml-1 text-small font-normal text-text-muted">wajib</span>}
      </label>
      {children}
      {help && (
        <p id={`${id}-help`} className="mt-1 text-small text-text-muted">
          {help}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 flex items-start gap-1.5 text-small font-semibold text-danger">
      <Icon icon={CircleAlert} size={16} className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}

export function describedBy(id: string, help?: unknown, error?: unknown) {
  return [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

export function Switch({
  id,
  checked,
  onChange,
  label,
  help,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  help?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p id={`${id}-label`} className="font-medium">
          {label}
        </p>
        {help && (
          <p id={`${id}-help`} className="text-small text-text-muted">
            {help}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={help ? `${id}-help` : undefined}
        onClick={() => onChange(!checked)}
        className="flex min-h-11 shrink-0 items-center gap-2"
      >
        <span
          className={`relative h-6 w-10 rounded-full transition-colors duration-[120ms] ${
            checked ? "bg-ink" : "bg-border-strong"
          }`}
        >
          <span
            className={`absolute left-0 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-[120ms] ${
              checked ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </span>
        <span className="w-14 text-left text-small text-text-muted">{checked ? "Aktif" : "Nonaktif"}</span>
      </button>
    </div>
  );
}
