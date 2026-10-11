"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Check, ChevronLeft, Lock } from "lucide-react";
import { api, errorMessage, type CalibrationItem, type CalibrationResult, type CalibrationSample } from "@/lib/data";
import { formatNumber, questionTypeLabel } from "@/lib/format";
import { invalidate, useResource } from "@/lib/use-resource";
import { Button } from "@/components/kit/button";
import { Field, describedBy, inputClass } from "@/components/kit/field";
import { Icon } from "@/components/kit/icon";
import { AiScore } from "@/components/kit/score";
import { Empty, ErrorState, Loading } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { useExam } from "./frame";
import { PagePhotos } from "./page-photos";

const SAMPLE_SIZE = 10;

function GradeForm({
  item,
  busy,
  onSave,
}: {
  item: CalibrationItem;
  busy: boolean;
  onSave: (grade: number) => void;
}) {
  const max = item.question.max_points;
  const [value, setValue] = useState(item.teacher_grade === null ? "" : String(item.teacher_grade));
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const g = Number(value.replace(",", "."));
    if (!value.trim() || !Number.isFinite(g) || g < 0 || g > max) {
      setError(`Isi angka 0 sampai ${formatNumber(max)}.`);
      return;
    }
    setError(null);
    onSave(g);
  };

  return (
    <form onSubmit={submit} noValidate className="rounded-md border border-rule-strong bg-surface p-4">
      <Field id="kal-nilai" label="Nilai Anda" error={error}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="kal-nilai"
            inputMode="decimal"
            className={`${inputClass} num w-24 text-right`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={describedBy("kal-nilai", null, error)}
          />
          <span className="num text-pencil">/ {formatNumber(max)}</span>
          <Button type="submit" variant="primary" busy={busy} className="ml-auto">
            {item.teacher_grade === null ? "Simpan dan lanjut" : "Perbarui nilai"}
          </Button>
        </div>
      </Field>
    </form>
  );
}

function ItemView({ item }: { item: CalibrationItem }) {
  const q = item.question;
  return (
    <article aria-labelledby="kal-soal" className="space-y-5">
      <div>
        <p className="text-sm text-pencil">
          Soal {q.number} · {questionTypeLabel(q.type)} · maks {q.max_points} poin
        </p>
        <h2 id="kal-soal" className="mt-1 text-xl leading-snug">
          {q.text}
        </h2>
      </div>

      <details className="group rounded-md border border-rule bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-medium">
          <Icon icon={Lock} size={14} />
          Kunci jawaban dan kriteria
          <span className="font-normal text-pencil group-open:hidden">(tampilkan)</span>
        </summary>
        <div className="border-t border-rule px-4 py-3">
          <p className="whitespace-pre-line">{q.key_answer || "Belum diisi."}</p>
          {q.criteria.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {q.criteria.map((c, i) => (
                <li key={c.id} className="flex justify-between gap-3">
                  <span>
                    <span className="num text-pencil">{i + 1}.</span> {c.description}
                  </span>
                  <span className="num shrink-0 text-pencil">{formatNumber(c.points)} poin</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <section aria-labelledby="kal-jawaban">
        <h3 id="kal-jawaban" className="text-sm font-medium text-pencil">
          Jawaban, hasil baca foto
        </h3>
        <p className="mt-2 rounded-md border border-rule bg-surface px-5 py-5 text-[16px] leading-[1.8] whitespace-pre-line">
          {item.answer_text || "Teks jawaban kosong."}
        </p>
      </section>

      {item.pages.length > 0 && (
        <section aria-labelledby="kal-foto">
          <h3 id="kal-foto" className="mb-2 text-sm font-medium text-pencil">
            Foto
          </h3>
          <PagePhotos key={item.test_answer_id} pages={item.pages} />
        </section>
      )}
    </article>
  );
}

function Comparison({ r }: { r: CalibrationResult }) {
  const s = r.summary;
  if (!s) return <p className="text-pencil">Belum ada jawaban yang bisa dibandingkan.</p>;
  const lean =
    s.mean_diff_pct <= -3
      ? "Rata-rata, AI memberi nilai lebih rendah dari Anda."
      : s.mean_diff_pct >= 3
        ? "Rata-rata, AI memberi nilai lebih tinggi dari Anda."
        : "Rata-rata, nilai AI dan nilai Anda hampir sama.";
  return (
    <div className="space-y-4">
      <p className="text-lg font-medium">{lean}</p>
      <dl className="num grid gap-x-8 gap-y-2 sm:grid-cols-2">
        <div className="flex justify-between gap-4 border-b border-rule pb-2">
          <dt className="text-pencil">Rata-rata nilai Anda</dt>
          <dd>{formatNumber(s.mean_teacher_pct)}% dari maksimum</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-rule pb-2">
          <dt className="text-pencil">Rata-rata nilai AI</dt>
          <dd>{formatNumber(s.mean_ai_pct)}% dari maksimum</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-rule pb-2">
          <dt className="text-pencil">Selisih rata-rata per jawaban</dt>
          <dd>{formatNumber(s.mae_pct)}% dari maksimum</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-rule pb-2">
          <dt className="text-pencil">Selisih 10% atau kurang</dt>
          <dd>
            {s.within_10_pct} dari {r.count} jawaban
          </dd>
        </div>
      </dl>
      <table className="table">
        <caption className="sr-only">Nilai Anda dan nilai AI per jawaban</caption>
        <thead>
          <tr>
            <th scope="col">Soal</th>
            <th scope="col" className="right">
              Nilai Anda
            </th>
            <th scope="col" className="right">
              Nilai AI
            </th>
            <th scope="col" className="right">
              Selisih AI
            </th>
          </tr>
        </thead>
        <tbody>
          {r.items.map((i) => (
            <tr key={i.test_answer_id}>
              <td data-label="Soal">Soal {i.question_number}</td>
              <td data-label="Nilai Anda" className="right num">
                {formatNumber(i.teacher_grade)} / {formatNumber(i.max_points)}
              </td>
              <td data-label="Nilai AI" className="right">
                <AiScore value={i.ai_grade} max={i.max_points} />
              </td>
              <td data-label="Selisih AI" className="right num">
                {i.diff > 0 ? "+" : ""}
                {formatNumber(i.diff)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-pencil">Selisih positif berarti AI memberi lebih banyak poin daripada Anda.</p>
    </div>
  );
}

function Workspace({ sample }: { sample: CalibrationSample }) {
  const { id } = useExam();
  const toast = useToast();
  const [items, setItems] = useState(sample.items);
  const [index, setIndex] = useState(() => Math.max(0, items.findIndex((i) => i.teacher_grade === null)));
  const [busy, setBusy] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const result = useResource(showResult ? `calibration-result:${id}` : null, () => api.calibrationResult(id));
  const item = items[index];
  const done = items.filter((i) => i.teacher_grade !== null).length;

  const save = async (grade: number) => {
    setBusy(true);
    try {
      await api.saveCalibration(id, item.test_answer_id, grade);
      const next = items.map((i) => (i.test_answer_id === item.test_answer_id ? { ...i, teacher_grade: grade } : i));
      setItems(next);
      invalidate(`calibration-result:${id}`);
      const after = next.findIndex((i, k) => k > index && i.teacher_grade === null);
      const any = next.findIndex((i) => i.teacher_grade === null);
      if (after >= 0 || any >= 0) setIndex(after >= 0 ? after : any);
      else {
        toast("Semua jawaban contoh sudah Anda nilai.");
        setShowResult(true);
      }
    } catch (err) {
      toast(errorMessage(err), "attention");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-4">
        <div>
          <p className="text-xl font-medium">
            {done} dari {items.length} jawaban sudah Anda nilai
          </p>
          <p className="mt-1 max-w-[70ch] text-pencil">
            Nilai AI dan nama mahasiswa disembunyikan. Nilai yang Anda isi di sini tidak mengubah nilai mahasiswa.
          </p>
        </div>
        <Button onClick={() => setShowResult((v) => !v)} disabled={done === 0} aria-expanded={showResult}>
          {showResult ? "Sembunyikan perbandingan" : "Bandingkan dengan AI"}
        </Button>
      </div>

      {showResult && (
        <section aria-labelledby="banding-h" className="mt-6 rounded-md border border-rule bg-surface px-5 py-5">
          <h2 id="banding-h" className="mb-3 text-xl">
            Perbandingan dengan AI
          </h2>
          {result.loading ? (
            <Loading what="perbandingan" />
          ) : result.error ? (
            <ErrorState error={result.error} onRetry={result.reload} />
          ) : result.data ? (
            <Comparison r={result.data} />
          ) : null}
        </section>
      )}

      <div role="group" aria-label="Jawaban contoh" className="mt-6 flex flex-wrap gap-1.5">
        {items.map((i, k) => (
          <button
            key={i.test_answer_id}
            type="button"
            aria-pressed={k === index}
            onClick={() => setIndex(k)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm md:min-h-9 ${
              k === index ? "border-ink bg-ink text-surface" : "border-rule-strong bg-surface hover:bg-sunken"
            }`}
          >
            <span className="num">{k + 1}</span>
            {i.teacher_grade !== null && <Icon icon={Check} size={14} />}
            <span className="sr-only">{i.teacher_grade !== null ? ", sudah dinilai" : ", belum dinilai"}</span>
          </button>
        ))}
      </div>

      {item && (
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <ItemView item={item} />
          <aside aria-label="Nilai Anda" className="lg:sticky lg:top-[calc(var(--chrome-h,57px)+16px)] lg:self-start">
            <GradeForm key={item.test_answer_id} item={item} busy={busy} onSave={save} />
          </aside>
        </div>
      )}
    </>
  );
}

export function CalibrationStep() {
  const { id } = useExam();
  const sample = useResource(`calibration:${id}`, () => api.calibrationSample(id, SAMPLE_SIZE));

  return (
    <main className="mx-auto max-w-[1400px] px-4 pt-4 pb-16 sm:px-6">
      <Link
        href={`/dosen/ujian/${id}`}
        className="-ml-1 mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-pencil hover:text-ink md:min-h-9"
      >
        <Icon icon={ChevronLeft} />
        Daftar lembar
      </Link>
      <h2 className="mb-4 text-2xl">Kalibrasi</h2>
      {sample.loading ? (
        <Loading what="jawaban contoh" />
      ) : sample.error ? (
        <ErrorState error={sample.error} onRetry={sample.reload} />
      ) : !sample.data || sample.data.items.length === 0 ? (
        <Empty title="Belum ada jawaban untuk kalibrasi">
          Kalibrasi memakai jawaban uraian dari lembar yang sudah dinilai AI. Kembali lagi setelah ada lembar yang selesai
          dinilai.
        </Empty>
      ) : (
        <Workspace sample={sample.data} />
      )}
    </main>
  );
}
