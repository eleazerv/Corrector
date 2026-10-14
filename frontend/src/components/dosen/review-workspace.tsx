"use client";
// Halaman "Periksa Nilai" memakai backend.
// Kiri: daftar mahasiswa (yang perlu dicek di atas). Kanan: foto + nilai per soal.
// Aksi dosen dibuat sedikit & jelas: "Ubah nilai" per soal, "Nilai sudah benar" per lembar, "Nilai ulang" kalau gagal.

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CircleCheck, ClipboardCheck, Pencil, RotateCw, TriangleAlert } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import type { ProgressItem, SheetDetail } from "@/lib/backend-types";
import { BUSY_STATUSES, confidenceLabel, dateTime, num, questionTypeLabel, score } from "@/lib/format";
import { invalidate, useApi } from "@/lib/use-api";
import { useProgress } from "@/lib/use-progress";
import { Badge, SheetBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, inputClass, textareaClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { Banner, EmptyState, InternalPanel } from "@/components/ui/panels";
import { LoadError, Loading } from "@/components/ui/state";
import { useToast } from "@/components/ui/toast";
import { AnswerPhoto } from "./answer-photo";
import { useExam } from "./exam-frame";
import { MathText } from "@/components/ui/math-text"; // changed by claude: tampilkan LaTeX

const GRADED = ["graded", "reviewed", "published"];

export function ReviewWorkspace() {
  const { ct } = useExam();
  const router = useRouter();
  const params = useSearchParams();
  const progress = useProgress(ct.id);

  if (progress.loading && !progress.data) return <Loading text="Memuat daftar lembar…" />;
  if (progress.error || !progress.data)
    return <LoadError title="Daftar lembar gagal dimuat." message={progress.error ?? ""} onRetry={progress.reload} />;

  const sheets = progress.data.items
    .filter((i) => i.student_test_id)
    .sort((a, b) => Number(b.needs_review && b.status === "graded") - Number(a.needs_review && a.status === "graded"));
  if (sheets.length === 0)
    return (
      <EmptyState icon={ClipboardCheck} title="Belum ada lembar jawaban.">
        Unggah foto lembar jawaban di langkah 2. Setelah AI selesai menilai, nilainya muncul di sini.
      </EmptyState>
    );

  const selectedId = params.get("lembar") ?? sheets.find((s) => GRADED.includes(s.status))?.student_test_id ?? sheets[0].student_test_id!;
  const idx = sheets.findIndex((s) => s.student_test_id === selectedId);
  const go = (id: string) => router.replace(`/dosen/ujian/${ct.id}/review?lembar=${id}`, { scroll: false });
  const toCheck = sheets.filter((s) => s.status === "graded" && s.needs_review).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
      <aside aria-label="Daftar mahasiswa" className="self-start">
        <p className="mb-2 font-semibold">
          {toCheck > 0 ? `${toCheck} lembar perlu Anda cek` : "Semua lembar sudah aman"}
        </p>
        <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto rounded-md border border-border bg-surface">
          {sheets.map((s) => (
            <li key={s.student_test_id}>
              <button
                type="button"
                onClick={() => go(s.student_test_id!)}
                aria-current={s.student_test_id === selectedId ? "true" : undefined}
                className={`flex w-full flex-col gap-1 px-4 py-3 text-left ${s.student_test_id === selectedId ? "bg-primary-soft" : "hover:bg-bg"}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{s.name}</span>
                  <span className="tabular text-small">{GRADED.includes(s.status) ? num(s.total_grade) : ""}</span>
                </span>
                <span className="flex items-center justify-between gap-2 text-small text-text-muted">
                  <span className="tabular">{s.nim}</span>
                  <SheetBadge status={s.status} needsReview={s.needs_review} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <SheetPanel
        key={selectedId}
        sheetId={selectedId}
        item={sheets[idx]}
        prev={idx > 0 ? sheets[idx - 1].student_test_id : null}
        next={idx >= 0 && idx < sheets.length - 1 ? sheets[idx + 1].student_test_id : null}
        onGo={go}
        onChanged={() => {
          progress.reload();
          invalidate("/class-tests");
        }}
      />
    </div>
  );
}

function SheetPanel({
  sheetId,
  item,
  prev,
  next,
  onGo,
  onChanged,
}: {
  sheetId: string;
  item: ProgressItem | undefined;
  prev: string | null;
  next: string | null;
  onGo: (id: string) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const sheet = useApi<SheetDetail>(`/student-tests/${sheetId}`);
  const [focusQ, setFocusQ] = useState<string | null>(null);
  const [editing, setEditing] = useState<SheetDetail["answers"][number] | null>(null);
  const [approving, setApproving] = useState(false);
  const [regrading, setRegrading] = useState(false);

  if (sheet.loading && !sheet.data) return <Loading text="Memuat lembar jawaban…" />;
  if (sheet.error || !sheet.data) return <LoadError title="Lembar gagal dimuat." message={sheet.error ?? ""} onRetry={sheet.reload} />;
  const s = sheet.data;
  const graded = GRADED.includes(s.status);
  const busy = BUSY_STATUSES.includes(s.status) || (item ? BUSY_STATUSES.includes(item.status) : false);
  const flagged = s.answers.filter((a) => a.needs_review).length;
  const boxes = s.answers.filter((a) => !focusQ || a.question.id === focusQ).flatMap((a) => a.bbox ?? []);

  async function approve() {
    setApproving(true);
    try {
      await apiFetch(`/student-tests/${s.id}/approve`, { method: "POST" });
      toast({ tone: "success", text: `Nilai ${s.student.name} ditandai sudah benar.` });
      sheet.reload();
      onChanged();
      if (next) onGo(next);
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setApproving(false);
    }
  }

  async function regrade() {
    setRegrading(true);
    try {
      await apiFetch(`/student-tests/${s.id}/regrade`, { method: "POST", body: JSON.stringify({}) });
      toast({ tone: "info", text: "Lembar dikirim ulang ke AI. Nilainya muncul lagi dalam beberapa menit." });
      onChanged();
      sheet.reload();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setRegrading(false);
    }
  }

  return (
    <section aria-label={`Lembar ${s.student.name}`} className="min-w-0 space-y-5">
      <div className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-h2">{s.student.name}</h2>
          <p className="tabular text-text-muted">NIM {s.student.nim}</p>
        </div>
        <div className="text-right">
          <span className="block text-small text-text-muted">Nilai total</span>
          <span className="tabular text-score-lg font-bold">{graded ? score(s.total_grade, s.test.max_score) : "-"}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button icon={ArrowLeft} disabled={!prev} onClick={() => prev && onGo(prev)}>
          Sebelumnya
        </Button>
        <Button icon={ArrowRight} disabled={!next} onClick={() => next && onGo(next)}>
          Berikutnya
        </Button>
        <span className="flex-1" />
        {(s.status === "failed" || s.status === "quota_exceeded" || graded) && s.status !== "published" && (
          <Button icon={RotateCw} loading={regrading} loadingText="Mengirim…" onClick={regrade}>
            Nilai ulang dengan AI
          </Button>
        )}
        {s.status === "graded" && (
          <Button variant="primary" icon={CircleCheck} loading={approving} loadingText="Menyimpan…" onClick={approve}>
            Nilai ini sudah benar
          </Button>
        )}
      </div>

      {busy && (
        <Banner tone="info" title="AI masih memproses lembar ini.">
          Nilai muncul otomatis setelah selesai.
        </Banner>
      )}
      {s.status === "failed" && (
        <Banner tone="danger" title="AI gagal menilai lembar ini.">
          Klik &quot;Nilai ulang dengan AI&quot;. Kalau tetap gagal, unggah ulang fotonya di langkah 2.
        </Banner>
      )}
      {s.status === "needs_reupload" && (
        <Banner tone="danger" title="Foto kurang jelas.">
          Unggah ulang foto lembar ini di langkah 2.
        </Banner>
      )}
      {s.status === "graded" && flagged > 0 && (
        <Banner tone="warning" title={`${flagged} soal perlu Anda cek.`}>
          AI kurang yakin dengan nilainya. Lihat alasannya di bawah, lalu ubah nilai bila perlu.
        </Banner>
      )}
      {s.status === "reviewed" && (
        <Banner tone="success" title="Lembar ini sudah Anda periksa." />
      )}

      <div className="grid gap-6 2xl:grid-cols-2">
        <div className="2xl:sticky 2xl:top-4 2xl:self-start">
          <h3 className="mb-2 text-h3 font-bold">Foto jawaban</h3>
          {focusQ && (
            <p className="mb-2 text-small">
              Menampilkan kotak untuk 1 soal.{" "}
              <button type="button" className="font-semibold text-primary underline" onClick={() => setFocusQ(null)}>
                Tampilkan semua
              </button>
            </p>
          )}
          <AnswerPhoto pages={s.pages} boxes={boxes} />
        </div>

        <ol className="space-y-4">
          {s.answers.map((a) => (
            <li key={a.question.id} className={`rounded-md border bg-surface p-4 sm:p-5 ${a.needs_review ? "border-2 border-warning" : "border-border"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-h3 font-bold">Soal {a.question.number}</h3>
                  <p className="text-small text-text-muted">{questionTypeLabel(a.question.type)}</p>
                </div>
                <span className="tabular text-score-md font-bold">{a.grade === null ? "-" : score(a.grade, a.question.max_points)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {a.needs_review && (
                  <Badge tone="warning">
                    <Icon icon={TriangleAlert} size={14} /> Perlu dicek
                  </Badge>
                )}
                {a.grade !== null && <Badge tone={confidenceLabel(a.confidence_grading).tone}>{confidenceLabel(a.confidence_grading).label}</Badge>}
                {a.override && <Badge tone="info">Diubah dosen</Badge>}
                {a.answer_status === "unanswered" && <Badge tone="neutral">Tidak dijawab</Badge>}
                {a.answer_status === "unmapped" && <Badge tone="danger">Jawaban tidak ditemukan di foto</Badge>}
              </div>
              <p className="mt-3 text-text-muted">{a.question.text}</p>

              {a.criteria_result.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {a.criteria_result.map((c) => (
                    <li key={c.criterion_id} className="rounded-md bg-bg px-3 py-2">
                      <p className="flex items-start justify-between gap-3 font-semibold">
                        <span>{c.description ?? "Kriteria"}</span>
                        <span className="tabular shrink-0">{score(c.points, c.max_points)}</span>
                      </p>
                      {c.reasoning && <p className="mt-1 text-small">{c.reasoning}</p>}
                    </li>
                  ))}
                </ul>
              )}

              {a.override && (
                <p className="mt-3 rounded-md border-l-4 border-info bg-info-soft px-3 py-2 text-small">
                  Nilai diubah dari {num(a.override.old_grade)} menjadi {num(a.override.new_grade)} oleh {a.override.by} (
                  {dateTime(a.override.at)}). Alasan: {a.override.reason}
                </p>
              )}

              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer py-2 font-semibold text-primary">Lihat teks jawaban & kunci</summary>
                <div className="space-y-3">
                  <div>
                    <p className="text-small font-semibold">Jawaban mahasiswa (hasil baca AI)</p>
                    <MathText className="rounded-md bg-bg px-3 py-2 text-small" text={a.answer_text || "(kosong)"} />
                  </div>
                  <InternalPanel>
                    <p className="text-small font-semibold">Kunci jawaban</p>
                    <MathText className="text-small" text={a.question.key_answer} />
                  </InternalPanel>
                </div>
              </details>

              <div className="mt-3 flex flex-wrap gap-2">
                {a.bbox?.length > 0 && (
                  <Button compact variant="tertiary" onClick={() => setFocusQ(a.question.id)}>
                    Tunjukkan di foto
                  </Button>
                )}
                {a.id && graded && s.status !== "published" && (
                  <Button compact icon={Pencil} onClick={() => setEditing(a)}>
                    Ubah nilai
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <OverrideModal
        answer={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          sheet.reload();
          onChanged();
        }}
      />
    </section>
  );
}

function OverrideModal({
  answer,
  onClose,
  onSaved,
}: {
  answer: SheetDetail["answers"][number] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [grade, setGrade] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const max = answer?.question.max_points ?? 0;

  function close() {
    setGrade("");
    setReason("");
    setErrors({});
    setServerError(null);
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!answer?.id) return;
    const g = Number(grade.replace(",", "."));
    const errs: Record<string, string> = {};
    if (grade.trim() === "" || Number.isNaN(g) || g < 0 || g > max) errs.grade = `Isi angka antara 0 dan ${num(max)}.`;
    if (reason.trim().length < 3) errs.reason = "Tulis alasan singkat. AI belajar dari alasan ini untuk penilaian berikutnya.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setServerError(null);
    try {
      await apiFetch(`/test-answers/${answer.id}/override`, {
        method: "POST",
        body: JSON.stringify({ new_grade: g, reason: reason.trim() }),
      });
      toast({ tone: "success", text: `Nilai soal ${answer.question.number} diubah menjadi ${num(g)}.` });
      setGrade("");
      setReason("");
      onSaved();
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(answer)}
      onClose={close}
      title={`Ubah nilai soal ${answer?.question.number ?? ""}`}
      footer={
        <>
          <Button onClick={close} disabled={saving}>
            Batal
          </Button>
          <Button type="submit" form="form-override" variant="primary" loading={saving} loadingText="Menyimpan…">
            Simpan nilai
          </Button>
        </>
      }
    >
      <form id="form-override" onSubmit={submit} noValidate className="space-y-4">
        {serverError && (
          <Banner tone="danger" title="Nilai belum tersimpan.">
            {serverError}
          </Banner>
        )}
        <p>
          Nilai dari AI: <b className="tabular">{answer ? score(answer.grade, max) : ""}</b>
        </p>
        <div className="max-w-[200px]">
          <Field id="ov-grade" label={`Nilai baru (0 – ${num(max)})`} required error={errors.grade}>
            <input
              id="ov-grade"
              inputMode="decimal"
              className={`${inputClass} text-h3`}
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              aria-invalid={Boolean(errors.grade)}
              autoFocus
            />
          </Field>
        </div>
        <Field
          id="ov-reason"
          label="Alasan"
          required
          error={errors.reason}
          help="Contoh: Langkah sudah benar, hanya salah hitung di akhir. Alasan ini tidak dilihat mahasiswa."
        >
          <textarea id="ov-reason" rows={3} className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={Boolean(errors.reason)} />
        </Field>
      </form>
    </Modal>
  );
}
