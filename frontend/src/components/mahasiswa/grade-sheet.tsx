"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { examMax, finalScore, formatDateLong, formatNumber, scoreText, submissionFinalTotal } from "@/lib/grading";
import type { ClassRoom, Exam, Submission } from "@/lib/types";
import { Icon } from "@/components/ui/icon";

/**
 * The student-facing result sheet (design.md §8.8). Only student-safe fields are read here:
 * final scores, studentFeedback, and quotes from the student's own answer. No rubric, key,
 * keywords, weights, or AI reasoning ever reach this component's output.
 */
export function GradeSheet({
  exam,
  cls,
  submission,
  footer,
}: {
  exam: Exam;
  cls: ClassRoom;
  submission: Submission;
  footer?: ReactNode;
}) {
  const view = exam.studentView;
  const max = examMax(exam);
  const total = submissionFinalTotal(submission);
  return (
    <article className="rounded-lg border border-border bg-surface">
      <header className="border-b border-border px-5 py-6 sm:px-8">
        <p className="text-small text-text-muted">
          {cls.name} • {cls.period}
        </p>
        <h1 className="mt-0.5 text-h1">{exam.title}</h1>
        <div className="mt-6 flex items-end justify-between gap-4">
          <p className="tabular leading-none">
            <span className="text-score-lg font-semibold text-ink">{formatNumber(total)}</span>
            <span className="ml-1 text-h2 font-medium text-text-muted">/ {max}</span>
          </p>
          <p className="pb-1 text-right text-small text-text-muted">
            {submission.publishedAt ? (
              <>
                Dipublikasikan
                <br />
                {formatDateLong(submission.publishedAt)}
              </>
            ) : (
              "Belum dipublikasikan"
            )}
          </p>
        </div>
        {view.perQuestion && (
          <div className="mt-5">
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
              {exam.questions.map((q) => {
                const g = submission.grades.find((x) => x.questionId === q.id);
                const got = g ? finalScore(g) : 0;
                return (
                  <span key={q.id} className="flex bg-disabled" style={{ flexGrow: q.maxScore }}>
                    <span className="bg-ink" style={{ width: `${(got / q.maxScore) * 100}%` }} />
                  </span>
                );
              })}
            </div>
            <p className="mt-2 text-small text-text-muted">
              Lebar tiap bagian sesuai nilai maksimum soalnya; bagian berwarna adalah nilai yang Anda peroleh.
            </p>
          </div>
        )}
      </header>

      {view.perQuestion ? (
        <ul className="divide-y divide-border">
          {exam.questions.map((q) => {
            const grade = submission.grades.find((g) => g.questionId === q.id);
            if (!grade) return null;
            const page = submission.pages.find((p) => p.questionId === q.id);
            return (
              <QuestionRow key={q.id} title={`Soal ${q.number}`} score={scoreText(finalScore(grade), q.maxScore)}>
                <p className="text-small text-text-muted">{q.prompt}</p>
                <h3 className="mt-4 text-small font-medium text-text-muted">Umpan balik</h3>
                <p className="mt-1 max-w-[68ch]">{grade.studentFeedback}</p>
                {view.overrideReason && grade.override && (
                  <>
                    <h3 className="mt-4 text-small font-medium text-text-muted">Catatan dosen</h3>
                    <p className="mt-1 max-w-[68ch]">{grade.override.reason}</p>
                  </>
                )}
                {view.evidence && grade.evidence.length > 0 && page && (
                  <EvidenceToggle
                    items={grade.evidence.map((e, i) => ({
                      n: i + 1,
                      plus: e.effect === "plus",
                      quote: e.quote,
                      where: `Halaman ${e.page}, paragraf ${e.paragraph + 1}`,
                    }))}
                  />
                )}
              </QuestionRow>
            );
          })}
        </ul>
      ) : (
        <p className="px-5 py-5 text-text-muted sm:px-8">Dosen tidak menampilkan rincian nilai per soal untuk ujian ini.</p>
      )}

      {footer && <div className="border-t border-border px-5 py-5 sm:px-8">{footer}</div>}
    </article>
  );
}

function QuestionRow({ title, score, children }: { title: string; score: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = `soal-${title.replace(/\s/g, "")}`;
  return (
    <li>
      <h2 className="text-body">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left hover:bg-bg sm:px-8"
        >
          <span className="flex-1 font-medium">{title}</span>
          <span className="tabular text-h3 font-semibold">{score}</span>
          <Icon icon={ChevronDown} className={`shrink-0 transition-transform duration-[180ms] ${open ? "rotate-180" : ""}`} />
        </button>
      </h2>
      <div id={id} hidden={!open} className="px-5 pb-6 sm:px-8">
        {children}
      </div>
    </li>
  );
}

function EvidenceToggle({ items }: { items: { n: number; plus: boolean; quote: string; where: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="min-h-11 font-medium underline decoration-border-strong underline-offset-4 hover:decoration-current"
      >
        {open ? "Sembunyikan bagian jawaban" : "Lihat bagian jawaban"}
      </button>
      {open && (
        <ol className="mt-2 space-y-3">
          {items.map((e) => (
            <li key={e.n} className="rounded-md border border-border bg-bg px-4 py-3">
              <p className="text-small font-semibold">
                <span className={e.plus ? "text-success" : "text-danger"}>
                  ({e.n}) {e.plus ? "Menambah nilai" : "Mengurangi nilai"}
                </span>
                <span className="font-normal text-text-muted"> • {e.where}</span>
              </p>
              <blockquote className="mt-1">
                <mark className="bg-highlight px-0.5 text-text">&ldquo;{e.quote}&rdquo;</mark>
              </blockquote>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
