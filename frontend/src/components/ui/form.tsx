import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./icon";

export const inputClass =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text placeholder:text-text-muted focus:border-2 focus:border-primary focus:px-[11px] aria-[invalid=true]:border-danger disabled:bg-disabled";

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
      <label htmlFor={id} className="mb-1 block font-semibold">
        {label}
        {required && <span className="ml-1 font-normal text-text-muted">(wajib)</span>}
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
        <p id={`${id}-label`} className="font-semibold">
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
          className={`relative h-6 w-11 rounded-sm border-2 transition-colors duration-[120ms] ${
            checked ? "border-primary bg-primary" : "border-border-strong bg-surface"
          }`}
        >
          <span
            className={`absolute left-0 top-0.5 h-4 w-4 rounded-[1px] transition-transform duration-[120ms] ${
              checked ? "translate-x-[22px] bg-white" : "translate-x-0.5 bg-border-strong"
            }`}
          />
        </span>
        <span className="w-12 text-left text-small font-semibold">{checked ? "Aktif" : "Nonaktif"}</span>
      </button>
    </div>
  );
}

/**
 * saklar bulat (pill) yang lebih jelas untuk aksi cepat di kartu.
 * Label teks tetap ditulis ("Dipakai AI" / "Tidak dipakai") supaya arti tidak hanya dari warna.
 */
export function Toggle({
  checked,
  onChange,
  label,
  onText = "Aktif",
  offText = "Nonaktif",
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  onText?: string;
  offText?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex min-h-11 items-center gap-3 rounded-full pr-1 disabled:cursor-wait disabled:opacity-60"
    >
      <span
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-150 ${
          checked ? "bg-success" : "bg-border-strong"
        } group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary`}
      >
        <span
          className={`absolute left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-150 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
      <span className={`font-semibold ${checked ? "text-success" : "text-text-muted"}`}>{checked ? onText : offText}</span>
    </button>
  );
}
