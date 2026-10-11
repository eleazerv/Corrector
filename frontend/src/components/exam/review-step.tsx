"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, PenLine, TriangleAlert } from "lucide-react";
import { api, errorMessage, type OverrideInput, type ProgressItem, type SheetAnswer, type StudentTestDetail } from "@/lib/data";
import { sheetStatus } from "@/lib/format";
import { invalidate, useResource } from "@/lib/use-resource";
import { Button, ButtonLink } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { inputClass } from "@/components/kit/field";
import { Icon } from "@/components/kit/icon";
import { AiScore, FinalScore } from "@/components/kit/score";
import { Empty, ErrorState, Loading, StatusTag } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { changedByLecturer } from "./answer-utils";
import { AnswerView } from "./answer-view";
import { useExam } from "./frame";
import { ScorePanel } from "./score-panel";

const READY = ["graded", "reviewed", "published"];
const pane = "lg:sticky lg:top-[calc(var(--chrome-h,57px)_+_16px)] lg:max-h-[calc(100dvh_-_var(--chrome-h,57px)_-_32px)] lg:overflow-y-auto";

/** Sheet total: the lecturer's once the sheet is marked checked, a running total before that. */
function SheetTotal({ d }: { d: StudentTestDetail }) {
  if (d.status === "reviewed" || d.status === "published") return <FinalScore value={d.total_grade} max={d.test.max_score} />;
  return (
    <span className="num text-pencil">
      {d.total_grade === null ? "-" : `${d.total_grade}`}
      {d.test.max_score !== null && ` / ${d.test.max_score}`}
    </span>
  );
}

function SheetList({
  sheets,
  current,
  onPick,
  onlyFlagged,
  setOnlyFlagged,
  max,
}: {
  sheets: ProgressItem[];
  current: string | null;
  onPick: (id: string) => void;
  onlyFlagged: boolean;
  setOnlyFlagged: (v: boolean) => void;
  max: number | null;
}) {
  const shown = onlyFlagged ? sheets.filter((s) => s.needs_review) : sheets;
  return (
    <nav aria-label="Lembar jawaban" className={`hidden lg:block ${pane}`}>
      <label className="flex min-h-9 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={onlyFlagged}
          onChange={(e) => setOnlyFlagged(e.target.checked)}
          className="h-4 w-4 accent-ink"
        />
        Hanya yang perlu diperiksa
      </label>
      <ul className="mt-2 space-y-0.5">
        {shown.map((s) => {
          const on = s.student_test_id === current;
          const st = sheetStatus(s.status, s.needs_review);
          return (
            <li key={s.student_test_id}>
              <button
                type="button"
                aria-current={on ? "true" : undefined}
                onClick={() => onPick(s.student_test_id!)}
                className={`w-full rounded-md px-3 py-2 text-left ${on ? "bg-surface ring-1 ring-ink" : "hover:bg-sunken"}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate ${on ? "font-semibold" : ""}`}>{s.name}</span>
                  {s.needs_review ? (
                    <Icon icon={TriangleAlert} size={15} className="text-attention" />
                  ) : s.status === "reviewed" || s.status === "published" ? (
                    <Icon icon={Check} size={15} />
                  ) : null}
                </span>
                <span className="flex items-center justify-between gap-2 text-[13px] text-pencil">
                  <span className="num">{s.nim}</span>
                  <span className="sr-only">{st.label}</span>
                  {s.total_grade !== null &&
                    (s.status === "graded" ? (
                      <AiScore value={s.total_grade} max={max} label />
                    ) : (
                      <FinalScore value={s.total_grade} max={max} />
                    ))}
                </span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-3 py-2 text-sm text-pencil">Tidak ada lembar yang perlu diperiksa.</li>}
      </ul>
    </nav>
  );
}

function QuestionTabs({ answers, current, onPick }: { answers: SheetAnswer[]; current: string; onPick: (id: string) => void }) {
  return (
    <div role="group" aria-label="Soal" className="flex flex-wrap gap-1.5">
      {answers.map((a) => {
        const on = a.question.id === current;
        const state = a.needs_review ? "review" : changedByLecturer(a) ? "changed" : null;
        return (
          <button
            key={a.question.id}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(a.question.id)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm md:min-h-9 ${
              on ? "border-ink bg-ink text-surface" : "border-rule-strong bg-surface hover:bg-sunken"
            }`}
          >
            Soal {a.question.number}
            {state === "review" && <Icon icon={TriangleAlert} size={14} className={on ? "" : "text-attention"} />}
            {state === "changed" && <Icon icon={PenLine} size={14} />}
            <span className="sr-only">{state === "review" ? ", perlu diperiksa" : state === "changed" ? ", nilai diubah" : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The sheet-level decision. Approving accepts every AI grade on the sheet that the lecturer did not change. */
function SheetDecision({
  d,
  busy,
  onApprove,
}: {
  d: StudentTestDetail;
  busy: boolean;
  onApprove: () => void;
}) {
  if (d.status === "graded") {
    const open = d.answers.filter((a) => a.needs_review).length;
    return (
      <div className="rounded-md border border-rule bg-surface px-4 py-3">
        <Button variant="primary" className="w-full" onClick={onApprove} busy={busy} aria-keyshortcuts="A" title="Pintasan: A">
          Tandai lembar sudah diperiksa
        </Button>
        <p className="mt-2 text-sm text-pencil">
          {open > 0
            ? `${open} soal masih ditandai AI. Nilai yang tidak Anda ubah ikut disetujui.`
            : "Nilai yang tidak Anda ubah ikut disetujui."}
        </p>
      </div>
    );
  }
  if (d.status !== "reviewed" && d.status !== "published") return null;
  return (
    <p className="flex items-center gap-2 font-medium">
      <Icon icon={Check} />
      {d.status === "published" ? "Sudah dipublikasikan" : "Sudah diperiksa"}
    </p>
  );
}

function Workspace({ sheets, initialSheet }: { sheets: ProgressItem[]; initialSheet?: string }) {
  const { id, progress } = useExam();
  const toast = useToast();
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  // Pinned at mount so a background progress refresh never swaps the student on screen.
  const [sel, setSel] = useState<{ sheet: string | null; question: string | null }>(() => ({
    sheet: initialSheet ?? sheets.find((s) => s.needs_review)?.student_test_id ?? sheets[0]?.student_test_id ?? null,
    question: null,
  }));
  const [focusCriterion, setFocusCriterion] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [regrading, setRegrading] = useState(false);

  const sheetId = sel.sheet;
  const detail = useResource(sheetId ? `sheet:${sheetId}` : null, () => api.getStudentTest(sheetId!));
  const d = detail.data;
  const answers = d?.answers ?? [];
  const firstOpen = answers.find((a) => a.needs_review);
  const answer = answers.find((a) => a.question.id === sel.question) ?? firstOpen ?? answers[0];
  const position = sheets.findIndex((s) => s.student_test_id === sheetId);
  const max = progress?.max_score ?? d?.test.max_score ?? null;

  useEffect(() => {
    if (sheetId) window.history.replaceState(null, "", `?lembar=${sheetId}`);
  }, [sheetId]);

  const pickSheet = (sid: string) => {
    setSel({ sheet: sid, question: null });
    setFocusCriterion(null);
    setEditing(false);
  };
  const pickQuestion = (qid: string) => {
    setSel({ sheet: sheetId, question: qid });
    setFocusCriterion(null);
    setEditing(false);
  };
  const stepSheet = (delta: number) => {
    const next = sheets[position + delta];
    if (next?.student_test_id) pickSheet(next.student_test_id);
  };
  const stepQuestion = (delta: number) => {
    const i = answers.findIndex((a) => a.question.id === answer?.question.id);
    const next = answers[i + delta];
    if (next) pickQuestion(next.question.id);
  };

  /** Next flagged question on this sheet, else the next sheet that needs review. */
  const advance = (list: SheetAnswer[], fromSheetDone: boolean) => {
    if (!fromSheetDone) {
      const i = list.findIndex((a) => a.question.id === answer?.question.id);
      const after = [...list.slice(i + 1), ...list.slice(0, i)];
      const nextQ = after.find((a) => a.needs_review);
      if (nextQ) {
        pickQuestion(nextQ.question.id);
        return `Lanjut ke soal ${nextQ.question.number}.`;
      }
    }
    const later = [...sheets.slice(position + 1), ...sheets.slice(0, Math.max(position, 0))];
    const nextSheet = later.find((s) => s.needs_review && s.student_test_id !== sheetId);
    if (nextSheet?.student_test_id) {
      pickSheet(nextSheet.student_test_id);
      return `Lanjut ke ${nextSheet.name}.`;
    }
    return fromSheetDone ? "Tidak ada lagi lembar yang perlu diperiksa." : "Tidak ada lagi soal yang ditandai di lembar ini.";
  };

  const refresh = () => invalidate(`progress:${id}`, `sheet:${sheetId}`, "classes");

  const override = async (input: OverrideInput) => {
    if (!d || !answer?.id) return;
    setBusy(true);
    try {
      const r = await api.overrideAnswer(answer.id, input);
      const updated = d.answers.map((a) =>
        a.id === answer.id
          ? {
              ...a,
              grade: r.new_grade,
              needs_review: false,
              override: { id: r.override_id, old_grade: r.old_grade, new_grade: r.new_grade, reason: input.reason, by: "Anda", at: new Date().toISOString(), complaint_id: null },
            }
          : a,
      );
      detail.mutate(() => ({ ...d, answers: updated, total_grade: r.total_grade, needs_review: r.needs_review }));
      refresh();
      setEditing(false);
      toast(`Nilai soal ${answer.question.number} diubah. ${advance(updated, false)}`);
    } catch (err) {
      toast(errorMessage(err), "attention");
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!d || busy || d.status !== "graded") return;
    setBusy(true);
    try {
      await api.approveSheet(d.id);
      detail.mutate(() => ({ ...d, status: "reviewed", needs_review: false, answers: d.answers.map((a) => ({ ...a, needs_review: false })) }));
      refresh();
      toast(`Lembar ${d.student.name} sudah diperiksa. ${advance(d.answers, true)}`);
    } catch (err) {
      toast(errorMessage(err), "attention");
    } finally {
      setBusy(false);
    }
  };

  const regrade = async () => {
    if (!d || !answer) return;
    setBusy(true);
    try {
      await api.regradeSheet(d.id, [answer.question.id]);
      setRegrading(false);
      refresh();
      toast(`Soal ${answer.question.number} milik ${d.student.name} masuk antrean nilai ulang. Hasilnya muncul otomatis.`);
    } catch (err) {
      setRegrading(false);
      toast(errorMessage(err), "attention");
    } finally {
      setBusy(false);
    }
  };

  // Keyboard: J/K sheets, arrows or 1-9 questions, A mark sheet checked, E change grade, N next flagged item.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']") || document.querySelector("dialog[open]")) return;
      const key = e.key.toLowerCase();
      if (key === "j") stepSheet(1);
      else if (key === "k") stepSheet(-1);
      else if (key === "arrowright") stepQuestion(1);
      else if (key === "arrowleft") stepQuestion(-1);
      else if (key === "a") void approve();
      else if (key === "e" && answer?.id && d && READY.includes(d.status)) setEditing(true);
      else if (key === "n" && d) toast(advance(d.answers, false));
      else if (/^[1-9]$/.test(key) && answers[Number(key) - 1]) pickQuestion(answers[Number(key) - 1].question.id);
      else return;
      e.preventDefault();
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const remaining = sheets.filter((s) => s.needs_review).length;
  const inFlight = d && ["ocr_queued", "ocr_processing", "grading"].includes(d.status);

  return (
    <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_22rem] lg:gap-6 xl:grid-cols-[16rem_minmax(0,1fr)_25rem]">
      <SheetList
        sheets={sheets}
        current={sheetId}
        onPick={pickSheet}
        onlyFlagged={onlyFlagged}
        setOnlyFlagged={setOnlyFlagged}
        max={max}
      />

      <div className="min-w-0">
        {/* Phone and tablet: the sheet list becomes a picker with previous/next. */}
        <div className="mb-4 flex items-center gap-2 lg:hidden">
          <Button compact disabled={position <= 0} onClick={() => stepSheet(-1)}>
            <Icon icon={ChevronLeft} />
            <span className="sr-only">Lembar sebelumnya</span>
          </Button>
          <label htmlFor="pilih-lembar" className="sr-only">
            Pilih lembar
          </label>
          <select id="pilih-lembar" className={inputClass} value={sheetId ?? ""} onChange={(e) => pickSheet(e.target.value)}>
            {sheets.map((s) => (
              <option key={s.student_test_id} value={s.student_test_id!}>
                {s.name} · {s.nim}
                {s.needs_review ? " (perlu diperiksa)" : ""}
              </option>
            ))}
          </select>
          <Button compact disabled={position >= sheets.length - 1} onClick={() => stepSheet(1)}>
            <Icon icon={ChevronRight} />
            <span className="sr-only">Lembar berikutnya</span>
          </Button>
        </div>

        {detail.loading ? (
          <Loading what="lembar jawaban" />
        ) : detail.error ? (
          <ErrorState error={detail.error} onRetry={detail.reload} />
        ) : d && answer ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-rule pb-4">
              <div>
                <h2 className="text-xl">{d.student.name}</h2>
                <p className="num text-sm text-pencil">{d.student.nim}</p>
              </div>
              <p className="text-sm">
                <span className="text-pencil">Total </span>
                <SheetTotal d={d} />
              </p>
            </div>
            {inFlight && (
              <p className="mt-4 text-sm text-pencil" role="status">
                Lembar ini sedang dinilai ulang. Halaman ini diperbarui otomatis saat selesai.
              </p>
            )}
            <div className="mt-4">
              <QuestionTabs answers={answers} current={answer.question.id} onPick={pickQuestion} />
            </div>
            <div className="mt-6">
              <AnswerView answer={answer} pages={d.pages} focusCriterion={focusCriterion} onPhotosExpired={detail.reload} />
            </div>
          </>
        ) : d ? (
          <Empty title="Ujian ini belum punya soal">Lembar ini tidak punya soal untuk diperiksa.</Empty>
        ) : null}
      </div>

      <aside aria-label="Nilai" className={`mt-8 border-t border-rule pt-6 lg:mt-0 lg:border-0 lg:pt-0 ${pane}`}>
        {d && answer && (
          <div className="space-y-5">
            <p className="text-sm text-pencil">
              {remaining > 0 ? `${remaining} lembar masih perlu diperiksa` : "Tidak ada lembar yang ditandai AI"}
            </p>
            <SheetDecision d={d} busy={busy} onApprove={approve} />
            <ScorePanel
              key={`${d.id}-${answer.question.id}`}
              answer={answer}
              sheetStatus={d.status}
              busy={busy}
              focusCriterion={focusCriterion}
              onFocusCriterion={setFocusCriterion}
              onOverride={override}
              onRegrade={() => setRegrading(true)}
              editing={editing}
              setEditing={setEditing}
            />
          </div>
        )}
      </aside>

      <ConfirmDialog
        open={regrading}
        onClose={() => setRegrading(false)}
        onConfirm={regrade}
        busy={busy}
        title={answer ? `Nilai ulang soal ${answer.question.number}?` : "Nilai ulang?"}
        confirmLabel="Ya, nilai ulang"
        body={
          <>
            <p>AI membaca jawaban ini lagi dan memberi nilai baru. Biasanya selesai dalam satu menit.</p>
            {answer && changedByLecturer(answer) && (
              <p className="text-pencil">
                Nilai yang sudah Anda ubah di soal ini akan diganti hasil AI yang baru. Riwayat perubahan tetap tersimpan.
              </p>
            )}
          </>
        }
      />
    </div>
  );
}

export function ReviewStep({ initialSheet }: { initialSheet?: string }) {
  const { id, progress, progressError, reloadProgress } = useExam();
  const sheets = progress?.items.filter((i) => i.student_test_id && READY.includes(i.status)) ?? [];

  let body;
  if (!progress && !progressError) body = <Loading what="lembar jawaban" />;
  else if (progressError && !progress) body = <ErrorState error={progressError} onRetry={reloadProgress} />;
  else if (sheets.length === 0) {
    body = (
      <Empty
        title="Belum ada lembar yang selesai dinilai"
        action={
          <ButtonLink href={`/dosen/ujian/${id}`} variant="primary">
            Kembali ke daftar lembar
          </ButtonLink>
        }
      >
        Lembar muncul di sini setelah fotonya dibaca dan dinilai AI.
      </Empty>
    );
  } else body = <Workspace sheets={sheets} initialSheet={initialSheet} />;

  return (
    <main className="mx-auto max-w-[1400px] px-4 pt-4 pb-16 sm:px-6">
      <Link
        href={`/dosen/ujian/${id}`}
        className="-ml-1 mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-pencil hover:text-ink md:min-h-9"
      >
        <Icon icon={ChevronLeft} />
        Daftar lembar
      </Link>
      {body}
      {sheets.length > 0 && sheets.every((s) => !s.needs_review) && (
        <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-rule pt-6">
          <StatusTag tone="done">Tidak ada lembar yang perlu diperiksa</StatusTag>
          <ButtonLink href={`/dosen/ujian/${id}/publikasi`} variant="primary">
            Lanjut ke publikasi
          </ButtonLink>
        </div>
      )}
    </main>
  );
}
