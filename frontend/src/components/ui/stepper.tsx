import { Check } from "lucide-react";
import { STAGES, stageIndex } from "@/lib/grading";
import type { ExamStage } from "@/lib/types";
import { Icon } from "./icon";

/** Exam lifecycle as a segmented track: filled segments are done, the dark one is current. */
export function Stepper({ stage }: { stage: ExamStage }) {
  const current = stageIndex(stage);
  return (
    <div>
      <p className="mb-2 text-small md:sr-only">
        <span className="font-medium">{STAGES[current].label}</span>
        <span className="text-text-muted"> • tahap {current + 1} dari {STAGES.length}</span>
      </p>
      <ol className="grid grid-cols-6 gap-1.5" aria-label="Tahap ujian">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.id} aria-current={active ? "step" : undefined}>
              <span
                aria-hidden="true"
                className={`block h-1.5 rounded-full ${done ? "bg-border-strong" : active ? "bg-primary" : "bg-disabled"}`}
              />
              <span
                className={`mt-2 hidden items-center gap-1 text-small md:flex ${
                  active ? "font-medium text-text" : "text-text-muted"
                }`}
              >
                {done && <Icon icon={Check} size={14} />}
                {s.label}
              </span>
              <span className="sr-only">
                {s.label} {done ? "(selesai)" : active ? "(tahap aktif)" : "(belum)"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
