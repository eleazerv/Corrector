"use client";

import { useState } from "react";
import { CircleCheck, ClipboardList, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useData, uid } from "@/lib/store";
import { criteriaMaxTotal, formatDate, rubricProblems, weightTotal } from "@/lib/grading";
import type { Criterion, Question } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, inputClass, textareaClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { ConfirmModal } from "@/components/ui/modal";
import { Banner, EmptyState, InternalPanel } from "@/components/ui/panels";
import { useToast } from "@/components/ui/toast";
import { useExam } from "./exam-frame";

const LISTS = [
  ["requiredConcepts", "Konsep wajib", "Konsep yang harus muncul agar kriteria terpenuhi."],
  ["keywords", "Keyword", "Istilah yang menandai pemahaman. Tidak pernah ditampilkan ke mahasiswa."],
  ["alternatives", "Alternatif yang diterima", "Jawaban berbeda yang tetap dianggap benar."],
  ["commonMistakes", "Kesalahan umum", "Pola jawaban keliru yang perlu dikurangi skornya."],
] as const;

function blankQuestion(number: number): Question {
  return {
    id: uid("q"),
    number,
    prompt: "",
    maxScore: 10,
    answerKey: "",
    criteria: [{ id: uid("c"), name: "", weight: 100, baseScore: 0, deduction: 0, max: 10 }],
    requiredConcepts: [],
    keywords: [],
    alternatives: [],
    commonMistakes: [],
  };
}

export function RubricEditor() {
  const { exam } = useExam();
  const { dispatch } = useData();
  const toast = useToast();
  const [draft, setDraft] = useState<Question[]>(exam.questions);
  const [selected, setSelected] = useState<string | null>(exam.questions[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [removing, setRemoving] = useState<Question | null>(null);

  const q = draft.find((x) => x.id === selected) ?? null;
  const problems = draft.map((x) => ({ q: x, list: rubricProblems(x) }));
  const invalid = problems.filter((p) => p.list.length > 0);

  function update(patch: Partial<Question>) {
    setDraft((d) => d.map((x) => (x.id === selected ? { ...x, ...patch } : x)));
    setDirty(true);
  }

  function updateCriterion(id: string, patch: Partial<Criterion>) {
    if (!q) return;
    update({ criteria: q.criteria.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }

  function addQuestion() {
    const nq = blankQuestion(draft.length + 1);
    setDraft((d) => [...d, nq]);
    setSelected(nq.id);
    setDirty(true);
  }

  function removeQuestion(target: Question) {
    const rest = draft.filter((x) => x.id !== target.id).map((x, i) => ({ ...x, number: i + 1 }));
    setDraft(rest);
    setSelected(rest[0]?.id ?? null);
    setDirty(true);
    setRemoving(null);
  }

  function save() {
    setShowErrors(true);
    if (draft.length === 0) {
      toast({ tone: "error", text: "Tambahkan minimal satu soal sebelum menyimpan rubrik." });
      return;
    }
    if (invalid.length) {
      setSelected(invalid[0].q.id);
      toast({ tone: "error", text: `Rubrik belum bisa disimpan: ${invalid.length} soal perlu diperbaiki.` });
      return;
    }
    setSaving(true);
    // Stands in for the API round-trip so the loading state is visible.
    setTimeout(() => {
      dispatch({ type: "saveQuestions", examId: exam.id, questions: draft });
      setSaving(false);
      setDirty(false);
      setShowErrors(false);
      toast({ tone: "success", text: `Rubrik v${exam.rubricVersion + 1} disimpan.` });
    }, 600);
  }

  const published = exam.stage === "publish" || exam.stage === "ditutup";

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-small text-text-muted">
          {exam.rubricVersion > 0
            ? `Rubrik v${exam.rubricVersion} • terakhir diubah ${formatDate(exam.rubricUpdatedAt)}`
            : "Rubrik belum pernah disimpan"}
          {dirty && <span className="ml-2 font-semibold text-warning">• Ada perubahan belum disimpan</span>}
        </p>
        <Button variant="primary" onClick={save} loading={saving} loadingText="Menyimpan…">
          Simpan Rubrik
        </Button>
      </div>

      {published && (
        <div className="mb-6">
          <Banner tone="info" title={`Nilai sudah dipublikasikan dengan Rubrik v${exam.rubricVersion}.`}>
            Menyimpan akan membuat versi baru. Nilai yang sudah terbit tetap tercatat dengan versi lamanya.
          </Banner>
        </div>
      )}

      {draft.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Belum ada soal di ujian ini."
          action={
            <Button icon={Plus} onClick={addQuestion}>
              Tambah Soal
            </Button>
          }
        >
          Tambahkan soal pertama, lalu isi kunci jawaban dan kriteria penilaiannya.
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <nav aria-label="Daftar soal" className="self-start rounded-md border border-border bg-surface">
            <ul className="divide-y divide-border">
              {draft.map((x) => {
                const bad = showErrors && rubricProblems(x).length > 0;
                return (
                  <li key={x.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(x.id)}
                      aria-current={x.id === selected ? "true" : undefined}
                      className={`flex min-h-11 w-full items-start gap-2 px-4 py-3 text-left ${
                        x.id === selected ? "bg-primary-soft" : "hover:bg-bg"
                      }`}
                    >
                      <span className="flex-1">
                        <span className={`block font-semibold ${x.id === selected ? "text-primary" : ""}`}>
                          Soal {x.number}
                          <span className="tabular ml-2 font-normal text-text-muted">maks. {x.maxScore}</span>
                        </span>
                        <span className="line-clamp-2 text-small text-text-muted">{x.prompt || "(pertanyaan kosong)"}</span>
                      </span>
                      {bad && (
                        <span className="flex items-center gap-1 text-small font-semibold text-danger">
                          <Icon icon={TriangleAlert} size={16} />
                          Perbaiki
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-border p-3">
              <Button icon={Plus} onClick={addQuestion} className="w-full">
                Tambah Soal
              </Button>
            </div>
          </nav>

          {q && (
            <div className="min-w-0 space-y-8">
              {showErrors && rubricProblems(q).length > 0 && (
                <Banner tone="danger" title={`Soal ${q.number} belum lengkap`}>
                  <ul className="list-disc pl-5">
                    {rubricProblems(q).map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </Banner>
              )}

              <section aria-labelledby="sec-pertanyaan" className="space-y-4">
                <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
                  <h2 id="sec-pertanyaan" className="text-h2">
                    1. Pertanyaan soal {q.number}
                  </h2>
                  <Button variant="danger" compact icon={Trash2} onClick={() => setRemoving(q)}>
                    Hapus Soal
                  </Button>
                </div>
                <Field id="q-prompt" label="Teks pertanyaan" required>
                  <textarea
                    id="q-prompt"
                    rows={3}
                    className={textareaClass}
                    value={q.prompt}
                    onChange={(e) => update({ prompt: e.target.value })}
                  />
                </Field>
                <div className="max-w-48">
                  <Field id="q-max" label="Nilai maksimum" required>
                    <input
                      id="q-max"
                      type="number"
                      min={1}
                      className={`${inputClass} tabular`}
                      value={q.maxScore}
                      onChange={(e) => update({ maxScore: Number(e.target.value) })}
                    />
                  </Field>
                </div>
              </section>

              <section aria-labelledby="sec-kunci" className="space-y-3">
                <h2 id="sec-kunci" className="border-b border-border pb-2 text-h2">
                  2. Kunci jawaban
                </h2>
                <InternalPanel>
                  <Field id="q-key" label="Kunci jawaban" help="Dipakai AI sebagai acuan. Mahasiswa tidak pernah melihat teks ini.">
                    <textarea
                      id="q-key"
                      rows={4}
                      className={textareaClass}
                      value={q.answerKey}
                      onChange={(e) => update({ answerKey: e.target.value })}
                      aria-describedby="q-key-help"
                    />
                  </Field>
                </InternalPanel>
              </section>

              <section aria-labelledby="sec-rubrik" className="space-y-3">
                <h2 id="sec-rubrik" className="border-b border-border pb-2 text-h2">
                  3. Rubrik penilaian
                </h2>
                <InternalPanel>
                  <div className="overflow-x-auto">
                    <table className="sheet">
                      <thead>
                        <tr>
                          <th scope="col">Kriteria</th>
                          <th scope="col" className="num">
                            Bobot (%)
                          </th>
                          <th scope="col" className="num">
                            Base score
                          </th>
                          <th scope="col" className="num">
                            Pengurangan
                          </th>
                          <th scope="col" className="num">
                            Maks
                          </th>
                          <th scope="col">
                            <span className="sr-only">Aksi</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {q.criteria.map((c, i) => (
                          <tr key={c.id}>
                            <td data-label="Kriteria">
                              <input
                                aria-label={`Nama kriteria baris ${i + 1}`}
                                className={`${inputClass} min-w-40`}
                                value={c.name}
                                onChange={(e) => updateCriterion(c.id, { name: e.target.value })}
                              />
                            </td>
                            {(["weight", "baseScore", "deduction", "max"] as const).map((k) => (
                              <td
                                key={k}
                                data-label={{ weight: "Bobot (%)", baseScore: "Base score", deduction: "Pengurangan", max: "Maks" }[k]}
                                className="num"
                              >
                                <input
                                  type="number"
                                  min={0}
                                  aria-label={`${{ weight: "Bobot", baseScore: "Base score", deduction: "Pengurangan", max: "Skor maksimum" }[k]} kriteria baris ${i + 1}`}
                                  className={`${inputClass} tabular w-24 text-right`}
                                  value={c[k]}
                                  onChange={(e) => updateCriterion(c.id, { [k]: Number(e.target.value) })}
                                />
                              </td>
                            ))}
                            <td data-label="Aksi">
                              <Button
                                variant="tertiary"
                                compact
                                disabled={q.criteria.length === 1}
                                onClick={() => update({ criteria: q.criteria.filter((x) => x.id !== c.id) })}
                                aria-label={`Hapus kriteria baris ${i + 1}`}
                              >
                                Hapus
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      icon={Plus}
                      compact
                      onClick={() =>
                        update({
                          criteria: [...q.criteria, { id: uid("c"), name: "", weight: 0, baseScore: 0, deduction: 0, max: 0 }],
                        })
                      }
                    >
                      Tambah Kriteria
                    </Button>
                    <RubricTotals q={q} />
                  </div>
                </InternalPanel>
              </section>

              <section aria-labelledby="sec-konteks" className="space-y-3">
                <h2 id="sec-konteks" className="border-b border-border pb-2 text-h2">
                  4. Konteks penilaian
                </h2>
                <InternalPanel>
                  <div className="grid gap-4 md:grid-cols-2">
                    {LISTS.map(([key, label, help]) => (
                      <Field key={key} id={`q-${key}`} label={label} help={`${help} Satu per baris.`}>
                        <textarea
                          id={`q-${key}`}
                          rows={4}
                          className={textareaClass}
                          value={q[key].join("\n")}
                          onChange={(e) => update({ [key]: e.target.value.split("\n") })}
                          onBlur={(e) =>
                            update({ [key]: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })
                          }
                          aria-describedby={`q-${key}-help`}
                        />
                      </Field>
                    ))}
                  </div>
                </InternalPanel>
              </section>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && removeQuestion(removing)}
        title={`Hapus Soal ${removing?.number ?? ""}?`}
        confirmLabel="Hapus Soal"
        variant="danger"
      >
        <p>Pertanyaan, kunci jawaban, dan rubrik soal ini akan dihapus dari draf. Perubahan berlaku setelah Anda menyimpan rubrik.</p>
      </ConfirmModal>
    </div>
  );
}

function RubricTotals({ q }: { q: Question }) {
  const w = weightTotal(q);
  const m = criteriaMaxTotal(q);
  const wOk = w === 100;
  const mOk = m === q.maxScore;
  return (
    <div className="space-y-1 text-small sm:text-right" aria-live="polite">
      <p className={`flex items-center gap-1.5 font-semibold sm:justify-end ${wOk ? "text-success" : "text-danger"}`}>
        <Icon icon={wOk ? CircleCheck : TriangleAlert} size={16} />
        Total bobot: <span className="tabular">{w}%</span>
        {!wOk && <span className="font-normal">(harus 100%)</span>}
      </p>
      <p className={`flex items-center gap-1.5 font-semibold sm:justify-end ${mOk ? "text-success" : "text-danger"}`}>
        <Icon icon={mOk ? CircleCheck : TriangleAlert} size={16} />
        Skor maksimum kriteria: <span className="tabular">{m} dari {q.maxScore}</span>
      </p>
    </div>
  );
}
