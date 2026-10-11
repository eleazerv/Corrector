"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Lock, Plus, Trash2, X } from "lucide-react";
import {
  api,
  ApiError,
  errorMessage,
  PARTIAL_WRITE,
  type ClassTestDetail,
  type QuestionInput,
  type QuestionType,
} from "@/lib/data";
import { QUESTION_TYPES, formatDateTime, formatNumber } from "@/lib/format";
import { invalidate, useResource } from "@/lib/use-resource";
import { Button } from "@/components/kit/button";
import { Field, FieldError, describedBy, inputClass, textareaClass } from "@/components/kit/field";
import { Icon } from "@/components/kit/icon";
import { ErrorState, Loading, Notice } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { useExam } from "./frame";

interface DraftCriterion {
  key: string;
  id?: string;
  description: string;
  points: string;
}

interface DraftQuestion {
  key: string;
  id?: string;
  question_type: QuestionType;
  question_text: string;
  key_answer: string;
  criteria: DraftCriterion[];
}

let keySeq = 0;
const k = () => `k${++keySeq}`;

const emptyCriterion = (): DraftCriterion => ({ key: k(), description: "", points: "" });
const emptyQuestion = (): DraftQuestion => ({
  key: k(),
  question_type: "essay",
  question_text: "",
  key_answer: "",
  criteria: [emptyCriterion()],
});

function toDraft(d: ClassTestDetail): DraftQuestion[] {
  if (d.questions.length === 0) return [emptyQuestion()];
  return d.questions.map((q) => ({
    key: k(),
    id: q.id,
    question_type: q.question_type,
    question_text: q.question_text,
    key_answer: q.key_answer,
    criteria: q.criteria.map((c) => ({ key: k(), id: c.id, description: c.description, points: String(c.points) })),
  }));
}

const points = (c: DraftCriterion) => {
  const n = Number(c.points.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const questionMax = (q: DraftQuestion) => q.criteria.reduce((a, c) => a + (points(c) || 0), 0);

type Errors = Record<string, string>;

function validate(draft: DraftQuestion[]): Errors {
  const e: Errors = {};
  draft.forEach((q) => {
    if (!q.question_text.trim()) e[`${q.key}-text`] = "Isi teks soal.";
    if (q.criteria.length === 0) e[`${q.key}-criteria`] = "Tambahkan minimal satu kriteria.";
    q.criteria.forEach((c) => {
      if (!c.description.trim()) e[`${c.key}-desc`] = "Isi kriteria.";
      const p = points(c);
      if (!c.points.trim() || !Number.isInteger(p) || p <= 0) e[`${c.key}-pts`] = "Poin harus bilangan bulat lebih dari 0.";
    });
  });
  return e;
}

function QuestionEditor({
  q,
  index,
  count,
  errors,
  onChange,
  onMove,
  onRemove,
  lockDelete,
}: {
  q: DraftQuestion;
  index: number;
  count: number;
  errors: Errors;
  onChange: (q: DraftQuestion) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  /** Deleting a saved question also deletes its graded answers (ON DELETE CASCADE). */
  lockDelete: boolean;
}) {
  const setCrit = (key: string, patch: Partial<DraftCriterion>) =>
    onChange({ ...q, criteria: q.criteria.map((c) => (c.key === key ? { ...c, ...patch } : c)) });
  const n = index + 1;

  return (
    <section aria-labelledby={`${q.key}-h`} className="rounded-md border border-rule bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <h2 id={`${q.key}-h`} className="text-xl">
          Soal {n}
          <span className="num ml-3 font-sans text-[15px] font-normal text-pencil">{formatNumber(questionMax(q))} poin</span>
        </h2>
        <div className="flex items-center gap-1">
          <select
            aria-label={`Jenis soal ${n}`}
            className={`${inputClass} w-auto`}
            value={q.question_type}
            onChange={(e) => onChange({ ...q, question_type: e.target.value as QuestionType })}
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-sunken disabled:opacity-40"
          >
            <Icon icon={ArrowUp} />
            <span className="sr-only">Naikkan soal {n}</span>
          </button>
          <button
            type="button"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-sunken disabled:opacity-40"
          >
            <Icon icon={ArrowDown} />
            <span className="sr-only">Turunkan soal {n}</span>
          </button>
          <button
            type="button"
            disabled={count === 1 || lockDelete}
            onClick={onRemove}
            title={lockDelete ? "Soal yang sudah dinilai tidak bisa dihapus" : undefined}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-sunken disabled:opacity-40"
          >
            <Icon icon={Trash2} />
            <span className="sr-only">
              Hapus soal {n}
              {lockDelete ? " (tidak bisa, sudah ada lembar yang dinilai)" : ""}
            </span>
          </button>
        </div>
      </div>

      <div className="grid gap-5 px-5 py-4">
        <Field id={`${q.key}-text`} label="Teks soal" error={errors[`${q.key}-text`]}>
          <textarea
            id={`${q.key}-text`}
            rows={2}
            className={textareaClass}
            value={q.question_text}
            onChange={(e) => onChange({ ...q, question_text: e.target.value })}
            aria-invalid={!!errors[`${q.key}-text`]}
            aria-describedby={describedBy(`${q.key}-text`, null, errors[`${q.key}-text`])}
          />
        </Field>

        <Field
          id={`${q.key}-key`}
          label="Kunci jawaban"
          hint="Tulis juga jawaban alternatif yang diterima dan kesalahan yang sering muncul. AI memakainya sebagai acuan."
        >
          <textarea
            id={`${q.key}-key`}
            rows={3}
            className={textareaClass}
            value={q.key_answer}
            onChange={(e) => onChange({ ...q, key_answer: e.target.value })}
            aria-describedby={`${q.key}-key-hint`}
          />
        </Field>

        <fieldset>
          <legend className="mb-1.5 font-medium">Kriteria penilaian</legend>
          <p className="mb-2 text-sm text-pencil">AI memberi poin per kriteria. Jumlah poinnya menjadi poin maksimum soal.</p>
          <ul className="space-y-2">
            {q.criteria.map((c, ci) => (
              <li key={c.key} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-start gap-2">
                <div>
                  <label htmlFor={`${c.key}-desc`} className="sr-only">
                    Kriteria {ci + 1} soal {n}
                  </label>
                  <input
                    id={`${c.key}-desc`}
                    className={inputClass}
                    value={c.description}
                    onChange={(e) => setCrit(c.key, { description: e.target.value })}
                    aria-invalid={!!errors[`${c.key}-desc`]}
                    aria-describedby={describedBy(`${c.key}-desc`, null, errors[`${c.key}-desc`])}
                    placeholder="Apa yang harus ada di jawaban"
                  />
                  <FieldError id={`${c.key}-desc-error`} message={errors[`${c.key}-desc`]} />
                </div>
                <div>
                  <label htmlFor={`${c.key}-pts`} className="sr-only">
                    Poin kriteria {ci + 1} soal {n}
                  </label>
                  <input
                    id={`${c.key}-pts`}
                    inputMode="numeric"
                    className={`${inputClass} num text-right`}
                    value={c.points}
                    onChange={(e) => setCrit(c.key, { points: e.target.value })}
                    aria-invalid={!!errors[`${c.key}-pts`]}
                    aria-describedby={describedBy(`${c.key}-pts`, null, errors[`${c.key}-pts`])}
                    placeholder="Poin"
                  />
                  <FieldError id={`${c.key}-pts-error`} message={errors[`${c.key}-pts`]} />
                </div>
                <button
                  type="button"
                  disabled={q.criteria.length === 1}
                  onClick={() => onChange({ ...q, criteria: q.criteria.filter((x) => x.key !== c.key) })}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-sunken disabled:opacity-40 md:h-10 md:w-10"
                >
                  <Icon icon={X} />
                  <span className="sr-only">
                    Hapus kriteria {ci + 1} soal {n}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <FieldError message={errors[`${q.key}-criteria`]} />
          <Button compact className="mt-2" onClick={() => onChange({ ...q, criteria: [...q.criteria, emptyCriterion()] })}>
            <Icon icon={Plus} />
            Tambah kriteria
          </Button>
        </fieldset>
      </div>
    </section>
  );
}

function RubricEditor({ detail, gradedSheets }: { detail: ClassTestDetail; gradedSheets: number }) {
  const toast = useToast();
  const [draft, setDraft] = useState<DraftQuestion[]>(() => toDraft(detail));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const total = draft.reduce((a, q) => a + questionMax(q), 0);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (next: DraftQuestion[]) => {
    setDraft(next);
    setDirty(true);
  };

  const save = async () => {
    const e = validate(draft);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setFormError(`Ada ${Object.keys(e).length} isian yang perlu diperbaiki.`);
      const first = Object.keys(e)[0].replace(/-(criteria)$/, "-text");
      document.getElementById(first)?.focus();
      return;
    }
    setFormError(null);
    setBusy(true);
    const payload: QuestionInput[] = draft.map((q) => ({
      id: q.id,
      question_type: q.question_type,
      question_text: q.question_text,
      key_answer: q.key_answer,
      max_points: questionMax(q),
      criteria: q.criteria.map((c) => ({ id: c.id, description: c.description, points: points(c) })),
    }));
    try {
      const saved = await api.saveRubric(detail.id, payload);
      setDraft(toDraft(saved));
      setDirty(false);
      invalidate(`class-test:${detail.id}`, `class-test-header:${detail.id}`, "classes");
      toast("Rubrik disimpan.");
    } catch (err) {
      if (err instanceof ApiError && err.code === PARTIAL_WRITE) {
        // Part of the rubric reached the database; start again from what is actually saved.
        try {
          setDraft(toDraft(await api.getClassTest(detail.id)));
          setDirty(false);
          invalidate(`class-test-header:${detail.id}`, "classes");
        } catch {
          // the message below still tells the lecturer to reload
        }
        setFormError(`Rubrik hanya tersimpan sebagian: ${errorMessage(err)} Rubrik dimuat ulang dari server; periksa lalu simpan lagi.`);
      } else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const editable = detail.can_edit_rubric;

  return (
    <>
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-pencil">
          <Icon icon={Lock} size={14} />
          Kunci jawaban dan kriteria hanya terlihat oleh dosen. Mahasiswa hanya melihat nilai dan umpan balik.
        </p>
        {!editable && (
          <Notice title="Rubrik ini hanya bisa dibaca">
            Ujian ini dibuat dosen lain. Rubriknya hanya bisa diubah oleh pembuat ujian atau koordinator mata kuliah.
          </Notice>
        )}
        {editable && gradedSheets > 0 && (
          <Notice tone="attention" title={`${gradedSheets} lembar sudah dinilai dengan rubrik ini`}>
            Mengubah rubrik tidak menilai ulang lembar itu secara otomatis; minta nilai ulang per soal dari layar Periksa. Soal
            yang sudah ada tidak bisa dihapus, karena nilai soal itu di setiap lembar ikut terhapus.
          </Notice>
        )}
      </div>

      <fieldset disabled={!editable} className="min-w-0">
        <legend className="sr-only">Soal dan kriteria</legend>
        <div className="mt-6 space-y-6">
          {draft.map((q, i) => (
            <QuestionEditor
              key={q.key}
              q={q}
              index={i}
              count={draft.length}
              errors={errors}
              lockDelete={gradedSheets > 0 && !!q.id}
              onChange={(next) => update(draft.map((x) => (x.key === q.key ? next : x)))}
              onMove={(d) => {
                const next = [...draft];
                [next[i], next[i + d]] = [next[i + d], next[i]];
                update(next);
              }}
              onRemove={() => update(draft.filter((x) => x.key !== q.key))}
            />
          ))}
        </div>

        {editable && (
          <Button className="mt-4" onClick={() => update([...draft, emptyQuestion()])}>
            <Icon icon={Plus} />
            Tambah soal
          </Button>
        )}
      </fieldset>

      <div
        hidden={!editable}
        className="sticky bottom-0 z-10 -mx-4 mt-8 border-t border-rule bg-paper px-4 py-3 sm:-mx-6 sm:px-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">
              Nilai maksimum ujian: <span className="num">{formatNumber(total)}</span>
            </p>
            <p className="text-sm text-pencil" aria-live="polite">
              {dirty
                ? "Ada perubahan yang belum disimpan."
                : detail.rubric_updated_at
                  ? `Tersimpan ${formatDateTime(detail.rubric_updated_at)}.`
                  : draft.some((q) => q.id)
                    ? "Semua perubahan sudah tersimpan."
                    : "Belum pernah disimpan."}
            </p>
          </div>
          <Button variant="primary" busy={busy} onClick={save}>
            {busy ? "Menyimpan..." : "Simpan rubrik"}
          </Button>
        </div>
        <FieldError message={formError} />
      </div>
    </>
  );
}

export function RubricStep() {
  const { id, progress } = useExam();
  const detail = useResource(`class-test:${id}`, () => api.getClassTest(id));
  const graded = progress?.items.filter((i) => ["graded", "reviewed", "published"].includes(i.status)).length ?? 0;

  return (
    <main className="mx-auto max-w-4xl px-4 pt-6 sm:px-6">
      {detail.loading ? (
        <Loading what="rubrik" />
      ) : detail.error ? (
        <ErrorState error={detail.error} onRetry={detail.reload} />
      ) : detail.data ? (
        <RubricEditor key={detail.data.rubric_updated_at ?? "new"} detail={detail.data} gradedSheets={graded} />
      ) : null}
    </main>
  );
}
