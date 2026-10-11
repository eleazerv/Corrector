"use client";

import { Lock } from "lucide-react";
import type { SheetAnswer, SheetPage } from "@/lib/data";
import { questionTypeLabel } from "@/lib/format";
import { Icon } from "@/components/kit/icon";
import { Notice } from "@/components/kit/status";
import { blockText, markSegments } from "./answer-utils";
import { PagePhotos } from "./page-photos";

const ANSWER_STATUS: Record<string, string> = {
  unanswered: "Mahasiswa tidak menjawab soal ini.",
  irrelevant: "AI menilai jawaban ini tidak menjawab pertanyaan.",
  unmapped: "Tidak ada bagian di foto yang terbaca sebagai jawaban soal ini. Periksa foto halamannya.",
};

/**
 * The question, the student's answer as read from the photo, and the photo itself. When the
 * lecturer selects a criterion in the score panel, its evidence is highlighted in the text and
 * boxed on the photo; nothing is marked otherwise.
 */
export function AnswerView({
  answer,
  pages,
  focusCriterion,
  onPhotosExpired,
}: {
  answer: SheetAnswer;
  pages: SheetPage[];
  focusCriterion: string | null;
  onPhotosExpired: () => void;
}) {
  const q = answer.question;
  const focusIndex = answer.criteria_result.findIndex((r) => r.criterion_id === focusCriterion);
  const focus = focusIndex >= 0 ? answer.criteria_result[focusIndex] : null;
  const evidenceIds = focus?.evidence_block_ids ?? [];
  const needles = evidenceIds.map((id) => blockText(pages, id)).filter((t): t is string => !!t);
  const segments = markSegments(answer.answer_text ?? "", needles);
  const markedInText = segments.some((s) => s.marked);
  const boxes = focus ? answer.bbox.filter((b) => b.criterion_id === focus.criterion_id) : [];
  // Open on the first page this answer has evidence on; every page stays reachable.
  const startPage = answer.bbox.length > 0 ? Math.min(...answer.bbox.map((b) => b.page_no)) : undefined;
  const photoPages = pages.map((p) => ({ page_no: p.page_no, image_url: p.image_url }));

  return (
    <article aria-labelledby="soal-teks">
      <p className="text-sm text-pencil">
        Soal {q.number} · {questionTypeLabel(q.type)} · maks {q.max_points} poin
      </p>
      <h2 id="soal-teks" className="mt-1 text-xl leading-snug">
        {q.text}
      </h2>

      <details className="group mt-3 rounded-md border border-rule bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-medium">
          <Icon icon={Lock} size={14} />
          Kunci jawaban
          <span className="font-normal text-pencil group-open:hidden">(tampilkan)</span>
        </summary>
        <p className="border-t border-rule px-4 py-3 whitespace-pre-line">{q.key_answer || "Belum diisi."}</p>
      </details>

      {answer.id === null ? (
        <div className="mt-6">
          <Notice tone="attention">Soal ini belum punya hasil penilaian untuk lembar ini.</Notice>
        </div>
      ) : (
        ((answer.answer_status && answer.answer_status !== "answered") || answer.ocr_issue) && (
          <div className="mt-6 space-y-3">
            {answer.answer_status && ANSWER_STATUS[answer.answer_status] && (
              <Notice tone="attention">{ANSWER_STATUS[answer.answer_status]}</Notice>
            )}
            {answer.ocr_issue && (
              <Notice tone="attention" title="Tulisan mungkin salah terbaca">
                Cocokkan teks di bawah dengan fotonya sebelum memutuskan.
              </Notice>
            )}
          </div>
        )
      )}

      {answer.answer_text && (
        <section aria-labelledby="jawaban-h" className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <h3 id="jawaban-h" className="text-sm font-medium text-pencil">
              Jawaban mahasiswa, hasil baca foto
            </h3>
            {focus && (
              <p className="text-sm text-pencil" aria-live="polite">
                {evidenceIds.length === 0
                  ? `Kriteria ${focusIndex + 1} tidak punya bukti di jawaban`
                  : markedInText
                    ? `Disorot: bukti kriteria ${focusIndex + 1}`
                    : `Bukti kriteria ${focusIndex + 1} ditandai di foto`}
              </p>
            )}
          </div>
          <p className="mt-2 rounded-md border border-rule bg-surface px-5 py-5 text-[16px] leading-[1.8] whitespace-pre-line">
            {segments.map((s, i) =>
              s.marked ? (
                <mark key={i} className="ev-on text-ink">
                  {s.text}
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </p>
        </section>
      )}

      {photoPages.length > 0 && (
        <section aria-labelledby="foto-h" className="mt-6">
          <h3 id="foto-h" className="mb-2 text-sm font-medium text-pencil">
            Foto lembar
          </h3>
          <PagePhotos
            key={focus?.criterion_id ?? `none-${q.id}`}
            pages={photoPages}
            boxes={boxes}
            startPage={startPage}
            caption={focus ? `Kotak menandai bukti kriteria ${focusIndex + 1}.` : undefined}
            onExpired={onPhotosExpired}
          />
        </section>
      )}
    </article>
  );
}
