"use client";

import Link from "next/link";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { CircleCheck, FileText, Send } from "lucide-react";
import { useData, uid } from "@/lib/store";
import { finalScore, formatDateLong, scoreText } from "@/lib/grading";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FieldError, describedBy, textareaClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Banner, EmptyState } from "@/components/ui/panels";
import { deadlinePassed, usePublishedResult } from "./student-grade";

const MIN_CHARS = 50;
const MAX_MB = 10;

export function ComplaintForm({ examId }: { examId: string }) {
  const { dispatch } = useData();
  const result = usePublishedResult(examId);
  const [questionId, setQuestionId] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!result) {
    return (
      <EmptyState icon={FileText} title="Keberatan belum bisa diajukan." action={<ButtonLink href="/mahasiswa">Kembali ke Nilai Saya</ButtonLink>}>
        Keberatan hanya bisa diajukan untuk nilai yang sudah dipublikasikan.
      </EmptyState>
    );
  }
  const { exam, sub } = result;
  const question = exam.questions.find((q) => q.id === questionId);
  const grade = sub.grades.find((g) => g.questionId === questionId);
  const closed = deadlinePassed(exam.complaintDeadline);

  const qError = tried && !questionId ? "Pilih soal yang ingin Anda ajukan keberatannya." : null;
  const rError =
    tried && reason.trim().length < MIN_CHARS
      ? `Jelaskan alasan Anda minimal ${MIN_CHARS} karakter, sebutkan bagian jawaban yang menurut Anda belum dinilai.`
      : null;

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFileError(null);
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setFileError(`Ukuran lampiran melebihi ${MAX_MB} MB. Pilih file yang lebih kecil.`);
      setFile(null);
      e.target.value = "";
      return;
    }
    setFile(f);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!questionId || reason.trim().length < MIN_CHARS) return;
    setSending(true);
    // Stands in for the API round-trip so the sending state is visible.
    setTimeout(() => {
      dispatch({
        type: "submitComplaint",
        id: uid("k"),
        examId: exam.id,
        questionId,
        reason: reason.trim(),
        attachmentName: file?.name,
      });
      setSending(false);
      setSent(true);
    }, 600);
  }

  if (sent) {
    return (
      <section className="rounded-md border border-border bg-surface px-5 py-8 sm:px-8" aria-live="polite">
        <Icon icon={CircleCheck} size={40} className="text-success" />
        <h1 className="mt-3 text-h1">Keberatan terkirim</h1>
        <p className="mt-2 flex items-center gap-2">
          Status: <Badge tone="info">Baru</Badge>
        </p>
        <h2 className="mt-6 font-body text-h3 font-bold">Langkah selanjutnya</h2>
        <ol className="mt-2 max-w-[68ch] list-decimal space-y-1 pl-5">
          <li>Dosen membaca keberatan Anda beserta jawaban dan nilainya.</li>
          <li>Dosen dapat meminta klarifikasi, menerima perubahan, atau menolak keberatan.</li>
          <li>Status dan catatan dosen tampil di halaman Keberatan Saya.</li>
        </ol>
        <p className="mt-4 text-text-muted">Nilai Anda tidak berubah sampai dosen mengambil keputusan.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/mahasiswa/keberatan" variant="primary">
            Lihat Keberatan Saya
          </ButtonLink>
          <ButtonLink href={`/mahasiswa/nilai/${exam.id}`}>Kembali ke Nilai</ButtonLink>
        </div>
      </section>
    );
  }

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-4 text-small">
        <Link href="/mahasiswa" className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline">
          Nilai Saya
        </Link>
        <span className="mx-2 text-text-muted">/</span>
        <Link href={`/mahasiswa/nilai/${exam.id}`} className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline">
          {exam.title}
        </Link>
      </nav>
      <h1 className="doc-rule pb-4 text-h1">Ajukan keberatan nilai</h1>
      <p className="mt-4 max-w-[68ch] text-text-muted">
        Jelaskan bagian yang menurut Anda belum dinilai dengan tepat. Dosen akan membaca keberatan ini bersama jawaban asli
        Anda.
      </p>
      {exam.complaintDeadline && (
        <p className="mt-2 font-semibold">Batas pengajuan: {formatDateLong(exam.complaintDeadline)}</p>
      )}

      {closed ? (
        <div className="mt-6">
          <Banner tone="warning" title="Batas pengajuan keberatan sudah lewat.">
            Hubungi dosen pengampu langsung bila ada kesalahan nilai yang perlu diperbaiki.
          </Banner>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-6 space-y-8">
          <fieldset aria-describedby={qError ? "q-error" : undefined}>
            <legend className="mb-2 font-semibold">
              1. Soal yang dikeberatkan <span className="font-normal text-text-muted">(wajib)</span>
            </legend>
            <div className="space-y-2">
              {exam.questions.map((q) => {
                const g = sub.grades.find((x) => x.questionId === q.id);
                return (
                  <label
                    key={q.id}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border bg-surface px-4 py-3 ${
                      questionId === q.id ? "border-2 border-primary" : "border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name="soal"
                      value={q.id}
                      checked={questionId === q.id}
                      onChange={() => setQuestionId(q.id)}
                      className="h-5 w-5 accent-primary"
                    />
                    <span className="flex-1 font-semibold">Soal {q.number}</span>
                    {g && <span className="tabular">{scoreText(finalScore(g), q.maxScore)}</span>}
                  </label>
                );
              })}
            </div>
            <FieldError id="q-error" message={qError} />
          </fieldset>

          <Field
            id="alasan"
            label="2. Alasan keberatan"
            required
            error={rError}
            help={
              <span className="tabular" aria-live="polite">
                {reason.trim().length} / minimal {MIN_CHARS} karakter
              </span>
            }
          >
            <textarea
              id="alasan"
              rows={6}
              className={textareaClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Pada paragraf kedua saya sudah menyebut..."
              aria-invalid={Boolean(rError)}
              aria-describedby={describedBy("alasan", true, rError)}
            />
          </Field>

          <Field id="lampiran" label="3. Lampiran" help={`Opsional. Foto atau PDF pendukung, maksimum ${MAX_MB} MB.`} error={fileError}>
            <input
              id="lampiran"
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={onFile}
              aria-describedby={describedBy("lampiran", true, fileError)}
              className="block min-h-11 w-full text-body file:mr-4 file:min-h-11 file:rounded-md file:border file:border-primary file:bg-surface file:px-4 file:font-semibold file:text-primary"
            />
          </Field>

          <section aria-labelledby="ringkas" className="rounded-md border border-border bg-surface p-4 sm:p-5">
            <h2 id="ringkas" className="font-body text-h3 font-bold">
              Ringkasan sebelum dikirim
            </h2>
            <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-[140px_1fr]">
              <dt className="font-semibold">Ujian</dt>
              <dd>{exam.title}</dd>
              <dt className="font-semibold">Soal</dt>
              <dd>
                {question && grade ? `Soal ${question.number} (nilai ${scoreText(finalScore(grade), question.maxScore)})` : "Belum dipilih"}
              </dd>
              <dt className="font-semibold">Alasan</dt>
              <dd className="break-words">{reason.trim() || "Belum diisi"}</dd>
              <dt className="font-semibold">Lampiran</dt>
              <dd className="break-all">{file?.name ?? "Tidak ada"}</dd>
            </dl>
          </section>

          <Button type="submit" variant="primary" icon={Send} loading={sending} loadingText="Mengirim…" className="w-full sm:w-auto">
            Kirim Keberatan
          </Button>
        </form>
      )}
    </div>
  );
}
