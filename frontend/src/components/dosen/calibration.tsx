"use client";
// "Uji akurasi AI" (kalibrasi blind). Dosen menilai ±10 jawaban TANPA melihat nilai AI,
// lalu sistem membandingkan. Satu jawaban per layar supaya tidak membingungkan.

import { useState } from "react";
import { ArrowLeft, ArrowRight, Scale } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import type { CalibrationItem, CalibrationResult } from "@/lib/backend-types";
import { num, questionTypeLabel, score } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/form";
import { Banner, EmptyState, InternalPanel } from "@/components/ui/panels";
import { LoadError, Loading } from "@/components/ui/state";
import { useToast } from "@/components/ui/toast";
import { AnswerPhoto } from "./answer-photo";
import { useExam } from "./exam-frame";

export function Calibration() {
  const { ct } = useExam();
  const toast = useToast();
  const sample = useApi<{ total: number; done: number; items: CalibrationItem[] }>(`/class-tests/${ct.id}/calibration?n=10`);
  const result = useApi<CalibrationResult>(`/class-tests/${ct.id}/calibration/result`);
  const [i, setI] = useState(0);
  const [grade, setGrade] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (sample.loading && !sample.data) return <Loading />;
  if (sample.error || !sample.data) return <LoadError title="Data gagal dimuat." message={sample.error ?? ""} onRetry={sample.reload} />;
  const items = sample.data.items;
  if (items.length === 0)
    return (
      <EmptyState icon={Scale} title="Belum ada jawaban yang bisa diuji.">
        Uji akurasi bisa dilakukan setelah AI selesai menilai lembar jawaban ujian ini.
      </EmptyState>
    );
  const item = items[Math.min(i, items.length - 1)];
  const max = item.question.max_points;

  async function save() {
    const g = Number(grade.replace(",", "."));
    if (grade.trim() === "" || Number.isNaN(g) || g < 0 || g > max) {
      setError(`Isi angka antara 0 dan ${num(max)}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/class-tests/${ct.id}/calibration`, {
        method: "POST",
        body: JSON.stringify({ test_answer_id: item.test_answer_id, teacher_grade: g }),
      });
      toast({ tone: "success", text: "Nilai tersimpan." });
      setGrade("");
      sample.reload();
      result.reload();
      if (i < items.length - 1) setI(i + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const summary = result.data?.summary;

  return (
    <div className="space-y-6">
      <Banner tone="info" title="Apa ini?">
        Nilai sendiri beberapa jawaban di bawah <b>tanpa melihat nilai dari AI</b>. Setelah itu kami tunjukkan seberapa dekat nilai
        AI dengan nilai Anda. Ini membantu Anda memutuskan seberapa teliti perlu mengecek nilai dari AI.
      </Banner>

      {summary && (
        <section aria-labelledby="hasil" className="rounded-md border border-border bg-surface p-5">
          <h2 id="hasil" className="text-h2">
            Hasil sejauh ini ({result.data!.count} jawaban)
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            <li>
              <span className="block text-small text-text-muted">Rata-rata nilai Anda</span>
              <span className="tabular text-score-md font-bold">{num(summary.mean_teacher_pct)}%</span>
            </li>
            <li>
              <span className="block text-small text-text-muted">Rata-rata nilai AI</span>
              <span className="tabular text-score-md font-bold">{num(summary.mean_ai_pct)}%</span>
            </li>
            <li>
              <span className="block text-small text-text-muted">Rata-rata selisih</span>
              <span className="tabular text-score-md font-bold">{num(summary.mae_pct)}%</span>
            </li>
          </ul>
          <p className="mt-3 text-text-muted">
            {summary.mean_diff_pct > 0
              ? "AI cenderung memberi nilai lebih tinggi dari Anda."
              : summary.mean_diff_pct < 0
                ? "AI cenderung memberi nilai lebih rendah dari Anda."
                : "Nilai AI rata-rata sama dengan nilai Anda."}{" "}
            Mengubah nilai di halaman Periksa Nilai membantu AI menyesuaikan diri.
          </p>
        </section>
      )}

      <section aria-labelledby="uji" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="uji" className="text-h2">
            Jawaban {i + 1} dari {items.length}
          </h2>
          <span className="text-text-muted">
            Sudah dinilai: {sample.data.done} dari {sample.data.total}
          </span>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <AnswerPhoto pages={item.pages} boxes={[]} />
          <div className="space-y-4 rounded-md border border-border bg-surface p-4 sm:p-5">
            <p className="text-h3 font-bold">
              Soal {item.question.number} <span className="text-small font-normal text-text-muted">({questionTypeLabel(item.question.type)})</span>
            </p>
            <p>{item.question.text}</p>
            <InternalPanel title="Kunci & kriteria">
              <p className="whitespace-pre-wrap">{item.question.key_answer}</p>
              {item.question.criteria.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-small">
                  {item.question.criteria.map((c) => (
                    <li key={c.id}>
                      {c.description} ({num(c.points)} poin)
                    </li>
                  ))}
                </ul>
              )}
            </InternalPanel>
            {item.answer_text && (
              <details>
                <summary className="min-h-11 cursor-pointer py-2 font-semibold text-primary">Teks jawaban (hasil baca AI)</summary>
                <p className="whitespace-pre-wrap rounded-md bg-bg px-3 py-2 font-mono text-small">{item.answer_text}</p>
              </details>
            )}
            {item.teacher_grade !== null ? (
              <Banner tone="success">Nilai Anda untuk jawaban ini: {score(item.teacher_grade, max)}</Banner>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-48">
                  <Field id="cal-grade" label={`Nilai Anda (0 – ${num(max)})`} error={error}>
                    <input id="cal-grade" inputMode="decimal" className={`${inputClass} text-h3`} value={grade} onChange={(e) => setGrade(e.target.value)} />
                  </Field>
                </div>
                <Button variant="primary" loading={saving} onClick={save}>
                  Simpan nilai
                </Button>
              </div>
            )}
            <div className="flex gap-2 border-t border-border pt-4">
              <Button icon={ArrowLeft} disabled={i === 0} onClick={() => { setI(i - 1); setGrade(""); setError(null); }}>
                Sebelumnya
              </Button>
              <Button icon={ArrowRight} disabled={i >= items.length - 1} onClick={() => { setI(i + 1); setGrade(""); setError(null); }}>
                Berikutnya
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
