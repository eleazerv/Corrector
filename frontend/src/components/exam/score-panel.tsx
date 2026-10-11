"use client";

import { useState, type FormEvent } from "react";
import { TriangleAlert } from "lucide-react";
import type { OverrideInput, SheetAnswer, SheetStatus } from "@/lib/data";
import { confidenceLabel, formatDateTime, formatNumber } from "@/lib/format";
import { Button } from "@/components/kit/button";
import { Field, describedBy, inputClass, textareaClass } from "@/components/kit/field";
import { Icon } from "@/components/kit/icon";
import { AiScore, FinalScore } from "@/components/kit/score";
import { Notice } from "@/components/kit/status";
import { aiGrade, changedByLecturer } from "./answer-utils";

const MIN_REASON = 10;
const REGRADABLE: SheetStatus[] = ["graded", "reviewed"];

function OverrideForm({
  answer,
  published,
  busy,
  onSave,
  onCancel,
}: {
  answer: SheetAnswer;
  published: boolean;
  busy: boolean;
  onSave: (input: OverrideInput) => void;
  onCancel: () => void;
}) {
  const max = answer.question.max_points;
  const [grade, setGrade] = useState(answer.grade === null ? "" : String(answer.grade));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ grade?: string; reason?: string }>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const g = Number(grade.replace(",", "."));
    const next = {
      grade: !grade.trim() || !Number.isFinite(g) || g < 0 || g > max ? `Isi angka 0 sampai ${formatNumber(max)}.` : undefined,
      reason:
        reason.trim().length < MIN_REASON
          ? `Tulis alasan minimal ${MIN_REASON} karakter. Alasan ini tersimpan di riwayat nilai.`
          : undefined,
    };
    setErrors(next);
    if (next.grade || next.reason) return;
    onSave({ new_grade: g, reason: reason.trim() });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-md border border-rule-strong bg-surface p-4">
      <p className="font-semibold">Ubah nilai soal {answer.question.number}</p>
      {published && (
        <Notice tone="attention">Lembar ini sudah dipublikasikan. Nilai baru langsung terlihat oleh mahasiswa.</Notice>
      )}
      <Field id="ov-grade" label="Nilai baru" error={errors.grade}>
        <div className="flex items-center gap-2">
          <input
            id="ov-grade"
            inputMode="decimal"
            autoFocus
            className={`${inputClass} num w-24 text-right`}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            aria-invalid={!!errors.grade}
            aria-describedby={describedBy("ov-grade", null, errors.grade)}
          />
          <span className="num text-pencil">/ {formatNumber(max)}</span>
          <span className="ml-auto text-sm text-pencil">
            Saran AI <AiScore value={aiGrade(answer)} />
          </span>
        </div>
      </Field>
      <Field
        id="ov-reason"
        label="Alasan perubahan"
        error={errors.reason}
        hint="Mahasiswa tidak melihat alasan ini. AI mempelajarinya sebagai catatan penilaian untuk jawaban yang mirip; catatan itu bisa Anda matikan di halaman Catatan penilaian."
      >
        <textarea
          id="ov-reason"
          rows={3}
          className={textareaClass}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={!!errors.reason}
          aria-describedby={describedBy("ov-reason", true, errors.reason)}
          placeholder="Misalnya: konsep utama benar walau istilahnya berbeda."
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" busy={busy}>
          Simpan nilai
        </Button>
        <Button onClick={onCancel}>Batal</Button>
      </div>
    </form>
  );
}

export function ScorePanel({
  answer,
  sheetStatus,
  busy,
  focusCriterion,
  onFocusCriterion,
  onOverride,
  onRegrade,
  editing,
  setEditing,
}: {
  answer: SheetAnswer;
  sheetStatus: SheetStatus;
  busy: boolean;
  focusCriterion: string | null;
  onFocusCriterion: (id: string | null) => void;
  onOverride: (input: OverrideInput) => void;
  onRegrade: () => void;
  editing: boolean;
  setEditing: (v: boolean) => void;
}) {
  if (answer.id === null) return <p className="text-pencil">Belum ada nilai untuk soal ini.</p>;

  const max = answer.question.max_points;
  const changed = changedByLecturer(answer);
  const approved = sheetStatus === "reviewed" || sheetStatus === "published";
  const decided = changed || approved;
  const stale = answer.override && !changed;
  const canEdit = ["graded", "reviewed", "published"].includes(sheetStatus);

  return (
    <div className="space-y-5">
      <dl className="divide-y divide-rule rounded-md border border-rule bg-surface">
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-pencil">Saran AI</dt>
          <dd>
            <AiScore value={aiGrade(answer)} max={max} size="lg" />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-pencil">Nilai akhir</dt>
          <dd>
            {decided ? (
              <FinalScore value={answer.grade} max={max} size="lg" />
            ) : (
              <span className="text-pencil">{answer.needs_review ? "Belum diputuskan" : "Ikut saran AI"}</span>
            )}
          </dd>
        </div>
      </dl>

      {answer.needs_review && !decided ? (
        <p className="flex items-start gap-2 text-sm text-attention">
          <Icon icon={TriangleAlert} size={16} className="mt-0.5 shrink-0" />
          <span>Keyakinan AI {confidenceLabel(answer.confidence_grading)}. Baca jawabannya sebelum memutuskan.</span>
        </p>
      ) : (
        <p className="text-sm text-pencil">Keyakinan AI {confidenceLabel(answer.confidence_grading)}.</p>
      )}

      {editing ? (
        <OverrideForm
          answer={answer}
          published={sheetStatus === "published"}
          busy={busy}
          onSave={onOverride}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="space-y-3">
          {changed && answer.override && (
            <Notice
              title={`Diubah ${answer.override.by}, ${formatDateTime(answer.override.at)}${answer.override.complaint_id ? ", lewat keberatan" : ""}`}
            >
              <p className="num text-sm text-pencil">
                Dari {formatNumber(answer.override.old_grade)} menjadi {formatNumber(answer.override.new_grade)}
              </p>
              <p className="mt-1">{answer.override.reason}</p>
            </Notice>
          )}
          {stale && (
            <p className="text-sm text-pencil">
              Perubahan nilai Anda sebelumnya sudah diganti oleh hasil nilai ulang AI. Riwayatnya tetap tersimpan.
            </p>
          )}
          {canEdit && (
            // Shortcut E still works; it is announced, not printed on the button.
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button onClick={() => setEditing(true)} aria-keyshortcuts="E" title="Pintasan: E">
                Ubah nilai
              </Button>
              {REGRADABLE.includes(sheetStatus) && (
                <Button variant="quiet" compact onClick={onRegrade} disabled={busy}>
                  Nilai ulang soal ini dengan AI
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {answer.criteria_result.length > 0 && (
        <section aria-labelledby="kriteria-h">
          <h3 id="kriteria-h" className="text-sm font-medium text-pencil">
            Rincian AI per kriteria
          </h3>
          <p className="mt-0.5 text-[13px] text-pencil">Pilih kriteria untuk menandai buktinya di jawaban dan foto.</p>
          <ul className="mt-2 divide-y divide-rule rounded-md border border-rule bg-surface">
            {answer.criteria_result.map((r, i) => {
              const on = focusCriterion === r.criterion_id;
              return (
                <li key={r.criterion_id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onFocusCriterion(on ? null : r.criterion_id)}
                    className={`w-full px-4 py-3 text-left hover:bg-sunken ${on ? "bg-sunken shadow-[inset_0_0_0_1px_var(--color-ink)]" : ""}`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="num text-pencil">{i + 1}.</span> {r.description ?? "Kriteria tanpa keterangan"}
                      </span>
                      <span className="shrink-0 text-right">
                        <AiScore value={r.points} max={r.max_points} />
                      </span>
                    </span>
                    {r.reasoning && <span className="mt-1 block text-sm text-pencil">{r.reasoning}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(answer.grading_internal?.traits_used?.length ?? 0) > 0 && (
        <section aria-labelledby="catatan-h">
          <h3 id="catatan-h" className="text-sm font-medium text-pencil">
            Catatan penilaian yang dipakai AI
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {answer.grading_internal!.traits_used!.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
