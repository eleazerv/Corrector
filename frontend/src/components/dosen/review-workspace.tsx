"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Eye, FileText, Inbox, PencilLine, ScanSearch } from "lucide-react";
import { useData } from "@/lib/store";
import { aiScore, finalScore, scoreText, submissionFinalTotal, examMax } from "@/lib/grading";
import type { Evidence, Grade, Question, Submission } from "@/lib/types";
import { FileBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FieldError, describedBy, inputClass, textareaClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { ConfirmModal, Modal } from "@/components/ui/modal";
import { Banner, EmptyState, InternalPanel } from "@/components/ui/panels";
import { AiScoreCard, FinalScoreCard } from "@/components/ui/score-cards";
import { Tabs, panelId, tabId } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { GradeSheet } from "@/components/mahasiswa/grade-sheet";
import { useExam } from "./exam-frame";

type Pane = "jawaban" | "ocr" | "penilaian";

export function ReviewWorkspace() {
  const { exam } = useExam();
  const { data } = useData();
  const params = useSearchParams();
  const router = useRouter();
  const filter = params.get("filter") === "review" ? "review" : "all";

  const all = data.submissions.filter(
    (s) => s.examId === exam.id && s.studentId && !["uploaded", "processing"].includes(s.status),
  );
  // The open answer stays in the filtered list after it is reviewed, so the lecturer sees the
  // result of their decision instead of jumping to the next student.
  const pinned = params.get("s");
  const list = filter === "review" ? all.filter((s) => s.status === "review_required" || s.id === pinned) : all;
  const index = Math.max(0, list.findIndex((s) => s.id === pinned));
  const current: Submission | undefined = list[index];

  useEffect(() => {
    if (current && pinned !== current.id) go({ s: current.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, pinned]);

  function go(next: { s?: string; filter?: string }) {
    const q = new URLSearchParams(params.toString());
    if (next.s !== undefined) q.set("s", next.s);
    if (next.filter !== undefined) {
      if (next.filter === "all") q.delete("filter");
      else q.set("filter", next.filter);
      q.delete("s");
    }
    router.replace(`?${q.toString()}`, { scroll: false });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable], dialog")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === "j" || e.key === "J") && index < list.length - 1) go({ s: list[index + 1].id });
      if ((e.key === "k" || e.key === "K") && index > 0) go({ s: list[index - 1].id });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (all.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Belum ada jawaban yang dinilai."
        action={<ButtonLink href={`/dosen/ujian/${exam.id}/unggah`} variant="primary">Unggah Jawaban</ButtonLink>}
      >
        Unggah dan proses file jawaban mahasiswa. Hasil penilaian AI muncul di sini untuk Anda periksa.
      </EmptyState>
    );
  }

  return (
    <div>
      {!current ? (
        <EmptyState
          icon={Inbox}
          title="Semua jawaban yang ditandai sudah direview."
          action={<Button onClick={() => go({ filter: "all" })}>Tampilkan Semua Jawaban</Button>}
        >
          Tidak ada lagi jawaban berstatus Perlu Review. Lanjutkan ke Publikasi bila semua nilai final sudah benar.
        </EmptyState>
      ) : (
        <SubmissionReview key={current.id} sub={current} />
      )}

      <nav
        aria-label="Navigasi antar-mahasiswa"
        className="sticky bottom-0 z-10 mt-6 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-surface px-4 py-3 sm:-mx-8 sm:px-8"
      >
        <Button
          compact
          icon={ChevronLeft}
          disabled={!current || index === 0}
          onClick={() => go({ s: list[index - 1].id })}
          title="Pintasan: K"
          aria-keyshortcuts="K"
        >
          Sebelumnya
        </Button>
        <p className="tabular text-center font-semibold" aria-live="polite">
          {current ? `Mahasiswa ${index + 1} dari ${list.length}` : `0 dari 0`}
        </p>
        <Button
          compact
          disabled={!current || index >= list.length - 1}
          onClick={() => go({ s: list[index + 1].id })}
          title="Pintasan: J"
          aria-keyshortcuts="J"
        >
          Berikutnya
          <Icon icon={ChevronRight} />
        </Button>
        <p className="hidden text-small text-text-muted xl:block">Pintasan keyboard: J berikutnya, K sebelumnya</p>
        <label className="ml-auto flex items-center gap-2">
          <span className="font-semibold">Filter</span>
          <select className={`${inputClass} w-auto`} value={filter} onChange={(e) => go({ filter: e.target.value })}>
            <option value="all">Semua ({all.length})</option>
            <option value="review">Perlu Review ({all.filter((s) => s.status === "review_required").length})</option>
          </select>
        </label>
      </nav>

    </div>
  );
}

function SubmissionReview({ sub }: { sub: Submission }) {
  const { exam } = useExam();
  const { data } = useData();
  const [pane, setPane] = useState<Pane>("penilaian");
  const [qid, setQid] = useState(exam.questions[0]?.id);
  const [activeEv, setActiveEv] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const student = data.students.find((s) => s.id === sub.studentId);
  const question = exam.questions.find((q) => q.id === qid) ?? exam.questions[0];
  const grade = sub.grades.find((g) => g.questionId === question?.id);
  const page = sub.pages.find((p) => p.questionId === question?.id);
  const failed = sub.status === "ocr_failed";

  function showEvidence(ev: Evidence) {
    setActiveEv(ev.id);
    setPane("ocr");
    requestAnimationFrame(() => {
      const el = document.getElementById(`ev-${ev.id}`);
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    });
  }

  const paneCls = (p: Pane) => `${pane === p ? "block" : "hidden"} xl:block min-w-0`;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-h2">{student ? student.name : "Belum dipetakan"}</h2>
          <p className="flex flex-wrap items-center gap-2 text-text-muted">
            <span className="tabular">{student?.nim}</span>
            <span aria-hidden="true">•</span>
            <span className="font-mono text-small">{sub.fileName}</span>
            <FileBadge status={sub.status} />
          </p>
        </div>
        {!failed && (
          <div className="flex items-center gap-4">
            <p className="text-right">
              <span className="block text-small text-text-muted">Total nilai final</span>
              <span className="tabular text-score-md font-bold text-primary">
                {scoreText(submissionFinalTotal(sub), examMax(exam))}
              </span>
            </p>
            <Button icon={Eye} onClick={() => setPreview(true)}>
              Lihat sebagai mahasiswa
            </Button>
          </div>
        )}
      </div>

      {exam.questions.length > 1 && !failed && (
        <div role="group" aria-label="Pilih soal" className="mb-4 flex flex-wrap gap-2">
          {exam.questions.map((q) => {
            const g = sub.grades.find((x) => x.questionId === q.id);
            const open = g && g.reviewRequired && !g.override && !g.approved;
            return (
              <button
                key={q.id}
                type="button"
                aria-pressed={q.id === question?.id}
                onClick={() => {
                  setQid(q.id);
                  setActiveEv(null);
                }}
                className={`min-h-11 rounded-md border px-4 font-semibold ${
                  q.id === question?.id ? "border-primary bg-primary text-white" : "border-border bg-surface hover:border-primary"
                }`}
              >
                Soal {q.number}
                {g && <span className="tabular ml-2 font-normal">{scoreText(finalScore(g), q.maxScore)}</span>}
                {open && <span className="ml-2 font-normal">(perlu review)</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="xl:hidden">
        <Tabs
          group="review"
          label="Area review"
          value={pane}
          onChange={(id) => setPane(id as Pane)}
          tabs={[
            { id: "jawaban", label: "Jawaban" },
            { id: "ocr", label: "OCR" },
            { id: "penilaian", label: "Penilaian" },
          ]}
        />
      </div>

      <div className="mt-4 grid gap-5 xl:mt-0 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(380px,1.15fr)]">
        <section role="tabpanel" id={panelId("review", "jawaban")} aria-labelledby={tabId("review", "jawaban")} className={paneCls("jawaban")}>
          <PaneTitle icon={FileText}>Gambar jawaban</PaneTitle>
          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-small text-text-muted">
              Halaman {page?.page ?? 1} dari {Math.max(sub.pages.length, 1)} • <span className="font-mono">{sub.fileName}</span>
            </p>
            <div
              role="img"
              aria-label={`Jawaban Soal ${question?.number}, halaman ${page?.page ?? 1}, milik ${student?.nim ?? "mahasiswa belum dipetakan"}`}
              className="mt-3 flex aspect-[1/1.3] items-center justify-center rounded-sm border border-dashed border-border-strong bg-bg p-6 text-center text-text-muted"
            >
              <span>
                [Gambar jawaban asli]
                <br />
                <span className="text-small">
                  Pratinjau file belum tersedia di prototipe. Bukti jawaban ditandai pada teks OCR.
                </span>
              </span>
            </div>
          </div>
        </section>

        <section role="tabpanel" id={panelId("review", "ocr")} aria-labelledby={tabId("review", "ocr")} className={paneCls("ocr")}>
          <PaneTitle icon={ScanSearch}>Teks OCR</PaneTitle>
          <div className="rounded-md border border-border bg-surface p-4">
            {failed || !page ? (
              <p className="text-text-muted">Tidak ada teks OCR untuk file ini.</p>
            ) : (
              <OcrText paragraphs={page.paragraphs} evidence={grade?.evidence ?? []} activeId={activeEv} />
            )}
          </div>
        </section>

        <section role="tabpanel" id={panelId("review", "penilaian")} aria-labelledby={tabId("review", "penilaian")} className={paneCls("penilaian")}>
          <PaneTitle icon={PencilLine}>Penilaian</PaneTitle>
          {failed ? (
            <Banner
              tone="danger"
              title="OCR gagal membaca file ini."
              action={<ButtonLink href={`/dosen/ujian/${exam.id}/unggah`}>Buka Unggah Jawaban</ButtonLink>}
            >
              Tulisan tidak terbaca atau gambar terlalu buram. Proses ulang file, atau unggah pindaian yang lebih jelas.
            </Banner>
          ) : grade && question ? (
            <GradePanel key={question.id} sub={sub} question={question} grade={grade} onEvidence={showEvidence} />
          ) : (
            <p className="text-text-muted">Soal ini belum dinilai.</p>
          )}
        </section>
      </div>

      <Modal open={preview} onClose={() => setPreview(false)} title="Pratinjau tampilan mahasiswa" size="lg">
        <div className="rounded-md border-2 border-success p-1">
          <p className="px-3 py-2 text-small font-semibold text-success">
            Pratinjau Tampilan Mahasiswa: persis yang dilihat {student?.name ?? "mahasiswa"} setelah publikasi.
          </p>
          <PreviewSheet sub={sub} />
        </div>
      </Modal>
    </div>
  );
}

export function PreviewSheet({ sub }: { sub: Submission }) {
  const { exam, cls } = useExam();
  return <GradeSheet exam={exam} cls={cls} submission={sub} />;
}

function PaneTitle({ icon, children }: { icon: typeof FileText; children: ReactNode }) {
  return (
    <h3 className="mb-2 hidden items-center gap-2 text-h3 font-bold xl:flex">
      <Icon icon={icon} className="text-primary" />
      {children}
    </h3>
  );
}

/** Highlights evidence quotes inside OCR paragraphs, numbered so meaning never rests on color alone. */
function OcrText({ paragraphs, evidence, activeId }: { paragraphs: string[]; evidence: Evidence[]; activeId: string | null }) {
  return (
    <div className="space-y-4 font-mono text-small leading-6">
      {paragraphs.map((text, pi) => {
        const marks = evidence
          .map((e, n) => ({ e, n: n + 1, at: e.paragraph === pi ? text.indexOf(e.quote) : -1 }))
          .filter((m) => m.at >= 0)
          .sort((a, b) => a.at - b.at);
        const parts: ReactNode[] = [];
        let cursor = 0;
        for (const m of marks) {
          if (m.at < cursor) continue;
          parts.push(text.slice(cursor, m.at));
          parts.push(
            <mark
              key={m.e.id}
              id={`ev-${m.e.id}`}
              className={`rounded-sm bg-highlight px-0.5 text-text underline decoration-2 underline-offset-4 ${
                m.e.effect === "plus" ? "decoration-success" : "decoration-danger"
              } ${activeId === m.e.id ? "outline-2 outline-primary" : ""}`}
            >
              <span className="mr-1 inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-text px-1 font-body text-[13px] font-bold leading-none text-white">
                {m.n}
              </span>
              {m.e.quote}
            </mark>,
          );
          cursor = m.at + m.e.quote.length;
        }
        parts.push(text.slice(cursor));
        return (
          <p key={pi}>
            <span className="mr-2 font-body text-text-muted">¶{pi + 1}</span>
            {parts.map((p, i) => (
              <Fragment key={i}>{p}</Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function GradePanel({
  sub,
  question,
  grade,
  onEvidence,
}: {
  sub: Submission;
  question: Question;
  grade: Grade;
  onEvidence: (e: Evidence) => void;
}) {
  const { dispatch } = useData();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const published = sub.status === "published";
  const open = grade.reviewRequired && !grade.override && !grade.approved;
  const current = grade.override?.criterionScores ?? grade.aiCriterionScores;

  return (
    <div className="space-y-5">
      <p className="text-small text-text-muted">
        <span className="font-semibold text-text">Soal {question.number}.</span> {question.prompt}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <AiScoreCard grade={grade} max={question.maxScore} />
        <FinalScoreCard grade={grade} max={question.maxScore} />
      </div>

      {grade.override && (
        <div className="rounded-md border border-border bg-surface px-4 py-3">
          <p className="font-semibold">Alasan perubahan</p>
          <p className="mt-1">{grade.override.reason}</p>
          {!published && (
            <Button variant="tertiary" compact className="-ml-2 mt-1" onClick={() => setConfirmCancel(true)}>
              Batalkan override
            </Button>
          )}
        </div>
      )}

      {editing ? (
        <OverrideForm
          question={question}
          grade={grade}
          published={published}
          onCancel={() => setEditing(false)}
          onSave={(scores, reason, remember) => {
            dispatch({ type: "override", submissionId: sub.id, questionId: question.id, criterionScores: scores, reason, remember });
            setEditing(false);
            toast({ tone: "success", text: `Nilai Soal ${question.number} diubah dan tercatat di riwayat.` });
          }}
        />
      ) : (
        <>
          <table className="sheet">
            <thead>
              <tr>
                <th scope="col">Kriteria</th>
                <th scope="col" className="num">
                  Saran AI
                </th>
                <th scope="col" className="num">
                  Final
                </th>
              </tr>
            </thead>
            <tbody>
              {question.criteria.map((c) => (
                <tr key={c.id}>
                  <td data-label="Kriteria">{c.name}</td>
                  <td data-label="Saran AI" className="num text-text-muted">
                    {scoreText(grade.aiCriterionScores[c.id] ?? 0, c.max)}
                  </td>
                  <td data-label="Final" className="num font-semibold text-primary">
                    {scoreText(current[c.id] ?? 0, c.max)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant={open ? "primary" : "secondary"}
              icon={PencilLine}
              onClick={() => setEditing(true)}
            >
              Ubah Nilai
            </Button>
            {!grade.override && !grade.approved && (
              <Button
                onClick={() => {
                  dispatch({ type: "approve", submissionId: sub.id, questionId: question.id });
                  toast({ tone: "success", text: `Saran AI Soal ${question.number} disetujui sebagai nilai final.` });
                }}
              >
                Setujui Nilai AI
              </Button>
            )}
          </div>
        </>
      )}

      <section aria-labelledby="bukti">
        <h4 id="bukti" className="font-semibold">
          Bukti jawaban
        </h4>
        {grade.evidence.length === 0 ? (
          <p className="mt-1 text-text-muted">AI tidak menandai bukti untuk soal ini. Periksa teks OCR secara langsung.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {grade.evidence.map((e, i) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onEvidence(e)}
                  className="flex min-h-11 w-full items-start gap-3 rounded-md border border-border bg-surface px-3 py-2 text-left hover:border-primary"
                >
                  <span className="mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-sm bg-text text-small font-bold text-white">
                    {i + 1}
                  </span>
                  <span>
                    <span className={`block text-small font-semibold ${e.effect === "plus" ? "text-success" : "text-danger"}`}>
                      {e.effect === "plus" ? "Menambah skor" : "Mengurangi skor"} • Halaman {e.page}, paragraf {e.paragraph + 1}
                    </span>
                    <span className="block">{e.note}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <InternalPanel title="Reasoning AI">
        <p>{grade.reasoning}</p>
      </InternalPanel>

      <section aria-labelledby="umpan" className="rounded-md border border-border bg-surface px-4 py-3">
        <h4 id="umpan" className="font-semibold">
          Umpan balik untuk mahasiswa
        </h4>
        <p className="mt-1">{grade.studentFeedback}</p>
      </section>

      <ConfirmModal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => {
          dispatch({ type: "cancelOverride", submissionId: sub.id, questionId: question.id });
          setConfirmCancel(false);
          toast({ tone: "info", text: `Override Soal ${question.number} dibatalkan. Nilai kembali ke Saran AI.` });
        }}
        title={`Batalkan perubahan nilai Soal ${question.number}?`}
        confirmLabel="Batalkan Override"
        variant="danger"
      >
        <p>
          Nilai final kembali ke Saran AI ({scoreText(aiScore(grade), question.maxScore)}) dan statusnya menjadi belum
          dikonfirmasi. Pembatalan tercatat di riwayat.
        </p>
      </ConfirmModal>
    </div>
  );
}

function OverrideForm({
  question,
  grade,
  published,
  onCancel,
  onSave,
}: {
  question: Question;
  grade: Grade;
  published: boolean;
  onCancel: () => void;
  onSave: (scores: Record<string, number>, reason: string, remember: boolean) => void;
}) {
  const start = grade.override?.criterionScores ?? grade.aiCriterionScores;
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(question.criteria.map((c) => [c.id, String(start[c.id] ?? 0)])),
  );
  const [reason, setReason] = useState("");
  const [remember, setRemember] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const errors: Record<string, string> = {};
  for (const c of question.criteria) {
    const raw = values[c.id];
    const n = Number(raw.replace(",", "."));
    if (raw.trim() === "" || Number.isNaN(n)) errors[c.id] = "Isi angka.";
    else if (n < 0) errors[c.id] = "Nilai tidak boleh kurang dari 0.";
    else if (n > c.max) errors[c.id] = `Nilai tidak boleh melebihi ${c.max} (nilai maksimum kriteria ini).`;
  }
  const valid = Object.keys(errors).length === 0;
  const scores = Object.fromEntries(question.criteria.map((c) => [c.id, Number(values[c.id].replace(",", "."))]));
  const newTotal = Object.values(scores).reduce((a, b) => a + b, 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid && reason.trim()) setConfirming(true);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-md border-2 border-primary bg-surface p-4">
      <h4 className="text-h3 font-bold">Ubah nilai Soal {question.number}</h4>
      {published && (
        <Banner tone="info">Nilai ini sudah dipublikasikan. Perubahan akan terlihat mahasiswa dan tercatat di riwayat revisi.</Banner>
      )}
      <div className="space-y-3">
        {question.criteria.map((c) => {
          const id = `ov-${c.id}`;
          return (
            <div key={c.id} className="grid gap-1 sm:grid-cols-[1fr_140px] sm:items-start sm:gap-4">
              <label htmlFor={id} className="pt-2.5 font-semibold">
                {c.name}
                <span className="block text-small font-normal text-text-muted">
                  Saran AI {grade.aiCriterionScores[c.id]}, maksimum {c.max}
                </span>
              </label>
              <div>
                <input
                  id={id}
                  inputMode="decimal"
                  className={`${inputClass} tabular text-right`}
                  value={values[c.id]}
                  onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value }))}
                  aria-invalid={Boolean(errors[c.id])}
                  aria-describedby={describedBy(id, false, errors[c.id])}
                />
                <FieldError id={`${id}-error`} message={errors[c.id]} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="tabular font-semibold">
        Total baru: {valid ? scoreText(newTotal, question.maxScore) : "periksa isian di atas"}
      </p>
      <Field
        id="ov-reason"
        label="Alasan perubahan"
        required
        help="Tersimpan bersama nama Anda dan waktu perubahan. Bisa ditampilkan ke mahasiswa bila diaktifkan di Publikasi."
      >
        <textarea
          id="ov-reason"
          rows={3}
          className={textareaClass}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-describedby="ov-reason-help"
        />
      </Field>
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="mt-1 h-5 w-5 accent-primary"
        />
        <span>
          <span className="block font-semibold">Simpan sebagai catatan penilaian</span>
          <span className="text-small text-text-muted">
            AI memakai catatan ini sebagai contoh saat menilai jawaban serupa. Rubrik tidak berubah.
          </span>
        </span>
      </label>
      <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-between">
        <Button onClick={onCancel}>Batal</Button>
        <Button type="submit" variant="primary" disabled={!valid || !reason.trim()}>
          Simpan Perubahan
        </Button>
      </div>

      <ConfirmModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onSave(scores, reason.trim(), remember);
        }}
        title={`Simpan perubahan nilai Soal ${question.number}?`}
        confirmLabel="Simpan Perubahan"
      >
        <p className="tabular">
          Nilai berubah dari {scoreText(finalScore(grade), question.maxScore)} menjadi {scoreText(newTotal, question.maxScore)}.
        </p>
        <p>Saran AI tetap tersimpan terpisah. Perubahan tercatat dengan nama Anda dan dapat dibatalkan sebelum publikasi.</p>
      </ConfirmModal>
    </form>
  );
}
