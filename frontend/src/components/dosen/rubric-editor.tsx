"use client";
// editor soal memakai model backend.
// Per soal: jenis soal, teks soal, kunci jawaban, nilai maksimal, dan kriteria (deskripsi + poin, semua positif).
// Disimpan per soal ("Simpan soal ini") supaya dosen tidak kehilangan pekerjaan kalau lupa menyimpan semuanya.

import { useState } from "react";
import { useRouter } from "next/navigation"; 
import { CircleCheck, ClipboardList, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { apiFetch, ApiError, errorMessage } from "@/lib/api";
import type { Question, QuestionType } from "@/lib/backend-types";
import { num, QUESTION_TYPES } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, inputClass, textareaClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { ConfirmModal } from "@/components/ui/modal";
import { Banner, EmptyState, InternalPanel } from "@/components/ui/panels";
import { useToast } from "@/components/ui/toast";
import { useExam } from "./exam-frame";
import { ReadyBanner } from "./mark-ready"; 

interface DraftCriterion {
  key: string;
  description: string;
  points: string;
}

interface Draft {
  id: string | null; // null = soal baru, belum tersimpan
  number: number;
  question_type: QuestionType;
  question_text: string;
  key_answer: string;
  max_points: string;
  criteria: DraftCriterion[];
}

let seq = 0;
const key = () => `k${seq++}`;

function fromQuestion(q: Question): Draft {
  return {
    id: q.id,
    number: q.number,
    question_type: q.question_type,
    question_text: q.question_text,
    key_answer: q.key_answer,
    max_points: String(q.max_points),
    criteria: q.criteria.map((c) => ({ key: key(), description: c.description, points: String(c.points) })),
  };
}

function blank(number: number): Draft {
  return {
    id: null,
    number,
    question_type: "essay",
    question_text: "",
    key_answer: "",
    max_points: "10",
    criteria: [{ key: key(), description: "", points: "10" }],
  };
}

function problems(d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.question_text.trim()) e.question_text = "Tulis teks soalnya.";
  if (!d.key_answer.trim()) e.key_answer = "Tulis kunci jawaban. AI memakainya sebagai acuan.";
  const max = Number(d.max_points);
  if (!(max > 0)) e.max_points = "Isi nilai maksimal soal, misalnya 10.";
  if (d.question_type !== "objective") {
    const filled = d.criteria.filter((c) => c.description.trim() || c.points.trim());
    if (filled.some((c) => !c.description.trim())) e.criteria = "Setiap kriteria perlu keterangan.";
    else if (filled.some((c) => !(Number(c.points) > 0))) e.criteria = "Poin setiap kriteria harus lebih dari 0.";
    else if (filled.reduce((a, c) => a + Number(c.points), 0) > max)
      e.criteria = `Jumlah poin kriteria melebihi nilai maksimal soal (${num(max)}).`;
  }
  return e;
}

export function RubricEditor() {
  const { ct, test, reload } = useExam(); //
  const router = useRouter(); //
  const toast = useToast();
  const [drafts, setDrafts] = useState<Draft[]>(() => test.questions.map(fromQuestion));
  const [selected, setSelected] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [removing, setRemoving] = useState(false);

  // data dari server berubah (setelah simpan) -> sinkronkan, tapi jangan buang soal baru yang belum tersimpan
  const [syncedFrom, setSyncedFrom] = useState(test.questions);
  if (syncedFrom !== test.questions) {
    setSyncedFrom(test.questions);
    setDrafts((prev) => [...test.questions.map(fromQuestion), ...prev.filter((x) => x.id === null)]);
  }

  const d = drafts[selected] ?? null;
  const totalMax = test.questions.reduce((a, q) => a + q.max_points, 0);

  function update(patch: Partial<Draft>) {
    setDrafts((all) => all.map((x, i) => (i === selected ? { ...x, ...patch } : x)));
  }
  function updateCriterion(k: string, patch: Partial<DraftCriterion>) {
    if (d) update({ criteria: d.criteria.map((c) => (c.key === k ? { ...c, ...patch } : c)) });
  }

  function addQuestion() {
    const next = Math.max(0, ...drafts.map((x) => x.number)) + 1;
    setDrafts((all) => [...all, blank(next)]);
    setSelected(drafts.length);
    setErrors({});
    setServerError(null);
  }

  function handleError(e: unknown) {
    if (e instanceof ApiError && e.status === 409) {
      setLocked(true);
      setServerError("Soal tidak bisa diubah lagi karena sudah ada lembar jawaban yang masuk untuk ujian ini.");
    } else setServerError(errorMessage(e));
  }

  async function save() {
    if (!d) return;
    const errs = problems(d);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setServerError(null);
    const criteria =
      d.question_type === "objective"
        ? []
        : d.criteria
            .filter((c) => c.description.trim())
            .map((c) => ({ description: c.description.trim(), points: Number(c.points) }));
    const body = {
      number: d.number,
      question_type: d.question_type,
      question_text: d.question_text.trim(),
      key_answer: d.key_answer.trim(),
      max_points: Number(d.max_points),
    };
    try {
      if (d.id === null) {
        await apiFetch(`/tests/${test.id}/questions`, { method: "POST", body: JSON.stringify({ ...body, criteria }) });
        setDrafts((all) => all.filter((_, i) => i !== selected)); // diganti versi server setelah reload
      } else {
        await apiFetch(`/tests/${test.id}/questions/${d.id}`, { method: "PATCH", body: JSON.stringify(body) });
        await apiFetch(`/questions/${d.id}/criteria`, { method: "PUT", body: JSON.stringify(criteria) });
      }
      toast({ tone: "success", text: `Soal nomor ${d.number} tersimpan.` });
      reload();
    } catch (e) {
      handleError(e);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setRemoving(false);
    if (!d) return;
    if (d.id === null) {
      setDrafts((all) => all.filter((_, i) => i !== selected));
      setSelected(0);
      return;
    }
    try {
      await apiFetch(`/questions/${d.id}`, { method: "DELETE" });
      toast({ tone: "success", text: `Soal nomor ${d.number} dihapus.` });
      setSelected(0);
      reload();
    } catch (e) {
      handleError(e);
    }
  }

  if (drafts.length === 0)
    return (
      <EmptyState
        icon={ClipboardList}
        title="Belum ada soal."
        action={
          <Button variant="primary" icon={Plus} onClick={addQuestion}>
            Tambah Soal Pertama
          </Button>
        }
      >
        Tulis soal, kunci jawaban, dan kriteria penilaian. AI memakai kunci dan kriteria ini untuk menilai jawaban mahasiswa.
      </EmptyState>
    );

  const critTotal = d ? d.criteria.reduce((a, c) => a + (Number(c.points) || 0), 0) : 0;

  return (
    <div className="space-y-5">

      <ReadyBanner onDone={() => router.push(`/dosen/ujian/${ct.id}/unggah`)} />
      <Banner tone={totalMax === test.max_score ? "success" : "info"}>
        Jumlah nilai semua soal: <b className="tabular">{num(totalMax)}</b> dari nilai maksimal ujian{" "}
        <b className="tabular">{num(test.max_score)}</b>.
        {totalMax !== test.max_score && " Sesuaikan nilai per soal kalau ingin totalnya sama."}
      </Banner>
      {locked && (
        <Banner tone="warning" title="Soal terkunci.">
          Lembar jawaban sudah masuk, jadi soal dan kriteria tidak bisa diubah supaya penilaian tetap adil.
        </Banner>
      )}

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Daftar soal" className="self-start rounded-md border border-border bg-surface">
          <ul className="divide-y divide-border">
            {drafts.map((x, i) => (
              <li key={x.id ?? `new-${i}`}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(i);
                    setErrors({});
                    setServerError(null);
                  }}
                  aria-current={i === selected ? "true" : undefined}
                  className={`flex min-h-12 w-full items-center gap-2 px-4 text-left ${
                    i === selected ? "bg-primary-soft font-bold text-primary" : "hover:bg-bg"
                  }`}
                >
                  <span className="flex-1">Soal {x.number}</span>
                  {x.id === null ? (
                    <span className="text-small font-normal text-warning">belum disimpan</span>
                  ) : (
                    <span className="tabular text-small font-normal text-text-muted">{x.max_points} poin</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border p-3">
            <Button icon={Plus} onClick={addQuestion} className="w-full" disabled={locked}>
              Tambah Soal
            </Button>
          </div>
        </nav>

        {d && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            noValidate
            className="space-y-6 rounded-md border border-border bg-surface p-4 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-h2">Soal nomor {d.number}</h2>
              <Button variant="danger" compact icon={Trash2} onClick={() => setRemoving(true)} disabled={locked}>
                Hapus soal
              </Button>
            </div>
            {serverError && (
              <Banner tone="danger" title="Belum tersimpan.">
                {serverError}
              </Banner>
            )}

            <fieldset disabled={locked}>
              <legend className="mb-2 font-semibold">Jenis soal</legend>
              <div className="grid gap-2 md:grid-cols-3">
                {QUESTION_TYPES.map((t) => (
                  <label
                    key={t.id}
                    className={`flex cursor-pointer gap-3 rounded-md border p-3 ${
                      d.question_type === t.id ? "border-2 border-primary bg-primary-soft" : "border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name="question_type"
                      checked={d.question_type === t.id}
                      onChange={() => update({ question_type: t.id })}
                      className="mt-1 h-5 w-5 accent-primary"
                    />
                    <span>
                      <span className="block font-semibold">{t.label}</span>
                      <span className="text-small text-text-muted">{t.help}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset disabled={locked} className="space-y-4">
              <Field id="q-text" label="Teks soal" required error={errors.question_text}>
                <textarea
                  id="q-text"
                  rows={4}
                  className={textareaClass}
                  value={d.question_text}
                  onChange={(e) => update({ question_text: e.target.value })}
                  aria-invalid={Boolean(errors.question_text)}
                />
              </Field>
              <div className="max-w-[220px]">
                <Field id="q-max" label="Nilai maksimal soal" required error={errors.max_points}>
                  <input
                    id="q-max"
                    type="number"
                    min={1}
                    className={inputClass}
                    value={d.max_points}
                    onChange={(e) => update({ max_points: e.target.value })}
                    aria-invalid={Boolean(errors.max_points)}
                  />
                </Field>
              </div>
            </fieldset>

            <InternalPanel title="Kunci jawaban & kriteria penilaian">
              <fieldset disabled={locked} className="space-y-5">
                <Field
                  id="q-key"
                  label="Kunci jawaban"
                  required
                  error={errors.key_answer}
                  help={
                    d.question_type === "objective"
                      ? "Untuk pilihan ganda cukup tulis hurufnya, misalnya: b. Untuk isian, tulis jawabannya."
                      : "Tulis jawaban yang benar selengkap mungkin, termasuk langkah-langkahnya."
                  }
                >
                  <textarea
                    id="q-key"
                    rows={d.question_type === "objective" ? 1 : 4}
                    className={textareaClass}
                    value={d.key_answer}
                    onChange={(e) => update({ key_answer: e.target.value })}
                    aria-invalid={Boolean(errors.key_answer)}
                  />
                </Field>

                {d.question_type !== "objective" && (
                  <div>
                    <p className="font-semibold">Kriteria penilaian</p>
                    <p className="mb-3 text-small text-text-muted">
                      Pecah nilai soal menjadi beberapa bagian yang dinilai, misalnya &quot;Menuliskan rumus&quot; 4 poin,
                      &quot;Hasil akhir benar&quot; 6 poin. Kalau dikosongkan, AI menilai dengan satu kriteria: sesuai kunci jawaban.
                    </p>
                    <ul className="space-y-2">
                      {d.criteria.map((c, i) => (
                        <li key={c.key} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <label htmlFor={`crit-${c.key}`} className="sr-only">
                            Keterangan kriteria {i + 1}
                          </label>
                          <input
                            id={`crit-${c.key}`}
                            className={inputClass}
                            value={c.description}
                            placeholder={`Kriteria ${i + 1}, misalnya: Menuliskan rumus dengan benar`}
                            onChange={(e) => updateCriterion(c.key, { description: e.target.value })}
                          />
                          <div className="flex items-center gap-2">
                            <label htmlFor={`pts-${c.key}`} className="sr-only">
                              Poin kriteria {i + 1}
                            </label>
                            <input
                              id={`pts-${c.key}`}
                              type="number"
                              min={1}
                              className={`${inputClass} w-24`}
                              value={c.points}
                              onChange={(e) => updateCriterion(c.key, { points: e.target.value })}
                            />
                            <span className="text-small text-text-muted">poin</span>
                            <Button
                              variant="tertiary"
                              compact
                              icon={Trash2}
                              aria-label={`Hapus kriteria ${i + 1}`}
                              onClick={() => update({ criteria: d.criteria.filter((x) => x.key !== c.key) })}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <Button
                        compact
                        icon={Plus}
                        onClick={() => update({ criteria: [...d.criteria, { key: key(), description: "", points: "" }] })}
                      >
                        Tambah kriteria
                      </Button>
                      <span
                        className={`flex items-center gap-1.5 text-small font-semibold ${
                          critTotal > Number(d.max_points) ? "text-danger" : "text-text-muted"
                        }`}
                      >
                        <Icon icon={critTotal > Number(d.max_points) ? TriangleAlert : CircleCheck} size={16} />
                        Total poin kriteria: {num(critTotal)} dari {num(Number(d.max_points))}
                      </span>
                    </div>
                    {errors.criteria && <p className="mt-2 font-semibold text-danger">{errors.criteria}</p>}
                  </div>
                )}
              </fieldset>
            </InternalPanel>

            <div className="flex justify-end border-t border-border pt-4">
              <Button type="submit" variant="primary" icon={Save} loading={saving} loadingText="Menyimpan…" disabled={locked}>
                Simpan soal ini
              </Button>
            </div>
          </form>
        )}
      </div>

      <ConfirmModal
        open={removing}
        onClose={() => setRemoving(false)}
        onConfirm={remove}
        title={`Hapus soal nomor ${d?.number}?`}
        confirmLabel="Hapus soal"
        variant="danger"
      >
        <p>Soal beserta kunci dan kriterianya akan dihapus.</p>
      </ConfirmModal>
    </div>
  );
}
