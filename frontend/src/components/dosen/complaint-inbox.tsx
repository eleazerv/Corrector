"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Inbox, MessageSquareWarning, Paperclip } from "lucide-react";
import { useData } from "@/lib/store";
import { finalScore, formatDateLong, formatDateTime, scoreText } from "@/lib/grading";
import type { Complaint, ComplaintStatus } from "@/lib/types";
import { ComplaintBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, describedBy, inputClass, textareaClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { ConfirmModal } from "@/components/ui/modal";
import { EmptyState, InternalPanel } from "@/components/ui/panels";
import { Container, PageHeader } from "@/components/ui/page";
import { Tabs, panelId, tabId } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

const GROUPS: { id: string; label: string; statuses: ComplaintStatus[] }[] = [
  { id: "baru", label: "Baru", statuses: ["baru"] },
  { id: "ditinjau", label: "Sedang Ditinjau", statuses: ["ditinjau"] },
  { id: "selesai", label: "Selesai", statuses: ["selesai"] },
  { id: "ditutup", label: "Ditolak/Ditutup", statuses: ["ditolak", "ditutup"] },
];

export function ComplaintInbox() {
  const { data } = useData();
  const params = useSearchParams();
  const router = useRouter();
  const tab = GROUPS.find((g) => g.id === params.get("tab"))?.id ?? "baru";
  const group = GROUPS.find((g) => g.id === tab)!;
  const items = data.complaints.filter((c) => group.statuses.includes(c.status));
  const selected = items.find((c) => c.id === params.get("id")) ?? items[0];

  function nav(next: { tab?: string; id?: string }) {
    const q = new URLSearchParams(params.toString());
    if (next.tab) {
      q.set("tab", next.tab);
      q.delete("id");
    }
    if (next.id) q.set("id", next.id);
    router.replace(`?${q.toString()}`, { scroll: false });
  }

  return (
    <Container>
      <PageHeader
        crumbs={[{ href: "/dosen", label: "Dashboard" }, { label: "Keberatan Nilai" }]}
        title="Keberatan Nilai"
        meta="Keberatan tidak mengubah nilai secara otomatis. Anda memutuskan setelah membaca keberatan asli."
      />
      <Tabs
        group="keberatan"
        label="Status keberatan"
        value={tab}
        onChange={(id) => nav({ tab: id })}
        tabs={GROUPS.map((g) => ({
          id: g.id,
          label: g.label,
          count: data.complaints.filter((c) => g.statuses.includes(c.status)).length,
        }))}
      />
      <div role="tabpanel" id={panelId("keberatan", tab)} aria-labelledby={tabId("keberatan", tab)} className="pt-6">
        {items.length === 0 ? (
          <EmptyState icon={Inbox} title={`Tidak ada keberatan berstatus ${group.label}.`}>
            {tab === "baru"
              ? "Keberatan yang diajukan mahasiswa setelah nilai dipublikasikan akan muncul di sini."
              : "Keberatan pindah ke tab ini setelah Anda mengambil keputusan."}
          </EmptyState>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
            <ul aria-label="Daftar keberatan" className="self-start divide-y divide-border rounded-md border border-border bg-surface">
              {items.map((c) => {
                const st = data.students.find((s) => s.id === c.studentId);
                const exam = data.exams.find((e) => e.id === c.examId);
                const q = exam?.questions.find((x) => x.id === c.questionId);
                const active = c.id === selected?.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => nav({ id: c.id })}
                      className={`block min-h-11 w-full px-4 py-3 text-left ${active ? "bg-primary-soft" : "hover:bg-bg"}`}
                    >
                      <span className={`block font-semibold ${active ? "text-primary" : ""}`}>{st?.name}</span>
                      <span className="block text-small text-text-muted">
                        {exam?.title}, Soal {q?.number}
                      </span>
                      <span className="block text-small text-text-muted">{formatDateTime(c.createdAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {selected && <ComplaintDetail key={selected.id} complaint={selected} />}
          </div>
        )}
      </div>
    </Container>
  );
}

type Decision = "selesai" | "ditinjau" | "ditolak" | "ditutup";

function ComplaintDetail({ complaint }: { complaint: Complaint }) {
  const { data, dispatch } = useData();
  const toast = useToast();
  const exam = data.exams.find((e) => e.id === complaint.examId)!;
  const cls = data.classes.find((c) => c.id === exam.classId);
  const question = exam.questions.find((q) => q.id === complaint.questionId)!;
  const student = data.students.find((s) => s.id === complaint.studentId);
  const sub = data.submissions.find((s) => s.examId === exam.id && s.studentId === complaint.studentId);
  const grade = sub?.grades.find((g) => g.questionId === question.id);
  const page = sub?.pages.find((p) => p.questionId === question.id);
  const current = grade ? finalScore(grade) : 0;

  const [note, setNote] = useState("");
  const [newScore, setNewScore] = useState(String(current));
  const [attempt, setAttempt] = useState<Decision | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const closed = complaint.status === "selesai" || complaint.status === "ditolak" || complaint.status === "ditutup";

  const noteError = attempt && !note.trim() ? "Tulis catatan keputusan. Catatan ini dikirim ke mahasiswa." : null;
  const n = Number(newScore.replace(",", "."));
  const scoreError =
    attempt === "selesai"
      ? Number.isNaN(n) || newScore.trim() === ""
        ? "Isi nilai baru dalam angka."
        : n < 0 || n > question.maxScore
          ? `Nilai harus antara 0 dan ${question.maxScore} (nilai maksimum soal ini).`
          : n === current
            ? "Nilai baru sama dengan nilai sekarang. Pilih Tolak bila nilai tidak berubah."
            : null
      : null;

  const LABEL: Record<Decision, string> = {
    selesai: "Perubahan diterima",
    ditinjau: "Klarifikasi diminta",
    ditolak: "Keberatan ditolak",
    ditutup: "Keberatan ditutup",
  };

  function decide(d: Decision, skipConfirm = false) {
    setAttempt(d);
    if (!note.trim()) return;
    if (d === "selesai" && (Number.isNaN(n) || n < 0 || n > question.maxScore || n === current)) return;
    if (d === "ditolak" && !skipConfirm) {
      setConfirmReject(true);
      return;
    }
    dispatch({
      type: "decideComplaint",
      complaintId: complaint.id,
      status: d,
      note: note.trim(),
      newScore: d === "selesai" ? n : undefined,
    });
    toast({ tone: "success", text: `${LABEL[d]}. Mahasiswa melihat status dan catatan Anda.` });
  }

  return (
    <article aria-labelledby="detail-title" className="min-w-0 space-y-6">
      <header className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="detail-title" className="text-h2">
            {student?.name} <span className="tabular font-body text-body font-normal text-text-muted">{student?.nim}</span>
          </h2>
          <p className="text-text-muted">
            {exam.title} • {cls?.name} • Soal {question.number}
          </p>
        </div>
        <ComplaintBadge status={complaint.status} />
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="ai-sum" className="self-start rounded-md border border-dashed border-border-strong bg-surface p-4">
          <h3 id="ai-sum" className="font-semibold text-text-muted">
            Ringkasan AI: bantuan, bukan keputusan
          </h3>
          <p className="mt-2">{complaint.aiSummary}</p>
          <a
            href="#keberatan-asli"
            className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
          >
            Lihat keberatan asli
          </a>
        </section>

        <div className="space-y-5">
          <section id="keberatan-asli" aria-labelledby="asli" className="scroll-mt-6 rounded-md border border-border bg-surface p-4">
            <h3 id="asli" className="flex items-center gap-2 font-semibold">
              <Icon icon={MessageSquareWarning} className="text-primary" />
              Keberatan asli dari mahasiswa
            </h3>
            <p className="mt-1 text-small text-text-muted">Diajukan {formatDateTime(complaint.createdAt)}</p>
            <blockquote className="mt-3 border-l-2 border-border-strong pl-4">{complaint.reason}</blockquote>
            {complaint.attachmentName && (
              <p className="mt-3 flex items-center gap-2 text-small">
                <Icon icon={Paperclip} size={16} />
                Lampiran: <span className="font-mono">{complaint.attachmentName}</span>
                <span className="text-text-muted">(pratinjau lampiran belum tersedia di prototipe)</span>
              </p>
            )}
          </section>

          {grade && (
            <section aria-labelledby="nilai-terkait" className="rounded-md border border-border bg-surface p-4">
              <h3 id="nilai-terkait" className="font-semibold">
                Nilai dan umpan balik terkait
              </h3>
              <p className="tabular mt-1 text-score-md font-bold text-primary">{scoreText(current, question.maxScore)}</p>
              <p className="mt-2">{grade.studentFeedback}</p>
              {page && grade.evidence.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {grade.evidence.map((e, i) => (
                    <li key={e.id} className="text-small">
                      <span className={`font-semibold ${e.effect === "plus" ? "text-success" : "text-danger"}`}>
                        ({i + 1}) {e.effect === "plus" ? "Menambah" : "Mengurangi"}:
                      </span>{" "}
                      <mark className="bg-highlight px-0.5">&ldquo;{e.quote}&rdquo;</mark>
                    </li>
                  ))}
                </ul>
              )}
              {sub && (
                <Link
                  href={`/dosen/ujian/${exam.id}/review?s=${sub.id}`}
                  className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Buka jawaban lengkap di Review
                </Link>
              )}
            </section>
          )}

          <InternalPanel title="Rubrik soal ini">
            <ul className="space-y-1">
              {question.criteria.map((c) => (
                <li key={c.id} className="tabular flex justify-between gap-4">
                  <span>{c.name}</span>
                  <span>
                    {grade ? scoreText(grade.override?.criterionScores[c.id] ?? grade.aiCriterionScores[c.id], c.max) : c.max}
                  </span>
                </li>
              ))}
            </ul>
            {grade && <p className="mt-3 text-small">Reasoning AI: {grade.reasoning}</p>}
          </InternalPanel>
        </div>
      </div>

      {closed ? (
        <section className="rounded-md border border-border bg-surface p-4">
          <h3 className="font-semibold">Keputusan</h3>
          <p className="mt-1">{complaint.decisionNote}</p>
          {complaint.decidedAt && <p className="mt-1 text-small text-text-muted">Diputuskan {formatDateLong(complaint.decidedAt)}</p>}
        </section>
      ) : (
        <section aria-labelledby="keputusan" className="space-y-4 rounded-md border-2 border-primary bg-surface p-4 sm:p-5">
          <h3 id="keputusan" className="text-h3 font-bold">
            Keputusan Anda
          </h3>
          {complaint.decisionNote && (
            <p className="text-small text-text-muted">Catatan sebelumnya: {complaint.decisionNote}</p>
          )}
          <Field id="kp-note" label="Catatan keputusan" required error={noteError} help="Dikirim ke mahasiswa bersama status keberatan.">
            <textarea
              id="kp-note"
              rows={3}
              className={textareaClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-invalid={Boolean(noteError)}
              aria-describedby={describedBy("kp-note", true, noteError)}
            />
          </Field>
          <div className="max-w-xs">
            <label htmlFor="kp-score" className="mb-1 block font-semibold">
              Nilai baru Soal {question.number} <span className="font-normal text-text-muted">(bila perubahan diterima)</span>
            </label>
            <input
              id="kp-score"
              inputMode="decimal"
              className={`${inputClass} tabular`}
              value={newScore}
              onChange={(e) => setNewScore(e.target.value)}
              aria-invalid={Boolean(scoreError)}
              aria-describedby={scoreError ? "kp-score-error" : undefined}
            />
            <FieldError id="kp-score-error" message={scoreError} />
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:flex-wrap">
            <Button variant="primary" onClick={() => decide("selesai")}>
              Terima Perubahan
            </Button>
            {complaint.status !== "ditinjau" && <Button onClick={() => decide("ditinjau")}>Minta Klarifikasi</Button>}
            <Button variant="danger" onClick={() => decide("ditolak")}>
              Tolak
            </Button>
            <Button variant="tertiary" onClick={() => decide("ditutup")}>
              Tutup
            </Button>
          </div>
        </section>
      )}

      <ConfirmModal
        open={confirmReject}
        onClose={() => setConfirmReject(false)}
        onConfirm={() => {
          setConfirmReject(false);
          decide("ditolak", true);
        }}
        title="Tolak keberatan ini?"
        confirmLabel="Tolak Keberatan"
        variant="danger"
      >
        <p>
          Nilai tetap {scoreText(current, question.maxScore)}. {student?.name} akan melihat status Ditolak beserta catatan
          keputusan Anda.
        </p>
      </ConfirmModal>
    </article>
  );
}
