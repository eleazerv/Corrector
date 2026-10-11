"use client";

import Link from "next/link";
import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { FileUp, Inbox, Play } from "lucide-react";
import { useData, uid } from "@/lib/store";
import { simulateGrading } from "@/lib/sample-data";
import { FILE_STATUS } from "@/lib/grading";
import type { FileStatus, Student, Submission } from "@/lib/types";
import { FileBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Banner, EmptyState } from "@/components/ui/panels";
import { useToast } from "@/components/ui/toast";
import { useExam } from "./exam-frame";

type Method = "filename" | "nim" | "qr" | "manual";
const METHODS: { id: Method; label: string; help: string; soon?: boolean }[] = [
  { id: "nim", label: "NIM di nama file", help: "Contoh: 2601001_uts.pdf" },
  { id: "filename", label: "Nama mahasiswa di nama file", help: "Contoh: mahasiswa_01.jpg" },
  { id: "qr", label: "QR/Barcode di lembar jawaban", help: "Segera hadir", soon: true },
  { id: "manual", label: "Manual", help: "Pilih mahasiswa untuk setiap file di tabel" },
];

const ACCEPT = ["image/jpeg", "image/png", "application/pdf"];
const MAX_MB = 20;

function autoMap(fileName: string, method: Method, students: Student[]): string | null {
  const base = fileName.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  if (method === "nim") return students.find((s) => base.includes(s.nim))?.id ?? null;
  if (method === "filename") {
    const norm = base.replace(/[^a-z0-9]+/g, " ").trim();
    return students.find((s) => norm.includes(s.name.toLowerCase().replace(/[^a-z0-9]+/g, " ")))?.id ?? null;
  }
  return null;
}

export function BatchUpload() {
  const { exam, cls } = useExam();
  const { data, dispatch } = useData();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [method, setMethod] = useState<Method>("nim");
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const [filter, setFilter] = useState<FileStatus | "all">("all");

  const subs = data.submissions.filter((s) => s.examId === exam.id);
  const classStudents = cls.studentIds.map((id) => data.students.find((s) => s.id === id)!).filter(Boolean);
  const queued = subs.filter((s) => s.status === "uploaded" && s.studentId);
  const unmapped = subs.filter((s) => !s.studentId);
  const processing = subs.filter((s) => s.status === "processing");
  const locked = exam.stage === "publish" || exam.stage === "ditutup";
  const noQuestions = exam.questions.length === 0;

  function addFiles(files: File[]) {
    const bad: string[] = [];
    const fresh: Submission[] = [];
    const taken = new Set(subs.map((s) => s.studentId));
    for (const f of files) {
      if (!ACCEPT.includes(f.type)) bad.push(`${f.name}: format tidak didukung. Gunakan JPG, PNG, atau PDF.`);
      else if (f.size > MAX_MB * 1024 * 1024) bad.push(`${f.name}: ukuran melebihi ${MAX_MB} MB. Kompres atau pisahkan per halaman.`);
      else {
        let studentId = autoMap(f.name, method, classStudents);
        if (studentId && taken.has(studentId)) studentId = null;
        if (studentId) taken.add(studentId);
        fresh.push({ id: uid("sub"), examId: exam.id, studentId, fileName: f.name, status: "uploaded", pages: [], grades: [] });
      }
    }
    setRejected(bad);
    if (fresh.length) {
      dispatch({ type: "addSubmissions", submissions: fresh });
      const miss = fresh.filter((s) => !s.studentId).length;
      toast({
        tone: "info",
        text: `${fresh.length} file diunggah.${miss ? ` ${miss} belum terpetakan ke mahasiswa.` : ""}`,
      });
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (locked) return;
    addFiles(Array.from(e.dataTransfer.files));
  }

  /** Simulated queue worker: each file goes Diproses, then Dinilai AI / Perlu Review / OCR Gagal. */
  function process(targets: Submission[], forceSuccess = false) {
    if (!targets.length) return;
    if (exam.stage === "draft" || exam.stage === "validasi") dispatch({ type: "setStage", examId: exam.id, stage: "penilaian" });
    targets.forEach((s) => dispatch({ type: "setSubmission", submissionId: s.id, patch: { status: "processing" } }));
    let remaining = targets.length;
    let failed = 0;
    targets.forEach((s, i) => {
      setTimeout(() => {
        const ocrFails = !forceSuccess && s.fileName.toLowerCase().includes("blur");
        if (ocrFails) {
          failed++;
          dispatch({ type: "setSubmission", submissionId: s.id, patch: { status: "ocr_failed" } });
        } else {
          const r = simulateGrading(s.id, exam.questions, i + s.fileName.length);
          dispatch({
            type: "setSubmission",
            submissionId: s.id,
            patch: { pages: r.pages, grades: r.grades, status: r.reviewRequired ? "review_required" : "graded" },
          });
        }
        remaining--;
        if (remaining === 0) {
          dispatch({ type: "setStage", examId: exam.id, stage: "review" });
          toast({
            tone: failed ? "error" : "success",
            text: failed
              ? `Pemrosesan selesai. ${failed} file gagal dibaca OCR; unggah ulang versi yang lebih jelas.`
              : `Pemrosesan selesai: ${targets.length} file dinilai AI dan siap direview.`,
          });
        }
      }, 900 + i * 700);
    });
  }

  const counted: FileStatus[] = ["uploaded", "processing", "graded", "review_required", "ocr_failed", "published"];
  const counts = counted.map((st) => ({ st, n: subs.filter((s) => s.status === st).length })).filter((c) => c.n > 0);
  const finished = subs.filter((s) => !["uploaded", "processing"].includes(s.status)).length;
  const pct = subs.length ? Math.round((finished / subs.length) * 100) : 0;
  const shown = filter === "all" ? subs : subs.filter((s) => s.status === filter);

  return (
    <div className="space-y-8">
      {noQuestions && (
        <Banner
          tone="warning"
          title="Ujian ini belum punya soal dan rubrik."
          action={
            <Link href={`/dosen/ujian/${exam.id}/rubrik`} className="font-medium underline decoration-border-strong underline-offset-4 hover:decoration-current">
              Lengkapi rubrik
            </Link>
          }
        >
          Jawaban bisa diunggah, tetapi AI baru bisa menilai setelah rubrik disimpan.
        </Banner>
      )}
      {locked && (
        <Banner tone="info" title="Nilai ujian ini sudah dipublikasikan.">
          Unggahan baru ditutup. Perubahan nilai dilakukan lewat Review atau keberatan nilai.
        </Banner>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!locked) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-10 text-center ${
            dragging ? "border-primary bg-primary-soft" : "border-border-strong bg-surface"
          } ${locked ? "opacity-60" : ""}`}
        >
          <Icon icon={FileUp} size={40} className="text-primary" />
          <p className="mt-3 text-h3 font-semibold">Seret file foto/PDF ke sini</p>
          <p className="text-text-muted">atau</p>
          <Button className="mt-2" disabled={locked} onClick={() => inputRef.current?.click()}>
            Pilih File
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.pdf"
            onChange={onPick}
            className="sr-only"
            tabIndex={-1}
            aria-label="Pilih file jawaban"
          />
          <p className="mt-4 text-small text-text-muted">JPG, PNG, atau PDF. Maksimum {MAX_MB} MB per file.</p>
        </div>

        <fieldset className="rounded-lg border border-border bg-surface p-4">
          <legend className="px-1 font-semibold">Cara memetakan file ke mahasiswa</legend>
          <div className="mt-1 space-y-1">
            {METHODS.map((m) => (
              <label
                key={m.id}
                className={`flex min-h-11 items-start gap-3 rounded-md px-2 py-2 ${m.soon ? "cursor-not-allowed text-text-muted" : "cursor-pointer hover:bg-bg"}`}
              >
                <input
                  type="radio"
                  name="mapping"
                  value={m.id}
                  checked={method === m.id}
                  disabled={m.soon}
                  onChange={() => setMethod(m.id)}
                  className="mt-1 h-5 w-5 accent-ink"
                />
                <span>
                  <span className="block font-semibold">{m.label}</span>
                  <span className="text-small text-text-muted">{m.help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {rejected.length > 0 && (
        <Banner tone="danger" title={`${rejected.length} file ditolak`}>
          <ul className="list-disc pl-5">
            {rejected.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Banner>
      )}

      {subs.length > 0 && (
        <section aria-labelledby="progres" className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <h2 id="progres" className="text-h3 font-semibold font-body">
                Progres pemrosesan
              </h2>
              <p className="tabular mt-1" aria-live="polite">
                {finished} dari {subs.length} file diproses ({pct}%)
                {processing.length > 0 && ". Anda boleh meninggalkan halaman ini; notifikasi muncul saat selesai."}
              </p>
              <div
                className="mt-3 h-3 w-full overflow-hidden rounded-sm bg-disabled"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label="Progres pemrosesan file"
              >
                <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <Button
              variant="primary"
              icon={Play}
              disabled={queued.length === 0 || locked || noQuestions}
              onClick={() => process(queued)}
            >
              Mulai Proses ({queued.length})
            </Button>
          </div>
          {unmapped.length > 0 && (
            <p className="mt-3 text-small font-semibold text-warning">
              {unmapped.length} file belum dipetakan ke mahasiswa dan tidak ikut diproses. Pilih mahasiswanya di tabel.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Saring tabel menurut status">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              Semua {subs.length}
            </FilterChip>
            {counts.map(({ st, n }) => (
              <FilterChip key={st} active={filter === st} onClick={() => setFilter(st)}>
                {FILE_STATUS[st].label} {n}
              </FilterChip>
            ))}
          </div>
        </section>
      )}

      {subs.length === 0 ? (
        <EmptyState icon={Inbox} title="Belum ada file jawaban.">
          Unggah foto atau PDF lembar jawaban. File dengan NIM di namanya langsung dipetakan ke mahasiswa.
        </EmptyState>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-4">
          Tidak ada file dengan status ini.{" "}
          <button type="button" onClick={() => setFilter("all")} className="min-h-11 font-medium underline decoration-border-strong underline-offset-4 hover:decoration-current">
            Tampilkan semua
          </button>
        </p>
      ) : (
        <table className="sheet">
          <thead>
            <tr>
              <th scope="col">Nama file</th>
              <th scope="col">Mahasiswa</th>
              <th scope="col">Status</th>
              <th scope="col">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id}>
                <td data-label="File" className="break-all font-mono text-small">
                  {s.fileName}
                </td>
                <td data-label="Mahasiswa">
                  <select
                    aria-label={`Mahasiswa untuk ${s.fileName}`}
                    value={s.studentId ?? ""}
                    disabled={s.status === "published" || s.status === "processing"}
                    onChange={(e) => dispatch({ type: "mapSubmission", submissionId: s.id, studentId: e.target.value || null })}
                    className={`${inputClass} max-w-64 ${!s.studentId ? "border-warning" : ""}`}
                  >
                    <option value="">Belum dipetakan</option>
                    {classStudents
                      .filter((st) => st.id === s.studentId || !subs.some((x) => x.studentId === st.id))
                      .map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.nim} · {st.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td data-label="Status">
                  <FileBadge status={s.status} />
                </td>
                <td data-label="Aksi">
                  <RowAction sub={s} examId={exam.id} onRetry={() => process([s], true)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RowAction({ sub, examId, onRetry }: { sub: Submission; examId: string; onRetry: () => void }) {
  if (sub.status === "ocr_failed")
    return (
      <Button compact onClick={onRetry} disabled={!sub.studentId}>
        Proses Ulang
      </Button>
    );
  if (sub.status === "graded" || sub.status === "review_required" || sub.status === "published")
    return (
      <Link
        href={`/dosen/ujian/${examId}/review?s=${sub.id}`}
        className="inline-flex min-h-11 items-center font-medium underline decoration-border-strong underline-offset-4 hover:decoration-current md:min-h-9"
      >
        Buka review
      </Link>
    );
  if (!sub.studentId) return <span className="text-small text-text-muted">Pilih mahasiswa dulu</span>;
  if (sub.status === "uploaded") return <span className="text-small text-text-muted">Menunggu diproses</span>;
  return <span className="text-small text-text-muted">Sedang diproses</span>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`tabular min-h-11 rounded-sm border px-3 text-small font-semibold md:min-h-9 ${
        active ? "border-primary bg-primary text-white" : "border-border bg-surface text-text hover:border-primary"
      }`}
    >
      {children}
    </button>
  );
}
