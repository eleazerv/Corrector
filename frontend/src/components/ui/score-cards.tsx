import { BadgeCheck } from "lucide-react";
import { CONFIDENCE_LABEL, aiScore, finalScore, formatDateTime, scoreText } from "@/lib/grading";
import type { Confidence, Grade } from "@/lib/types";
import { Badge } from "./badge";
import { Icon } from "./icon";

const CONF_BARS: Record<Confidence, number> = { rendah: 1, sedang: 2, tinggi: 3 };

/**
 * Pencil vs pen: the AI suggestion is graphite with a dashed edge (a draft), the lecturer's
 * score is ink with a solid edge (the decision). Labels carry the meaning; style reinforces it.
 */
export function AiScoreCard({ grade, max }: { grade: Grade; max: number }) {
  const bars = CONF_BARS[grade.confidence];
  return (
    <div className="rounded-lg border border-dashed border-border-strong bg-surface p-4">
      <p className="text-small font-medium text-text-muted">Saran AI</p>
      <p className="tabular mt-1 text-score-md font-semibold text-text-muted">{scoreText(aiScore(grade), max)}</p>
      <div className="mt-3 flex items-center gap-2 text-small">
        <span className="flex gap-0.5" aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <span key={i} className={`h-2.5 w-1.5 rounded-[1px] ${i <= bars ? "bg-text-muted" : "bg-disabled"}`} />
          ))}
        </span>
        <span>
          Keyakinan <span className="font-medium">{CONFIDENCE_LABEL[grade.confidence]}</span>
        </span>
      </div>
      <p className="mt-0.5 text-small text-text-muted">Bukan jaminan kebenaran.</p>
      {grade.reviewRequired && !grade.override && !grade.approved && (
        <div className="mt-2">
          <Badge tone="warning">Perlu Review</Badge>
        </div>
      )}
    </div>
  );
}

export function FinalScoreCard({ grade, max }: { grade: Grade; max: number }) {
  const confirmed = grade.override ?? grade.approved;
  return (
    <div
      className={`rounded-lg border-2 p-4 ${confirmed ? "border-ink bg-ink-soft" : "border-border bg-surface"}`}
    >
      <p className={`flex items-center gap-1.5 text-small font-medium ${confirmed ? "text-ink" : "text-text-muted"}`}>
        <Icon icon={BadgeCheck} size={16} />
        Nilai Final
      </p>
      <p className={`tabular mt-1 text-score-md font-semibold ${confirmed ? "text-ink" : "text-text"}`}>
        {scoreText(finalScore(grade), max)}
      </p>
      <p className="mt-3 text-small">
        {grade.override ? (
          <>
            Diubah oleh {grade.override.by}
            <br />
            <span className="text-text-muted">{formatDateTime(grade.override.at)}</span>
          </>
        ) : grade.approved ? (
          <>
            Disetujui oleh {grade.approved.by}
            <br />
            <span className="text-text-muted">{formatDateTime(grade.approved.at)}</span>
          </>
        ) : (
          <>
            <span className="font-medium text-warning">Belum dikonfirmasi dosen</span>
            <br />
            <span className="text-text-muted">Sama dengan Saran AI sampai direview.</span>
          </>
        )}
      </p>
    </div>
  );
}
