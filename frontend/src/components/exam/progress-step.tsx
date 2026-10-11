"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { api, errorMessage, type ProgressItem, type ProgressOut } from "@/lib/data";
import { formatDateTime, formatDuration, formatNumber, runError, sheetStatus } from "@/lib/format";
import { invalidate, useResource } from "@/lib/use-resource";
import { Button, ButtonLink } from "@/components/kit/button";
import { Icon } from "@/components/kit/icon";
import { AiScore, FinalScore } from "@/components/kit/score";
import { Empty, ErrorState, Loading, StatusTag } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { useExam } from "./frame";
import { ReuploadDialog } from "./reupload-dialog";

type Filter = "all" | "action" | "working" | "absent";

const WORKING = ["ocr_queued", "ocr_processing", "grading"];
const BROKEN = ["needs_reupload", "failed", "quota_exceeded"];
const GRADED = ["graded", "reviewed", "published"];

/** Every page was read, so a failure happened in grading and another grading run can fix it. */
const ocrComplete = (i: ProgressItem) => i.total_pages > 0 && i.pages_done >= i.total_pages;
const retryable = (i: ProgressItem) => (i.status === "failed" || i.status === "quota_exceeded") && ocrComplete(i);

function matches(i: ProgressItem, f: Filter) {
  if (f === "all") return true;
  if (f === "action") return i.needs_review || BROKEN.includes(i.status);
  if (f === "working") return WORKING.includes(i.status);
  return i.status === "absent";
}

/** One sentence that says where the exam stands, built from real counts only. */
function summaryLine(p: ProgressOut) {
  const by = p.summary.by_status;
  const graded = (by.graded ?? 0) + (by.reviewed ?? 0) + (by.published ?? 0);
  const extra: string[] = [];
  if (p.summary.needs_review) extra.push(`${p.summary.needs_review} perlu diperiksa`);
  const broken = (by.needs_reupload ?? 0) + (by.failed ?? 0) + (by.quota_exceeded ?? 0);
  if (broken) extra.push(`${broken} gagal diproses`);
  const working = (by.ocr_queued ?? 0) + (by.ocr_processing ?? 0) + (by.grading ?? 0);
  if (working) extra.push(`${working} sedang diproses`);
  if (by.absent) extra.push(`${by.absent} belum diunggah`);
  return `${graded} dari ${p.summary.total} lembar sudah dinilai.${extra.length ? ` ${extra.join(", ")}.` : ""}`;
}

function Score({ i, max }: { i: ProgressItem; max: number | null }) {
  if (i.total_grade === null) return <span className="text-pencil">-</span>;
  // Grey and labelled "AI" until the lecturer has looked at it; red once it is their decision.
  return i.status === "reviewed" || i.status === "published" ? (
    <FinalScore value={i.total_grade} max={max} />
  ) : (
    <AiScore value={i.total_grade} max={max} label />
  );
}

function RowAction({
  i,
  base,
  busy,
  onReupload,
  onRegrade,
}: {
  i: ProgressItem;
  base: string;
  busy: boolean;
  onReupload: (i: ProgressItem) => void;
  onRegrade: (i: ProgressItem) => void;
}) {
  if (i.needs_review && i.student_test_id) {
    return (
      <ButtonLink compact href={`${base}/review?lembar=${i.student_test_id}`}>
        Periksa
      </ButtonLink>
    );
  }
  if (retryable(i)) {
    return (
      <Button compact busy={busy} onClick={() => onRegrade(i)}>
        Nilai ulang
      </Button>
    );
  }
  if ((i.status === "needs_reupload" || i.status === "failed") && i.student_test_id) {
    return (
      <Button compact onClick={() => onReupload(i)}>
        Unggah ulang
      </Button>
    );
  }
  if (i.status === "absent") {
    return (
      <ButtonLink compact href={`${base}/unggah?nim=${encodeURIComponent(i.nim)}`}>
        Unggah
      </ButtonLink>
    );
  }
  if (i.student_test_id && GRADED.includes(i.status)) {
    return (
      <Link
        href={`${base}/review?lembar=${i.student_test_id}`}
        className="inline-flex min-h-11 items-center underline decoration-rule-strong underline-offset-4 md:min-h-8"
      >
        Lihat
      </Link>
    );
  }
  return null;
}

const TRIGGER: Record<string, string> = { auto: "Otomatis", regrade: "Nilai ulang", manual: "Coba lagi", retry: "Ulang otomatis" };
const RUN_STATUS: Record<string, string> = {
  running: "Berjalan",
  succeeded: "Selesai",
  failed: "Gagal",
  quota_exceeded: "Kuota habis",
  skipped: "Dilewati",
};

/** Loaded only when opened: it is for finding out why a sheet failed, not for everyday use. */
function GradingLog({ id }: { id: string }) {
  const runs = useResource(`grading-runs:${id}`, () => api.gradingRuns(id));
  if (runs.loading) return <Loading what="riwayat penilaian" />;
  if (runs.error) return <ErrorState error={runs.error} onRetry={runs.reload} />;
  const r = runs.data!;
  if (r.items.length === 0) return <p className="py-4 text-pencil">Belum ada proses penilaian untuk ujian ini.</p>;
  return (
    <>
      <p className="num text-sm text-pencil">
        {r.items.length} proses, {r.failed} gagal, {formatNumber(r.tokens_total)} token terpakai.
      </p>
      <table className="table mt-2">
        <caption className="sr-only">Riwayat proses penilaian AI</caption>
        <thead>
          <tr>
            <th scope="col">Mulai</th>
            <th scope="col">Mahasiswa</th>
            <th scope="col">Pemicu</th>
            <th scope="col">Hasil</th>
            <th scope="col" className="right">
              Durasi
            </th>
            <th scope="col">Keterangan</th>
          </tr>
        </thead>
        <tbody>
          {r.items.map((run) => {
            const err = runError(run.error);
            const bad = run.status === "failed" || run.status === "quota_exceeded";
            return (
              <tr key={run.id}>
                <td data-label="Mulai" className="num text-sm whitespace-nowrap text-pencil">
                  {formatDateTime(run.started_at)}
                </td>
                <td data-label="Mahasiswa">
                  {run.student_name} <span className="num text-sm text-pencil">{run.nim}</span>
                </td>
                <td data-label="Pemicu" className="text-sm">
                  {TRIGGER[run.trigger_source] ?? run.trigger_source}
                  {run.attempt > 1 ? `, ke-${run.attempt}` : ""}
                </td>
                <td data-label="Hasil">
                  <StatusTag tone={bad ? "attention" : run.status === "running" ? "progress" : "neutral"}>
                    {RUN_STATUS[run.status] ?? run.status}
                  </StatusTag>
                </td>
                <td data-label="Durasi" className="right num text-sm">
                  {formatDuration(run.duration_ms)}
                </td>
                <td data-label="Keterangan" className="text-sm wrap-break-word">
                  {err ?? (run.questions_needs_review ? `${run.questions_needs_review} soal ditandai` : "")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export function ProgressStep() {
  const { id, progress, progressError, reloadProgress } = useExam();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [reupload, setReupload] = useState<ProgressItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const base = `/dosen/ujian/${id}`;

  if (progressError && !progress) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <ErrorState error={progressError} onRetry={reloadProgress} />
      </main>
    );
  }
  if (!progress) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <Loading what="progres penilaian" />
      </main>
    );
  }

  const failedRuns = progress.items.filter(retryable);
  const graded = progress.items.filter((i) => GRADED.includes(i.status)).length;

  const regradeOne = async (i: ProgressItem) => {
    setBusy(i.student_id);
    try {
      await api.regradeSheet(i.student_test_id!);
      invalidate(`progress:${id}`, `grading-runs:${id}`);
      toast(`Lembar ${i.name} masuk antrean nilai ulang.`);
    } catch (err) {
      toast(errorMessage(err), "attention");
    } finally {
      setBusy(null);
    }
  };

  const retryAll = async () => {
    setBusy("all");
    try {
      const r = await api.retryFailed(id, failedRuns.some((i) => i.status === "quota_exceeded"));
      invalidate(`progress:${id}`, `grading-runs:${id}`);
      toast(r.queued > 0 ? `${r.queued} lembar masuk antrean nilai ulang.` : "Tidak ada lembar yang bisa dinilai ulang sekarang.");
    } catch (err) {
      toast(errorMessage(err), "attention");
    } finally {
      setBusy(null);
    }
  };

  const counts: Record<Filter, number> = {
    all: progress.items.length,
    action: progress.items.filter((i) => matches(i, "action")).length,
    working: progress.items.filter((i) => matches(i, "working")).length,
    absent: progress.items.filter((i) => matches(i, "absent")).length,
  };
  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Semua" },
    { key: "action", label: "Perlu tindakan" },
    { key: "working", label: "Sedang diproses" },
    { key: "absent", label: "Belum diunggah" },
  ];
  const rows = progress.items.filter((i) => matches(i, filter));

  return (
    <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-[70ch] text-xl leading-snug font-medium">{summaryLine(progress)}</p>
        <div className="flex flex-wrap gap-2">
          {failedRuns.length > 0 && (
            <Button busy={busy === "all"} onClick={retryAll}>
              Nilai ulang {failedRuns.length} lembar gagal
            </Button>
          )}
          {progress.summary.needs_review > 0 && (
            <ButtonLink variant="primary" href={`${base}/review`}>
              Periksa {progress.summary.needs_review} lembar
            </ButtonLink>
          )}
        </div>
      </div>

      <div role="group" aria-label="Saring lembar" className="mt-6 flex flex-wrap gap-1 border-b border-rule">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`-mb-px min-h-11 border-b-2 px-3 text-sm md:min-h-10 ${
              filter === f.key ? "border-ink font-medium text-ink" : "border-transparent text-pencil hover:text-ink"
            }`}
          >
            {f.label} <span className="num">({counts[f.key]})</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        {progress.items.length === 0 ? (
          <Empty title="Kelas ini belum punya mahasiswa">
            Tambahkan mahasiswa ke kelas supaya jawaban bisa dicocokkan lewat NIM.
          </Empty>
        ) : rows.length === 0 ? (
          <Empty title="Tidak ada lembar di saringan ini">Pilih saringan lain untuk melihat lembar lainnya.</Empty>
        ) : (
          <div className="rounded-md border border-rule bg-surface px-4">
            <table className="table">
              <caption className="sr-only">Lembar jawaban per mahasiswa</caption>
              <thead>
                <tr>
                  <th scope="col">NIM</th>
                  <th scope="col">Nama</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="right">
                    Halaman
                  </th>
                  <th scope="col" className="right">
                    Nilai
                  </th>
                  <th scope="col">
                    <span className="sr-only">Tindakan</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const s = sheetStatus(i.status, i.needs_review);
                  return (
                    <tr key={i.student_id}>
                      <td data-label="NIM" className="num text-sm text-pencil">
                        {i.nim}
                      </td>
                      <td data-label="Nama" className="font-medium">
                        {i.name}
                      </td>
                      <td data-label="Status">
                        <StatusTag tone={s.tone}>{s.label}</StatusTag>
                      </td>
                      <td data-label="Halaman" className="right num">
                        {i.total_pages ? `${i.pages_done} / ${i.total_pages}` : "-"}
                      </td>
                      <td data-label="Nilai" className="right">
                        <Score i={i} max={progress.max_score} />
                      </td>
                      <td className="right">
                        <RowAction
                          i={i}
                          base={base}
                          busy={busy === i.student_id}
                          onReupload={setReupload}
                          onRegrade={regradeOne}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-sm text-pencil">Nilai bertanda AI masih saran. Nilai merah sudah diputuskan dosen.</p>

      {graded > 0 && (
        <section aria-labelledby="kalibrasi-h" className="mt-10 rounded-md border border-rule bg-surface px-5 py-4">
          <h2 id="kalibrasi-h" className="text-lg">
            Seberapa dekat nilai AI dengan nilai Anda?
          </h2>
          <p className="mt-1 max-w-[70ch] text-pencil">
            Nilai beberapa jawaban contoh tanpa melihat nilai AI dan nama mahasiswa, lalu bandingkan. Nilai mahasiswa tidak
            berubah.
          </p>
          <ButtonLink compact className="mt-3" href={`${base}/kalibrasi`}>
            Mulai kalibrasi
          </ButtonLink>
        </section>
      )}

      <details
        className="group mt-6 rounded-md border border-rule bg-surface"
        onToggle={(e) => setLogOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-5 font-medium">
          <Icon icon={ChevronRight} size={16} className="transition-transform group-open:rotate-90" />
          Riwayat penilaian AI
        </summary>
        <div className="border-t border-rule px-5 py-4">{logOpen && <GradingLog id={id} />}</div>
      </details>

      <ReuploadDialog classTestId={id} item={reupload} onClose={() => setReupload(null)} />
    </main>
  );
}
