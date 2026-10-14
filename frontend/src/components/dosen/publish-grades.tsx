"use client";
// Umumkan nilai ke mahasiswa (POST /class-tests/{id}/publish) + unduh CSV.
// Halaman ini menjelaskan dengan kalimat sederhana apa yang terjadi saat tombol ditekan.

import Link from "next/link";
import { useState } from "react";
import { Download, Send, TriangleAlert } from "lucide-react";
import { errorMessage, apiFetch } from "@/lib/api";
import type { PublishResult } from "@/lib/backend-types";
import { downloadFile } from "@/lib/download";
import { BUSY_STATUSES, dateLong, num, score } from "@/lib/format";
import { invalidate } from "@/lib/use-api";
import { useProgress } from "@/lib/use-progress";
import { SheetBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ConfirmModal } from "@/components/ui/modal";
import { Banner, EmptyState } from "@/components/ui/panels";
import { LoadError, Loading } from "@/components/ui/state";
import { useToast } from "@/components/ui/toast";
import { useExam } from "./exam-frame";

export function PublishGrades() {
  const { ct, test, reload: reloadExam } = useExam();
  const progress = useProgress(ct.id);
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (progress.loading && !progress.data) return <Loading />;
  if (progress.error || !progress.data) return <LoadError title="Data gagal dimuat." message={progress.error ?? ""} onRetry={progress.reload} />;

  const items = progress.data.items.filter((i) => i.student_test_id);
  const busy = items.filter((i) => BUSY_STATUSES.includes(i.status)).length;
  const flagged = items.filter((i) => i.status === "graded" && i.needs_review).length;
  const ready = items.filter((i) => ["graded", "reviewed"].includes(i.status)).length;
  const published = items.filter((i) => i.status === "published").length;
  const notReady = items.filter((i) => ["failed", "needs_reupload", "quota_exceeded"].includes(i.status)).length;

  async function publish() {
    setConfirm(false);
    setPublishing(true);
    setError(null);
    try {
      const res = await apiFetch<PublishResult>(`/class-tests/${ct.id}/publish?allow_needs_review=${flagged > 0}`, { method: "POST" });
      toast({ tone: "success", text: `Nilai ${res.published_now} mahasiswa sudah diumumkan.` });
      progress.reload();
      reloadExam();
      invalidate("/class-tests");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPublishing(false);
    }
  }

  async function download() {
    setDownloading(true);
    try {
      await downloadFile(`/class-tests/${ct.id}/export.csv`, `nilai-${ct.test_name}-${ct.class_name}.csv`.replace(/\s+/g, "_"));
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setDownloading(false);
    }
  }

  if (items.length === 0)
    return (
      <EmptyState icon={Send} title="Belum ada nilai untuk diumumkan.">
        Unggah lembar jawaban dan tunggu AI selesai menilai.
      </EmptyState>
    );

  return (
    <div className="space-y-6">
      {ct.status === "published" && (
        <Banner tone="success" title="Nilai sudah diumumkan.">
          Mahasiswa sudah bisa melihat nilai dan penjelasannya. Rubrik dan kunci jawaban Anda tidak ikut terlihat.
        </Banner>
      )}
      {busy > 0 && (
        <Banner tone="info" title={`${busy} lembar masih diproses AI.`}>
          Tunggu sampai selesai sebelum mengumumkan nilai.
        </Banner>
      )}
      {flagged > 0 && (
        <Banner
          tone="warning"
          title={`${flagged} lembar belum Anda cek.`}
          action={
            <Link href={`/dosen/ujian/${ct.id}/review`} className="inline-flex min-h-11 items-center rounded-md border border-primary bg-surface px-4 font-semibold text-primary">
              Cek sekarang
            </Link>
          }
        >
          Sebaiknya dicek dulu. Kalau tetap diumumkan, nilai dari AI yang dipakai.
        </Banner>
      )}
      {notReady > 0 && (
        <Banner tone="danger" title={`${notReady} lembar belum punya nilai.`}>
          Lembar ini tidak ikut diumumkan. Perbaiki di langkah 2 (unggah ulang) atau langkah 3 (nilai ulang).
        </Banner>
      )}
      {error && (
        <Banner tone="danger" title="Nilai belum diumumkan.">
          {error}
        </Banner>
      )}

      <div className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-h3 font-bold">
            {ready > 0 ? `${ready} nilai siap diumumkan` : published > 0 ? "Semua nilai sudah diumumkan" : "Belum ada nilai yang siap"}
          </p>
          <p className="text-text-muted">
            {published > 0 && `${published} sudah diumumkan${progress.data.published_at ? ` sejak ${dateLong(progress.data.published_at)}` : ""}. `}
            Setelah diumumkan, mahasiswa bisa melihat nilai dan mengajukan keberatan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={Download} loading={downloading} loadingText="Mengunduh…" onClick={download}>
            Unduh nilai (Excel/CSV)
          </Button>
          <Button variant="publish" icon={Send} disabled={ready === 0 || busy > 0} loading={publishing} loadingText="Mengumumkan…" onClick={() => setConfirm(true)}>
            Umumkan nilai
          </Button>
        </div>
      </div>

      <table className="sheet">
        <thead>
          <tr>
            <th scope="col">NIM</th>
            <th scope="col">Nama</th>
            <th scope="col">Status</th>
            <th scope="col" className="num">
              Nilai
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.student_id}>
              <td data-label="NIM" className="tabular">
                {i.nim}
              </td>
              <td data-label="Nama">{i.name}</td>
              <td data-label="Status">
                <SheetBadge status={i.status} needsReview={i.needs_review} />
              </td>
              <td data-label="Nilai" className="num">
                {i.total_grade === null ? "-" : score(i.total_grade, test.max_score)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={publish}
        title="Umumkan nilai ke mahasiswa?"
        confirmLabel={`Umumkan ${ready} nilai`}
        variant="publish"
        requireCheck="Saya sudah memeriksa nilai-nilai ini"
      >
        <p>
          {num(ready)} mahasiswa akan bisa melihat nilai, foto jawabannya, dan penjelasan per soal. Kunci jawaban dan kriteria
          Anda tetap rahasia.
        </p>
        {flagged > 0 && (
          <p className="flex items-start gap-2 font-semibold text-warning">
            <Icon icon={TriangleAlert} className="mt-1 shrink-0" /> {flagged} lembar belum Anda cek dan akan diumumkan dengan nilai dari AI.
          </p>
        )}
      </ConfirmModal>
    </div>
  );
}
