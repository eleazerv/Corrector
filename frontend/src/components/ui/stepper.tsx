import { Check } from "lucide-react";
import { STAGES, stageIndex, stageText } from "@/lib/grading";
import type { ExamStage } from "@/lib/types";
import { Icon } from "./icon";

/** Exam lifecycle Draft → Ditutup (design.md §7.4). Collapses to one line of text on mobile. */
export function Stepper({ stage }: { stage: ExamStage }) {
  const current = stageIndex(stage);
  return (
    <div>
      <p className="font-semibold md:hidden">{stageText(stage)}</p>
      <ol className="hidden items-start md:flex" aria-label="Tahap ujian">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.id} className="flex flex-1 items-start last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                    done
                      ? "border-primary bg-primary text-white"
                      : active
                        ? "border-[3px] border-primary bg-surface"
                        : "border-border-strong bg-surface"
                  }`}
                  aria-hidden="true"
                >
                  {done && <Icon icon={Check} size={16} />}
                  {active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </span>
                <span
                  className={`whitespace-nowrap text-small ${active ? "font-bold text-primary" : done ? "text-text" : "text-text-muted"}`}
                  aria-current={active ? "step" : undefined}
                >
                  {s.label}
                  <span className="sr-only">{done ? " (selesai)" : active ? " (tahap aktif)" : " (belum)"}</span>
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <span
                  className={`mx-2 mt-3.5 h-0.5 flex-1 ${i < current ? "bg-primary" : "bg-border"}`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
