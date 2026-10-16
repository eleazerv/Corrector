"use client";
// detail nilai mahasiswa (GET /me/tests/{id}). Hanya data yang aman untuk mahasiswa:
// nilai, foto jawabannya sendiri dengan kotak bukti, dan umpan balik per bagian (tanpa rubrik dosen).
import Link from "next/link";
import { useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import type { MyTestDetail } from "@/lib/backend-types";
import { dateLong, num, score } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { Badge, ComplaintBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { LoadError, Loading } from "@/components/ui/state";
import { AnswerPhoto } from "@/components/dosen/answer-photo";

export function StudentGrade({ examId }: { examId: string }) {
  const detail = useApi<MyTestDetail>(`/me/tests/${examId}`);
  const [focus, setFocus] = useState<number | null>(null);

  if (detail.loading && !detail.data) return <Loading text="Memuat nilai…" />;
  if (detail.error || !detail.data) return <LoadError title="Nilai tidak bisa dibuka." message={detail.error ?? ""} onRetry={detail.reload} />;
  const d = detail.data;
  const boxes = d.answers.filter((a) => focus === null || a.number === focus).flatMap((a) => a.bbox);
  const complaintFor = (id: string | null) => d.complaints.find((c) => c.test_answer_id === id);

  return (
    <article className="space-y-6">
      <header className="doc-rule rounded-md border border-border bg-surface px-5 py-6 text-center sm:px-8">
        <h1 className="text-h1">{d.test_name}</h1>
        <p className="mt-1 text-text-muted">{d.subject_name}</p>
        <p className="tabular mt-5 text-score-lg font-bold text-primary">{score(d.total_grade, d.max_score)}</p>
        <p className="mt-1 text-small text-text-muted">Diumumkan {dateLong(d.published_at)}</p>
      </header>

      <section aria-labelledby="foto">
        <h2 id="foto" className="mb-2 text-h2">
          Lembar jawaban Anda
        </h2>
        {focus !== null && (
          <p className="mb-2 text-small">
            Menampilkan kotak untuk soal {focus}.{" "}
            <button type="button" className="font-semibold text-primary underline" onClick={() => setFocus(null)}>
              Tampilkan semua
            </button>
          </p>
        )}
        <AnswerPhoto pages={d.pages} boxes={boxes} />
      </section>

      <section aria-labelledby="per-soal">
        <h2 id="per-soal" className="mb-3 text-h2">
          Nilai per soal
        </h2>
        <ol className="space-y-4">
          {d.answers.map((a) => {
            const complaint = complaintFor(a.test_answer_id);
            return (
              <li key={a.number} className="rounded-md border border-border bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-h3 font-bold">Soal {a.number}</h3>
                  <span className="tabular text-score-md font-bold">{score(a.grade, a.max_points)}</span>
                </div>
                <p className="mt-1 text-text-muted">{a.question_text}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {a.adjusted_by_teacher && <Badge tone="info">Nilai disesuaikan dosen</Badge>}
                  {complaint && <ComplaintBadge status={complaint.status} />}
                </div>
                {a.student_feedback.summary && <p className="mt-3">{a.student_feedback.summary}</p>}
                {a.student_feedback.points.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {a.student_feedback.points.map((p) => (
                      <li key={p.no} className="flex items-start justify-between gap-3 rounded-md bg-bg px-3 py-2">
                        <span>{p.feedback}</span>
                        <span className="tabular shrink-0 font-semibold">
                          {num(p.points)} / {num(p.max_points)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.bbox.length > 0 && (
                    <button type="button" className="min-h-11 px-2 font-semibold text-primary underline underline-offset-4" onClick={() => setFocus(a.number)}>
                      Tunjukkan di foto
                    </button>
                  )}
                  {a.test_answer_id && !complaint && (
                    <ButtonLink compact icon={MessageSquareWarning} href={`/mahasiswa/nilai/${d.student_test_id}/keberatan?soal=${a.test_answer_id}`}>
                      Ajukan keberatan
                    </ButtonLink>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <p>
        <Link href="/mahasiswa" className="font-semibold text-primary underline underline-offset-4">
          Kembali ke Nilai Saya
        </Link>
      </p>
    </article>
  );
}
