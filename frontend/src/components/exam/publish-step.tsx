"use client";

import Link from "next/link";
import { useState } from "react";
import { Download } from "lucide-react";
import { api, errorMessage, type ProgressItem, type PublishOut, type SheetStatus } from "@/lib/data";
import { formatNumber, sheetStatus } from "@/lib/format";
import { invalidate } from "@/lib/use-resource";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { FieldError } from "@/components/kit/field";
import { Icon } from "@/components/kit/icon";
import { AiScore, FinalScore } from "@/components/kit/score";
import { Empty, ErrorState, Loading, Notice, StatusTag } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { useExam } from "./frame";

const IN_PROGRESS: SheetStatus[] = ["ocr_queued", "ocr_processing", "grading"];

type Group = "ready" | "flagged" | "busy" | "published" | "left";

/** Same rules as publish() in modules/publish/service.py. */
function groupOf(i: ProgressItem): Group {
  if (i.status === "published") return "published";
  if (IN_PROGRESS.includes(i.status)) return "busy";
  if (i.status === "graded" && i.needs_review) return "flagged";
  if (i.status === "graded" || i.status === "reviewed") return "ready";
  return "left";
}

function rowTag(i: ProgressItem, g: Group) {
  if (g === "ready") return null;
  if (g === "published") return <StatusTag tone="done">Sudah terbit</StatusTag>;
  if (g === "flagged") return <StatusTag tone="attention">Perlu diperiksa</StatusTag>;
  const s = sheetStatus(i.status, i.needs_review);
  return <StatusTag tone={s.tone}>{s.label}</StatusTag>;
}

function fileName(testName: string) {
  const slug = testName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `nilai-${slug || "ujian"}.csv`;
}

function CsvDownload({ id, testName }: { id: string; testName: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await api.exportCsv(id, fileName(testName));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast(errorMessage(err), "attention");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button onClick={run} busy={busy} className="w-full">
      <Icon icon={Download} />
      Unduh nilai (CSV)
    </Button>
  );
}

function PublishPanel({ items }: { items: ProgressItem[] }) {
  const { id, header } = useExam();
  const toast = useToast();
  const [allowFlagged, setAllowFlagged] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublishOut | null>(null);

  const count = (g: Group) => items.filter((i) => groupOf(i) === g).length;
  const ready = count("ready");
  const flagged = count("flagged");
  const busyCount = count("busy");
  const published = count("published");
  const left = count("left");
  const going = ready + (allowFlagged ? flagged : 0);
  const max = header.max_score;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.publish(id, allowFlagged);
      setResult(r);
      invalidate(`progress:${id}`, `class-test-header:${id}`, "classes");
      toast(`${r.published_now} nilai dipublikasikan. Mahasiswa sudah bisa melihatnya.`);
      setConfirm(false);
      setAllowFlagged(false);
    } catch (err) {
      setError(errorMessage(err));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  const goingSheets = items.filter((i) => groupOf(i) === "ready" || (allowFlagged && groupOf(i) === "flagged"));
  const mean = goingSheets.length ? goingSheets.reduce((s, i) => s + (i.total_grade ?? 0), 0) / goingSheets.length : null;

  return (
    <section aria-labelledby="terbit-h" className="lg:sticky lg:top-[calc(var(--chrome-h,57px)_+_16px)] lg:self-start">
      <h2 id="terbit-h" className="mb-3 text-xl">
        Publikasi
      </h2>
      <div className="space-y-4 rounded-md border border-rule bg-surface px-4 py-4">
        <dl className="num grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt>Siap dipublikasikan</dt>
          <dd className="text-right font-semibold">{ready}</dd>
          {flagged > 0 && (
            <>
              <dt>Masih perlu diperiksa</dt>
              <dd className="text-right font-semibold text-attention">{flagged}</dd>
            </>
          )}
          {busyCount > 0 && (
            <>
              <dt>Sedang dibaca atau dinilai</dt>
              <dd className="text-right">{busyCount}</dd>
            </>
          )}
          {published > 0 && (
            <>
              <dt>Sudah terbit</dt>
              <dd className="text-right">{published}</dd>
            </>
          )}
          {left > 0 && (
            <>
              <dt className="text-pencil">Belum diunggah atau gagal, tidak ikut</dt>
              <dd className="text-right text-pencil">{left}</dd>
            </>
          )}
        </dl>

        <div className="border-t border-rule pt-3 text-sm">
          <p className="font-medium">Yang dilihat mahasiswa</p>
          <p className="mt-1 text-pencil">
            Nilai per soal, umpan balik, foto lembarnya sendiri dengan bagian yang dinilai. Rubrik, kunci jawaban, tingkat
            keyakinan AI, dan alasan perubahan nilai Anda tidak ditampilkan.
          </p>
        </div>

        {busyCount > 0 && (
          <Notice tone="attention">
            {busyCount} lembar masih dibaca atau dinilai. Publikasi bisa dilakukan setelah semuanya selesai.
          </Notice>
        )}

        {flagged > 0 && busyCount === 0 && (
          <div className="space-y-2">
            <Notice
              tone="attention"
              action={
                <Link href={`/dosen/ujian/${id}/review`} className="underline underline-offset-4">
                  Periksa sekarang
                </Link>
              }
            >
              {flagged} lembar masih punya nilai yang ditandai AI. Lembar itu tidak ikut terbit sampai Anda memeriksanya.
            </Notice>
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                checked={allowFlagged}
                onChange={(e) => setAllowFlagged(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-ink"
              />
              <span>
                Tetap ikutkan {flagged} lembar itu
                <span className="block text-sm text-pencil">Nilainya terbit sesuai saran AI tanpa Anda periksa.</span>
              </span>
            </label>
          </div>
        )}

        <div>
          <FieldError message={error} />
          <Button
            variant="primary"
            className="mt-2 w-full"
            disabled={going === 0 || busyCount > 0}
            onClick={() => setConfirm(true)}
          >
            Publikasikan {going} nilai
          </Button>
          {going === 0 && busyCount === 0 && (
            <p className="mt-2 text-sm text-pencil">
              {published > 0 ? "Semua lembar yang sudah dinilai sudah terbit." : "Belum ada lembar yang siap."}
            </p>
          )}
          {published > 0 && going > 0 && (
            <p className="mt-2 text-sm text-pencil">Lembar susulan bisa dipublikasikan kapan saja dengan tombol yang sama.</p>
          )}
        </div>

        {result && (
          <div aria-live="polite">
            <Notice title={`${result.published_now} nilai baru terbit, total ${result.published_total} terbit`}>
              {Object.keys(result.not_published).length > 0 && (
                <p className="text-sm">
                  Tidak ikut:{" "}
                  {Object.entries(result.not_published)
                    .map(([s, n]) => `${n} ${sheetStatus(s as SheetStatus).label.toLowerCase()}`)
                    .join(", ")}
                  .
                </p>
              )}
            </Notice>
          </div>
        )}

        <div className="border-t border-rule pt-4">
          <CsvDownload id={id} testName={header.test_name} />
          <p className="mt-2 text-sm text-pencil">Satu baris per mahasiswa: status, total, dan nilai tiap soal.</p>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={run}
        busy={busy}
        title={`Publikasikan ${going} nilai?`}
        confirmLabel="Ya, publikasikan"
        body={
          <>
            <p>
              {going} mahasiswa akan bisa melihat nilai {header.test_name} dan mengajukan keberatan.
            </p>
            {mean !== null && (
              <p className="text-pencil">
                Rata-rata nilai yang terbit: {formatNumber(mean)}
                {max !== null ? ` dari ${formatNumber(max)}` : ""}. Nilai yang sudah terbit masih bisa diubah, dan setiap
                perubahan tercatat.
              </p>
            )}
            {allowFlagged && flagged > 0 && (
              <p className="text-pencil">Termasuk {flagged} lembar yang belum Anda periksa.</p>
            )}
          </>
        }
      />
    </section>
  );
}

export function PublishStep() {
  const { progress, progressError, reloadProgress, header } = useExam();
  const uploaded = progress?.items.filter((i) => i.status !== "absent") ?? [];

  return (
    <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-16 sm:px-6">
      {!progress && !progressError ? (
        <Loading what="data publikasi" />
      ) : progressError && !progress ? (
        <ErrorState error={progressError} onRetry={reloadProgress} />
      ) : uploaded.length === 0 ? (
        <Empty title="Belum ada lembar untuk dipublikasikan">Unggah dan nilai jawaban mahasiswa terlebih dulu.</Empty>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section aria-labelledby="daftar-h">
            <h2 id="daftar-h" className="mb-3 text-xl">
              Lembar jawaban
            </h2>
            <ul className="divide-y divide-rule rounded-md border border-rule bg-surface">
              {uploaded.map((i) => {
                const g = groupOf(i);
                const tag = rowTag(i, g);
                return (
                  <li key={i.student_id} className="flex min-h-12 items-center gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{i.name}</span>
                      <span className="num block text-[13px] text-pencil">{i.nim}</span>
                      {/* Phones: the tag sits under the name so the name keeps its width. */}
                      {tag && <span className="mt-1 -ml-1.5 block sm:hidden">{tag}</span>}
                    </span>
                    {tag && <span className="hidden shrink-0 sm:block">{tag}</span>}
                    <span className="num w-24 shrink-0 text-right">
                      {i.total_grade === null ? (
                        "-"
                      ) : i.status === "graded" ? (
                        <AiScore value={i.total_grade} max={header.max_score} label />
                      ) : (
                        <FinalScore value={i.total_grade} max={header.max_score} />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          <PublishPanel items={progress!.items} />
        </div>
      )}
    </main>
  );
}
