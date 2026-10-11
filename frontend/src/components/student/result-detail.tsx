"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { api, type MyAnswer, type MyTestDetail } from "@/lib/data";
import { complaintStatus, formatDate } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { Page, PageHead } from "@/components/app/page";
import { ButtonLink } from "@/components/kit/button";
import { Icon } from "@/components/kit/icon";
import { FinalScore } from "@/components/kit/score";
import { ErrorState, Loading, Notice, StatusTag } from "@/components/kit/status";
import { PagePhotos } from "@/components/exam/page-photos";

const ANSWER_STATUS: Record<string, string> = {
  unanswered: "Tidak ada jawaban yang terbaca untuk soal ini.",
  unmapped: "Jawaban soal ini tidak ditemukan di foto lembar Anda.",
};

function QuestionResult({ q, r, onPhotosExpired }: { q: MyAnswer; r: MyTestDetail; onPhotosExpired: () => void }) {
  const [photos, setPhotos] = useState(false);
  const complaint = q.test_answer_id ? r.complaints.find((c) => c.test_answer_id === q.test_answer_id) : undefined;
  const fb = q.student_feedback;
  const pointNotes = fb.points.filter((p) => p.feedback);
  const startPage = q.bbox.length > 0 ? Math.min(...q.bbox.map((b) => b.page_no)) : undefined;

  return (
    <section aria-labelledby={`q-${q.number}`} className="rounded-md border border-rule bg-surface px-5 py-5">
      <div className="flex items-start justify-between gap-4">
        <h2 id={`q-${q.number}`} className="text-xl">
          Soal {q.number}
        </h2>
        <span className="shrink-0 text-xl">
          <FinalScore value={q.grade} max={q.max_points} />
        </span>
      </div>
      <p className="mt-1 text-pencil">{q.question_text}</p>

      {q.answer_status && ANSWER_STATUS[q.answer_status] && (
        <p className="mt-3 text-sm text-pencil">{ANSWER_STATUS[q.answer_status]}</p>
      )}

      {(fb.summary || pointNotes.length > 0) && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-pencil">{q.adjusted_by_teacher ? "Catatan" : "Umpan balik"}</h3>
          {fb.summary && <p className="mt-1 max-w-[70ch]">{fb.summary}</p>}
          {pointNotes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {pointNotes.map((p) => (
                <li key={p.no} className="flex gap-3">
                  <span className="num shrink-0 text-pencil">
                    {p.points}/{p.max_points}
                  </span>
                  <span>{p.feedback}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {q.answer_text && (
        <details className="group mt-4 rounded-md border border-rule">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-medium">
            <Icon icon={ChevronRight} size={14} className="transition-transform group-open:rotate-90" />
            Jawaban Anda, hasil baca foto
          </summary>
          <p className="border-t border-rule px-4 py-3 leading-relaxed whitespace-pre-line">{q.answer_text}</p>
        </details>
      )}

      {r.pages.length > 0 && (
        <details
          className="group mt-2 rounded-md border border-rule"
          onToggle={(e) => setPhotos((e.target as HTMLDetailsElement).open)}
        >
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-medium">
            <Icon icon={ChevronRight} size={14} className="transition-transform group-open:rotate-90" />
            Lihat di foto lembar
          </summary>
          <div className="border-t border-rule px-4 py-3">
            {photos && (
              <PagePhotos
                pages={r.pages}
                boxes={q.bbox}
                startPage={startPage}
                caption="Kotak menandai bagian jawaban yang dinilai untuk soal ini."
                onExpired={onPhotosExpired}
              />
            )}
          </div>
        </details>
      )}

      {complaint && (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-pencil">Keberatan Anda:</span>
          <StatusTag tone={complaintStatus(complaint.status, "student").tone}>
            {complaintStatus(complaint.status, "student").label}
          </StatusTag>
          <Link href="/mahasiswa/keberatan" className="underline decoration-rule-strong underline-offset-4">
            Lihat
          </Link>
        </p>
      )}
    </section>
  );
}

function Body({ r, reload }: { r: MyTestDetail; reload: () => void }) {
  const general = r.complaints.find((c) => c.test_answer_id === null);

  return (
    <>
      <PageHead
        crumbs={[{ href: "/mahasiswa", label: "Nilai saya" }]}
        title={r.test_name}
        meta={[r.subject_name, r.published_at && `dipublikasikan ${formatDate(r.published_at)}`].filter(Boolean).join(" · ")}
      />

      <div className="flex flex-col gap-6 border-b border-rule pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-pencil">Nilai akhir</p>
          <p className="mt-2">
            <FinalScore value={r.total_grade} max={r.max_score} size="xl" />
          </p>
        </div>
        <div className="sm:text-right">
          <ButtonLink href={`/mahasiswa/nilai/${r.student_test_id}/keberatan`}>Ajukan keberatan</ButtonLink>
          <p className="mt-2 max-w-[40ch] text-sm text-pencil">
            Kalau menurut Anda ada bagian jawaban yang belum dinilai dengan tepat.
          </p>
        </div>
      </div>

      {general && (
        <div className="mt-6">
          <Notice title={`Keberatan atas nilai keseluruhan: ${complaintStatus(general.status, "student").label.toLowerCase()}`}>
            <Link href="/mahasiswa/keberatan" className="underline underline-offset-4">
              Lihat keberatan saya
            </Link>
          </Notice>
        </div>
      )}

      <div className="mt-8 space-y-4">
        {r.answers.map((q) => (
          <QuestionResult key={q.number} q={q} r={r} onPhotosExpired={reload} />
        ))}
      </div>
    </>
  );
}

export function StudentResultDetail({ studentTestId }: { studentTestId: string }) {
  const res = useResource(`my-result:${studentTestId}`, () => api.myTest(studentTestId));
  return (
    <Page>
      {res.loading ? (
        <Loading what="nilai" />
      ) : res.error ? (
        <ErrorState error={res.error} onRetry={res.reload} />
      ) : res.data ? (
        <Body r={res.data} reload={res.reload} />
      ) : null}
    </Page>
  );
}
