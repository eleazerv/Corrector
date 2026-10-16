"use client";
// Cara utama (paling mudah): per mahasiswa, tombol "Unggah foto" -> pilih semua foto halamannya.
// Cara cepat untuk banyak mahasiswa: ZIP berisi file NIM_halaman.jpg.
// Status dibaca dari /progress dan diperbarui otomatis selama AI masih bekerja.

import Link from "next/link";
import { useRef, useState, type ChangeEvent } from "react";
import { ArrowRight, ClipboardCheck, FileArchive, ImageUp, RotateCw, Upload } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import type { ProgressItem, ZipResult } from "@/lib/backend-types";
import { BUSY_STATUSES } from "@/lib/format";
import { ACCEPTED_IMAGES, compressImage, sortByName } from "@/lib/image";
import { useProgress } from "@/lib/use-progress";
import { invalidate } from "@/lib/use-api";
import { SheetBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Banner, EmptyState } from "@/components/ui/panels";
import { LoadError, Loading } from "@/components/ui/state";
import { useToast } from "@/components/ui/toast";
import { useExam } from "./exam-frame";
import { useMarkReady } from "./mark-ready"; 

const CAN_UPLOAD = ["absent", "needs_reupload", "failed"];

export function BatchUpload() {
  const { ct, test, reload: reloadExam } = useExam();
  const progress = useProgress(ct.id);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<ProgressItem | null>(null);
  const [uploading, setUploading] = useState<string | null>(null); // nim yang sedang diunggah / "zip"
  const [zipResult, setZipResult] = useState<ZipResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const markReady = useMarkReady(); 

  if (test.questions.length === 0)
    return (
      <EmptyState
        icon={Upload}
        title="Tulis soal terlebih dahulu."
        action={
          <Link href={`/dosen/ujian/${ct.id}/rubrik`} className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 font-semibold text-white">
            Ke langkah 1: Soal & Kunci
          </Link>
        }
      >
        AI butuh soal, kunci jawaban, dan kriteria sebelum bisa menilai lembar jawaban.
      </EmptyState>
    );
  // backend menolak upload kalau ujian belum 'ready'
  if (!markReady.ready)
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Apakah soalnya sudah lengkap?"
        action={
          <div className="flex flex-col items-center gap-3">
            <Button variant="primary" icon={ClipboardCheck} loading={markReady.saving} loadingText="Menyimpan…" onClick={() => markReady.markReady()}>
              Ya, soal sudah lengkap
            </Button>
            <Link href={`/dosen/ujian/${ct.id}/rubrik`} className="text-primary underline underline-offset-4">
              Periksa soal dulu
            </Link>
            {markReady.error && <p className="font-semibold text-danger">{markReady.error}</p>}
          </div>
        }
      >
        Ujian ini punya {test.questions.length} soal. Setelah lembar jawaban pertama diunggah, soal tidak bisa diubah lagi.
      </EmptyState>
    );
  if (progress.loading && !progress.data) return <Loading text="Memuat daftar mahasiswa…" />;
  if (progress.error || !progress.data)
    return <LoadError title="Daftar mahasiswa gagal dimuat." message={progress.error ?? ""} onRetry={progress.reload} />;

  const items = progress.data.items;
  const uploaded = items.filter((i) => i.student_test_id).length;
  const busy = items.filter((i) => BUSY_STATUSES.includes(i.status)).length;
  const bad = items.filter((i) => ["needs_reupload", "failed"].includes(i.status)).length;
  const done = items.filter((i) => ["graded", "reviewed", "published"].includes(i.status)).length;

  function pick(item: ProgressItem) {
    setTarget(item);
    setError(null);
    fileRef.current?.click();
  }

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = sortByName(Array.from(e.target.files ?? []));
    e.target.value = "";
    if (!target || files.length === 0) return;
    const wrong = files.filter((f) => !ACCEPTED_IMAGES.includes(f.type));
    if (wrong.length) {
      setError(`${wrong.map((f) => f.name).join(", ")}: bukan foto. Gunakan file JPG atau PNG.`);
      return;
    }
    setUploading(target.nim);
    setError(null);
    try {
      const form = new FormData();
      form.append("nim", target.nim);
      for (const f of files) form.append("files", await compressImage(f));
      await apiFetch(`/class-tests/${ct.id}/uploads`, { method: "POST", body: form });
      toast({ tone: "success", text: `${files.length} halaman milik ${target.name} terkirim. AI mulai membaca.` });
      progress.reload();
      reloadExam();
      invalidate("/class-tests");
    } catch (err) {
      setError(`${target.name}: ${errorMessage(err)}`);
    } finally {
      setUploading(null);
      setTarget(null);
    }
  }

  async function onZip(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading("zip");
    setError(null);
    setZipResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch<ZipResult>(`/class-tests/${ct.id}/zip`, { method: "POST", body: form });
      setZipResult(res);
      progress.reload();
      reloadExam();
      invalidate("/class-tests");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="space-y-6">
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_IMAGES.join(",")}
        multiple
        className="hidden"
        onChange={onFiles}
        aria-hidden="true"
        tabIndex={-1}
      />
      <input ref={zipRef} type="file" accept=".zip,application/zip" className="hidden" onChange={onZip} aria-hidden="true" tabIndex={-1} />

      <ul aria-label="Ringkasan" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Sudah diunggah", `${uploaded} dari ${items.length}`],
          ["Sedang diproses AI", busy],
          ["Selesai dinilai", done],
          ["Foto perlu diulang", bad],
        ].map(([label, value]) => (
          <li key={label as string} className="rounded-md border border-border bg-surface px-4 py-3">
            <span className="block text-small text-text-muted">{label}</span>
            <span className="tabular block text-score-md font-bold">{value}</span>
          </li>
        ))}
      </ul>

      {busy > 0 && (
        <Banner tone="info" title="AI sedang membaca dan menilai jawaban.">
          Halaman ini diperbarui sendiri. Anda boleh menutupnya; penilaian tetap berjalan.
        </Banner>
      )}
      {done > 0 && busy === 0 && (
        <Banner
          tone="success"
          title={`${done} lembar jawaban sudah dinilai AI.`}
          action={
            <Link href={`/dosen/ujian/${ct.id}/review`} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 font-semibold text-white">
              Lanjut periksa nilai <Icon icon={ArrowRight} />
            </Link>
          }
        />
      )}
      {error && (
        <Banner tone="danger" title="Unggahan gagal.">
          {error}
        </Banner>
      )}

      <section aria-labelledby="per-mhs">
        <h2 id="per-mhs" className="text-h2">
          Unggah per mahasiswa
        </h2>
        <p className="mb-3 text-text-muted">
          Klik <b>Unggah foto</b> di baris mahasiswa, lalu pilih semua foto halaman jawabannya sekaligus. Urutan halaman
          mengikuti nama file (misalnya hal1.jpg, hal2.jpg).
        </p>
        {items.length === 0 ? (
          <EmptyState icon={Upload} title="Belum ada mahasiswa di kelas ini.">
            Tambahkan mahasiswa di halaman kelas terlebih dahulu.
          </EmptyState>
        ) : (
          <table className="sheet">
            <thead>
              <tr>
                <th scope="col">NIM</th>
                <th scope="col">Nama</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  Halaman
                </th>
                <th scope="col">
                  <span className="sr-only">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const canUpload = CAN_UPLOAD.includes(i.status);
                const isMine = uploading === i.nim;
                return (
                  <tr key={i.student_id}>
                    <td data-label="NIM" className="tabular">
                      {i.nim}
                    </td>
                    <td data-label="Nama">{i.name}</td>
                    <td data-label="Status">
                      <SheetBadge status={i.student_test_id ? i.status : "not_uploaded"} needsReview={i.needs_review} />
                    </td>
                    <td data-label="Halaman" className="num">
                      {i.total_pages ? `${i.pages_done} / ${i.total_pages}` : "-"}
                    </td>
                    <td data-label="Aksi" className="text-right">
                      <div className="flex min-h-9 items-center justify-end">
                        {canUpload ? (
                          <Button
                            variant={i.student_test_id ? "secondary" : "primary"}
                            compact
                            icon={i.student_test_id ? RotateCw : ImageUp}
                            loading={isMine}
                            loadingText="Mengirim…"
                            disabled={uploading !== null && !isMine}
                            onClick={() => pick(i)}
                          >
                            {i.student_test_id ? "Unggah ulang" : "Unggah foto"}
                          </Button>
                        ) : i.student_test_id && ["graded", "reviewed", "published"].includes(i.status) ? (
                          <Link
                            href={`/dosen/ujian/${ct.id}/review?lembar=${i.student_test_id}`}
                            className="inline-flex min-h-9 items-center px-2 font-semibold text-primary underline underline-offset-4"
                          >
                            Lihat nilai
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <details className="rounded-md border border-border bg-surface px-4 py-3 sm:px-5">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
          <Icon icon={FileArchive} /> Punya banyak foto sekaligus? Unggah satu file ZIP
        </summary>
        <div className="mt-3 space-y-3">
          <p>
            Beri nama setiap foto dengan <b>NIM_nomorhalaman</b>, misalnya <code className="font-mono">2501000001_1.jpg</code>,{" "}
            <code className="font-mono">2501000001_2.jpg</code>. Masukkan semua foto ke satu file ZIP (maksimal 50 MB).
          </p>
          <Button icon={Upload} loading={uploading === "zip"} loadingText="Mengirim ZIP…" disabled={uploading !== null} onClick={() => zipRef.current?.click()}>
            Pilih file ZIP
          </Button>
          {zipResult && (
            <Banner tone={zipResult.skipped.length || zipResult.unmatched_nims.length || zipResult.unmatched_files.length ? "warning" : "success"} title={`${zipResult.students} mahasiswa, ${zipResult.pages} halaman terkirim.`}>
              <ul className="list-disc pl-5">
                {zipResult.unmatched_nims.length > 0 && <li>NIM tidak terdaftar di kelas ini: {zipResult.unmatched_nims.join(", ")}</li>}
                {zipResult.unmatched_files.length > 0 && <li>Nama file tidak sesuai pola: {zipResult.unmatched_files.join(", ")}</li>}
                {zipResult.skipped.map((s) => (
                  <li key={s.nim}>
                    {s.nim} dilewati: {s.reason}
                  </li>
                ))}
              </ul>
            </Banner>
          )}
        </div>
      </details>
    </div>
  );
}
