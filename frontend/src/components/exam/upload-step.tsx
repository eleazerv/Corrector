"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, FileArchive, Images, X } from "lucide-react";
import { api, errorMessage, type ZipOut } from "@/lib/data";
import { sheetStatus } from "@/lib/format";
import { invalidate } from "@/lib/use-resource";
import { Button } from "@/components/kit/button";
import { Field, FieldError, inputClass } from "@/components/kit/field";
import { Icon } from "@/components/kit/icon";
import { ErrorState, Loading, Notice } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { useExam } from "./frame";
import { IMAGE_ACCEPT, MAX_IMAGE_MB, imageProblem } from "./reupload-dialog";

const REPLACEABLE = ["absent", "needs_reupload", "failed"];
const MAX_PAGES = 30;
const MAX_ZIP_MB = 50;

function ZipResult({ r }: { r: ZipOut }) {
  return (
    <div className="mt-4 space-y-3" aria-live="polite">
      <Notice title={`${r.students} mahasiswa, ${r.pages} halaman masuk antrean baca`}>
        Lembar mereka muncul di langkah Penilaian dan diperbarui langsung saat selesai dibaca dan dinilai.
      </Notice>
      {r.skipped.length > 0 && (
        <Notice tone="attention" title={`${r.skipped.length} mahasiswa dilewati`}>
          <ul className="mt-1 space-y-0.5">
            {r.skipped.map((s) => (
              <li key={s.nim}>
                <span className="font-mono text-sm">{s.nim}</span>: {s.reason}
              </li>
            ))}
          </ul>
        </Notice>
      )}
      {r.unmatched_nims.length > 0 && (
        <Notice tone="attention" title="NIM tidak terdaftar di kelas ini">
          <p className="font-mono text-sm">{r.unmatched_nims.join(", ")}</p>
          <p className="mt-1">Tambahkan mahasiswanya ke kelas, lalu unggah ulang file mereka.</p>
        </Notice>
      )}
      {r.unmatched_files.length > 0 && (
        <Notice tone="attention" title={`${r.unmatched_files.length} file tidak dikenali`}>
          <p>Nama file harus berpola NIM_halaman, misalnya 2601001_1.jpg.</p>
          <p className="mt-1 font-mono text-sm break-all">
            {r.unmatched_files.slice(0, 8).join(", ")}
            {r.unmatched_files.length > 8 ? ` dan ${r.unmatched_files.length - 8} lainnya` : ""}
          </p>
        </Notice>
      )}
    </div>
  );
}

function ZipUpload({ disabled }: { disabled: boolean }) {
  const { id } = useExam();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ZipOut | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return setError("Pilih file ZIP.");
    if (!file.name.toLowerCase().endsWith(".zip")) return setError("File harus berformat .zip.");
    if (file.size > MAX_ZIP_MB * 1024 * 1024) return setError(`ZIP lebih dari ${MAX_ZIP_MB} MB. Bagi menjadi beberapa ZIP.`);
    setBusy(true);
    setError(null);
    try {
      const r = await api.uploadZip(id, file);
      setResult(r);
      invalidate(`progress:${id}`, "classes");
      toast(`${r.students} lembar diterima.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="zip" className="rounded-md border border-rule bg-surface px-5 py-5">
      <h2 id="zip" className="flex items-center gap-2 text-xl">
        <Icon icon={FileArchive} size={20} />
        Satu kelas sekaligus
      </h2>
      <p className="mt-1 text-pencil">
        Satu ZIP berisi foto semua mahasiswa. Nama tiap foto: NIM, garis bawah, nomor halaman. Folder di dalam ZIP boleh.
      </p>
      <p className="mt-2 rounded-sm bg-sunken px-3 py-2 font-mono text-sm">
        2601001_1.jpg
        <br />
        2601001_2.jpg
        <br />
        2601002_1.png
      </p>
      <form onSubmit={submit} noValidate className="mt-4 space-y-3">
        <Field id="zip-file" label="File ZIP" hint={`Maksimal ${MAX_ZIP_MB} MB, tiap foto maksimal ${MAX_IMAGE_MB} MB.`}>
          <input
            id="zip-file"
            type="file"
            accept=".zip,application/zip"
            disabled={disabled}
            className={`${inputClass} py-2`}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
              setResult(null);
            }}
            aria-describedby="zip-file-hint"
          />
        </Field>
        <FieldError message={error} />
        <Button type="submit" variant="primary" busy={busy} disabled={disabled}>
          {busy ? "Mengunggah..." : "Unggah ZIP"}
        </Button>
      </form>
      {result && <ZipResult r={result} />}
    </section>
  );
}

function StudentUpload({ initialNim, disabled }: { initialNim?: string; disabled: boolean }) {
  const { id, progress } = useExam();
  const toast = useToast();
  const items = progress?.items ?? [];
  const firstOpen = items.find((i) => REPLACEABLE.includes(i.status));
  const [studentId, setStudentId] = useState<string>(
    () => items.find((i) => i.nim === initialNim)?.student_id ?? firstOpen?.student_id ?? "",
  );
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = items.find((i) => i.student_id === studentId);
  const blocked = selected && !REPLACEABLE.includes(selected.status);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const added = [...list];
    const problem = added.map(imageProblem).find(Boolean);
    setError(problem ?? null);
    setFiles((prev) => [...prev, ...added.filter((f) => !imageProblem(f))].slice(0, MAX_PAGES));
  };

  const move = (i: number, d: -1 | 1) =>
    setFiles((prev) => {
      const next = [...prev];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return setError("Pilih mahasiswa.");
    if (blocked) return setError("Mahasiswa ini sudah punya lembar jawaban yang sedang atau sudah dinilai.");
    if (files.length === 0) return setError("Tambahkan foto halaman jawaban.");
    setBusy(true);
    setError(null);
    try {
      const r = await api.uploadPages(id, { student_id: selected.student_id }, files);
      invalidate(`progress:${id}`, "classes");
      toast(`${r.pages.length} halaman milik ${selected.name} masuk antrean baca.`);
      setFiles([]);
      const next = items.find((i) => i.student_id !== selected.student_id && i.status === "absent");
      if (next) setStudentId(next.student_id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="per-mhs" className="rounded-md border border-rule bg-surface px-5 py-5">
      <h2 id="per-mhs" className="flex items-center gap-2 text-xl">
        <Icon icon={Images} size={20} />
        Per mahasiswa
      </h2>
      <p className="mt-1 text-pencil">Pilih mahasiswa, lalu tambahkan foto halaman jawabannya sesuai urutan.</p>
      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        <Field id="mhs" label="Mahasiswa">
          <select
            id="mhs"
            className={inputClass}
            value={studentId}
            disabled={disabled || items.length === 0}
            onChange={(e) => {
              setStudentId(e.target.value);
              setError(null);
            }}
          >
            {items.length === 0 && <option value="">Kelas belum punya mahasiswa</option>}
            {items.map((i) => (
              <option key={i.student_id} value={i.student_id}>
                {i.nim} · {i.name}
                {REPLACEABLE.includes(i.status) ? "" : ` (${sheetStatus(i.status, i.needs_review).label.toLowerCase()})`}
              </option>
            ))}
          </select>
        </Field>
        {blocked && (
          <Notice tone="attention">
            Lembar {selected.name} sudah {sheetStatus(selected.status, selected.needs_review).label.toLowerCase()}. Foto
            baru hanya diterima untuk lembar yang belum ada atau gagal dibaca.
          </Notice>
        )}
        <Field
          id="pages"
          label="Foto halaman"
          hint={`JPEG, PNG, atau WebP, maksimal ${MAX_IMAGE_MB} MB per foto dan ${MAX_PAGES} halaman.`}
        >
          <input
            id="pages"
            type="file"
            multiple
            accept={IMAGE_ACCEPT}
            disabled={disabled}
            className={`${inputClass} py-2`}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
            aria-describedby="pages-hint"
          />
        </Field>
        {files.length > 0 && (
          <ol className="divide-y divide-rule rounded-md border border-rule" aria-label="Urutan halaman">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-1.5">
                <span className="num w-16 shrink-0 text-sm text-pencil">Hal. {i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="flex shrink-0">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-sunken disabled:opacity-40 md:h-8 md:w-8"
                  >
                    <Icon icon={ArrowUp} />
                    <span className="sr-only">Naikkan {f.name}</span>
                  </button>
                  <button
                    type="button"
                    disabled={i === files.length - 1}
                    onClick={() => move(i, 1)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-sunken disabled:opacity-40 md:h-8 md:w-8"
                  >
                    <Icon icon={ArrowDown} />
                    <span className="sr-only">Turunkan {f.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-sunken md:h-8 md:w-8"
                  >
                    <Icon icon={X} />
                    <span className="sr-only">Hapus {f.name}</span>
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
        <FieldError message={error} />
        <Button type="submit" variant="primary" busy={busy} disabled={disabled || !!blocked}>
          {busy ? "Mengunggah..." : files.length > 0 ? `Unggah ${files.length} halaman` : "Unggah"}
        </Button>
      </form>
    </section>
  );
}

export function UploadStep({ initialNim }: { initialNim?: string }) {
  const { id, header, progress, progressError, reloadProgress } = useExam();
  const noRubric = header.questions_count === 0;

  return (
    <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-16 sm:px-6">
      {noRubric && (
        <div className="mb-6">
          <Notice
            tone="attention"
            title="Rubrik belum diisi"
            action={
              <Link href={`/dosen/ujian/${id}/rubrik`} className="underline underline-offset-4">
                Isi rubrik
              </Link>
            }
          >
            Jawaban baru bisa dinilai setelah soal dan kriterianya ada.
          </Notice>
        </div>
      )}
      {progressError && !progress ? (
        <ErrorState error={progressError} onRetry={reloadProgress} />
      ) : !progress ? (
        <Loading what="daftar mahasiswa" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ZipUpload disabled={noRubric} />
          <StudentUpload initialNim={initialNim} disabled={noRubric} />
        </div>
      )}
    </main>
  );
}
