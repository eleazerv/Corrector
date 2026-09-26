"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, Inbox, Send } from "lucide-react";
import { useData } from "@/lib/store";
import { examMax, formatDateLong, scoreText, submissionAiTotal, submissionFinalTotal } from "@/lib/grading";
import type { StudentViewSettings, Submission } from "@/lib/types";
import { FileBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Switch } from "@/components/ui/form";
import { ConfirmModal, Modal } from "@/components/ui/modal";
import { Banner, EmptyState } from "@/components/ui/panels";
import { useToast } from "@/components/ui/toast";
import { GradeSheet } from "@/components/mahasiswa/grade-sheet";
import { useExam } from "./exam-frame";

/** Why a row cannot be selected for publication, or null when it can. */
function blocker(s: Submission): string | null {
  if (s.status === "published") return "Sudah dipublikasikan";
  if (s.status === "ocr_failed") return "OCR gagal, belum ada nilai";
  if (s.status === "review_required") return "Masih perlu review";
  if (s.status === "uploaded" || s.status === "processing") return "Belum dinilai";
  return null;
}

export function PublishGrades() {
  const { exam, cls } = useExam();
  const { data, dispatch } = useData();
  const toast = useToast();
  const subs = data.submissions.filter((s) => s.examId === exam.id && s.studentId);
  const eligible = subs.filter((s) => !blocker(s));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(eligible.map((s) => s.id)));
  const [confirm, setConfirm] = useState(false);
  const [preview, setPreview] = useState<Submission | null>(null);

  const selected = eligible.filter((s) => picked.has(s.id));
  const review = subs.filter((s) => s.status === "review_required").length;
  const failed = subs.filter((s) => s.status === "ocr_failed").length;
  const max = examMax(exam);

  function toggle(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function setView(patch: Partial<StudentViewSettings>) {
    dispatch({ type: "setStudentView", examId: exam.id, settings: { ...exam.studentView, ...patch } });
  }

  function publish() {
    dispatch({ type: "publish", examId: exam.id, submissionIds: selected.map((s) => s.id) });
    toast({ tone: "success", text: `Nilai ${selected.length} mahasiswa dipublikasikan. Mahasiswa kini dapat melihat nilainya.` });
    setPicked(new Set());
    setConfirm(false);
  }

  if (subs.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Belum ada nilai untuk dipublikasikan."
        action={<ButtonLink href={`/dosen/ujian/${exam.id}/unggah`}>Unggah Jawaban</ButtonLink>}
      >
        Nilai muncul di sini setelah jawaban diproses AI dan Anda review.
      </EmptyState>
    );
  }

  const allPicked = eligible.length > 0 && selected.length === eligible.length;

  return (
    <div className="space-y-8">
      {(review > 0 || failed > 0) && (
        <Banner
          tone="warning"
          title="Sebagian jawaban belum siap dipublikasikan."
          action={
            review > 0 ? (
              <Link
                href={`/dosen/ujian/${exam.id}/review?filter=review`}
                className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
              >
                Review sekarang
              </Link>
            ) : undefined
          }
        >
          {[review && `${review} jawaban masih Perlu Review`, failed && `${failed} file OCR Gagal`].filter(Boolean).join(", ")}.
          Jawaban tersebut tidak bisa dipilih sampai selesai ditangani.
        </Banner>
      )}
      {exam.publishedAt && (
        <Banner tone="success" title={`Publikasi pertama: ${formatDateLong(exam.publishedAt)}.`}>
          Perubahan nilai setelah publikasi tercatat di riwayat revisi. Batas pengajuan keberatan:{" "}
          {exam.complaintDeadline ? formatDateLong(exam.complaintDeadline) : "tidak ditentukan"}.
        </Banner>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="ringkasan-nilai" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <h2 id="ringkasan-nilai" className="text-h2">
              Ringkasan nilai
            </h2>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className="h-5 w-5 accent-primary"
                checked={allPicked}
                disabled={eligible.length === 0}
                onChange={() => setPicked(allPicked ? new Set() : new Set(eligible.map((s) => s.id)))}
              />
              Pilih semua yang siap ({eligible.length})
            </label>
          </div>
          <table className="sheet">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Pilih</span>
                </th>
                <th scope="col">Mahasiswa</th>
                <th scope="col" className="num">
                  Saran AI
                </th>
                <th scope="col" className="num">
                  Nilai Final
                </th>
                <th scope="col">Status review</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => {
                const st = data.students.find((x) => x.id === s.studentId)!;
                const why = blocker(s);
                const graded = s.grades.length > 0;
                return (
                  <tr key={s.id}>
                    <td data-label="Pilih">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-primary"
                        aria-label={`Pilih ${st.name}`}
                        checked={!why && picked.has(s.id)}
                        disabled={Boolean(why)}
                        onChange={() => toggle(s.id)}
                      />
                      {why && <span className="ml-2 text-small text-text-muted sm:sr-only">{why}</span>}
                    </td>
                    <td data-label="Mahasiswa">
                      <span className="block font-semibold">{st.name}</span>
                      <span className="tabular text-small text-text-muted">{st.nim}</span>
                    </td>
                    <td data-label="Saran AI" className="num text-text-muted">
                      {graded ? scoreText(submissionAiTotal(s), max) : "–"}
                    </td>
                    <td data-label="Nilai Final" className="num font-semibold text-primary">
                      {graded ? scoreText(submissionFinalTotal(s), max) : "–"}
                    </td>
                    <td data-label="Status">
                      <span className="flex flex-wrap items-center gap-2">
                        <FileBadge status={s.status} />
                        {graded && (
                          <button
                            type="button"
                            onClick={() => setPreview(s)}
                            className="min-h-11 text-small font-semibold text-primary underline-offset-4 hover:underline md:min-h-0"
                          >
                            Pratinjau
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <aside className="space-y-6 self-start">
          <section aria-labelledby="tampilan" className="rounded-md border border-border bg-surface px-4 py-2">
            <h2 id="tampilan" className="pt-2 font-body text-h3 font-bold">
              Yang dilihat mahasiswa
            </h2>
            <div className="divide-y divide-border">
              <Switch
                id="sv-per"
                label="Nilai per soal"
                help="Menampilkan skor dan umpan balik tiap soal."
                checked={exam.studentView.perQuestion}
                onChange={(v) => setView({ perQuestion: v })}
              />
              <Switch
                id="sv-ev"
                label="Bukti jawaban"
                help="Kutipan dari jawaban mahasiswa sendiri."
                checked={exam.studentView.evidence}
                onChange={(v) => setView({ evidence: v })}
              />
              <Switch
                id="sv-reason"
                label="Alasan perubahan nilai"
                help="Alasan yang Anda tulis saat mengubah Saran AI."
                checked={exam.studentView.overrideReason}
                onChange={(v) => setView({ overrideReason: v })}
              />
            </div>
          </section>

          <div className="space-y-3">
            <Button
              icon={Eye}
              className="w-full"
              disabled={!subs.some((s) => s.grades.length)}
              onClick={() => setPreview(selected[0] ?? subs.find((s) => s.grades.length) ?? null)}
            >
              Lihat sebagai mahasiswa
            </Button>
            <Button variant="publish" icon={Send} className="w-full" disabled={selected.length === 0} onClick={() => setConfirm(true)}>
              Publikasikan Nilai ({selected.length})
            </Button>
            {selected.length === 0 && (
              <p className="text-small text-text-muted">Pilih minimal satu mahasiswa yang nilainya sudah siap.</p>
            )}
          </div>
        </aside>
      </div>

      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={publish}
        title={`Publikasikan nilai untuk ${selected.length} mahasiswa?`}
        confirmLabel={`Publikasikan Nilai (${selected.length})`}
        variant="publish"
        requireCheck="Saya sudah memeriksa nilai final"
      >
        <p>
          Mahasiswa akan dapat melihat nilai {exam.title} ({cls.name}). Perubahan setelah publikasi akan tercatat di riwayat
          revisi.
        </p>
      </ConfirmModal>

      <Modal open={preview !== null} onClose={() => setPreview(null)} title="Pratinjau tampilan mahasiswa" size="lg">
        {preview && (
          <div className="rounded-md border-2 border-success p-1">
            <p className="px-3 py-2 text-small font-semibold text-success">
              Pratinjau Tampilan Mahasiswa: {data.students.find((x) => x.id === preview.studentId)?.name}
            </p>
            <GradeSheet exam={exam} cls={cls} submission={preview} />
          </div>
        )}
      </Modal>
    </div>
  );
}
