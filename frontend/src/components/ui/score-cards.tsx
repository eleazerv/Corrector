import { BadgeCheck } from "lucide-react";
import { CONFIDENCE_LABEL, aiScore, finalScore, formatDateTime, scoreText } from "@/lib/grading";
import type { Grade } from "@/lib/types";
import { Badge } from "./badge";
import { Icon } from "./icon";

/**
 * AI suggestion vs lecturer decision (design.md §7.6): dashed and muted for the AI draft,
 * solid navy for the official score. The border style carries the meaning alongside the label.
 */
export function AiScoreCard({ grade, max }: { grade: Grade; max: number }) {
  return (
    <div className="rounded-md border border-dashed border-border-strong bg-surface p-4">
      <p className="font-semibold text-text-muted">Saran AI</p>
      <p className="tabular mt-1 text-score-md font-bold text-text-muted">{scoreText(aiScore(grade), max)}</p>
      <p className="mt-2 text-small">
        Keyakinan AI: <span className="font-semibold">{CONFIDENCE_LABEL[grade.confidence]}</span>
      </p>
      <p className="text-small text-text-muted">Bukan jaminan kebenaran.</p>
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
    <div className="rounded-md border-2 border-primary bg-primary-soft p-4">
      <p className="flex items-center gap-1.5 font-semibold text-primary">
        <Icon icon={BadgeCheck} />
        Nilai Final
      </p>
      <p className="tabular mt-1 text-score-md font-bold text-primary">{scoreText(finalScore(grade), max)}</p>
      <p className="mt-2 text-small">
        {grade.override ? (
          <>
            Diubah oleh {grade.override.by}
            <br />
            {formatDateTime(grade.override.at)}
          </>
        ) : grade.approved ? (
          <>
            Disetujui oleh {grade.approved.by}
            <br />
            {formatDateTime(grade.approved.at)}
          </>
        ) : (
          <span className="font-semibold text-warning">Belum dikonfirmasi dosen</span>
        )}
      </p>
      {!confirmed && <p className="text-small text-text-muted">Sama dengan Saran AI sampai direview.</p>}
    </div>
  );
}
