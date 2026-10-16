// langkah bernomor yang bisa diklik (1 Soal -> 2 Unggah -> 3 Periksa -> 4 Umumkan).
// Dibuat besar & jelas untuk dosen yang jarang memakai aplikasi web.
import Link from "next/link";
import { Check } from "lucide-react";
import { Icon } from "./icon";

export interface Step {
  href: string;
  label: string;
  hint: string;
  done: boolean;
  active: boolean;
}

export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <nav aria-label="Langkah penilaian">
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.href}>
            <Link
              href={s.href}
              aria-current={s.active ? "step" : undefined}
              className={`flex h-full min-h-16 items-center gap-3 rounded-md border px-3 py-2 ${
                s.active
                  ? "border-2 border-primary bg-primary-soft"
                  : "border-border bg-surface hover:border-primary"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-9 w-9 shrink-0 translate-y-[5px] items-center justify-center rounded-full text-h3 font-bold ${
                  s.done ? "bg-success text-white" : s.active ? "bg-primary text-white" : "border-2 border-border-strong text-text-muted"
                }`}
              >
                {s.done ? <Icon icon={Check} size={20} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`block font-bold ${s.active ? "text-primary" : ""}`}>{s.label}</span>
                <span className="block text-small text-text-muted">
                  {s.hint}
                  <span className="sr-only">{s.done ? " (selesai)" : ""}</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
