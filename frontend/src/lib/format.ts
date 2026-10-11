import type { ClassTestStatus, ComplaintStatus, QuestionType, SheetStatus } from "./api/types";

const num = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatNumber = (n: number | null | undefined) => (n === null || n === undefined ? "-" : num.format(n));
export const formatDate = (iso: string | null | undefined) => (iso ? date.format(new Date(iso)) : "-");
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : "-");

export function daysLeft(iso: string | null | undefined, now: number) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

/**
 * "attention" for anything that needs a person to act, "progress" for work the system is doing.
 * Red is not a tone: it belongs to the final score only.
 */
export type Tone = "neutral" | "progress" | "attention" | "done";

export function sheetStatus(status: SheetStatus, needsReview = false): { label: string; tone: Tone } {
  if (needsReview && (status === "graded" || status === "reviewed")) return { label: "Perlu diperiksa", tone: "attention" };
  switch (status) {
    case "absent":
      return { label: "Belum diunggah", tone: "neutral" };
    case "ocr_queued":
      return { label: "Antre dibaca", tone: "progress" };
    case "ocr_processing":
      return { label: "Sedang dibaca", tone: "progress" };
    case "grading":
      return { label: "Sedang dinilai", tone: "progress" };
    case "graded":
      return { label: "Dinilai AI", tone: "done" };
    case "reviewed":
      return { label: "Sudah diperiksa", tone: "done" };
    case "published":
      return { label: "Dipublikasikan", tone: "done" };
    case "needs_reupload":
      return { label: "Foto perlu diulang", tone: "attention" };
    case "failed":
      return { label: "Gagal diproses", tone: "attention" };
    case "quota_exceeded":
      return { label: "Kuota habis", tone: "attention" };
  }
}

export function classTestStatus(status: ClassTestStatus): { label: string; tone: Tone } {
  switch (status) {
    case "scheduled":
      return { label: "Belum ada jawaban", tone: "neutral" };
    case "uploading":
      return { label: "Mengunggah", tone: "progress" };
    case "processing":
      return { label: "Sedang dinilai", tone: "progress" };
    case "reviewing":
      return { label: "Perlu diperiksa", tone: "attention" };
    case "published":
      return { label: "Dipublikasikan", tone: "done" };
  }
}

/** The lecturer is asked to act on a pending complaint; the student is only waiting on it. */
export function complaintStatus(status: ComplaintStatus, viewer: "teacher" | "student"): { label: string; tone: Tone } {
  switch (status) {
    case "pending":
      return viewer === "teacher" ? { label: "Baru", tone: "attention" } : { label: "Menunggu dosen", tone: "progress" };
    case "accepted":
      return { label: "Diterima", tone: "done" };
    case "rejected":
      return { label: "Ditolak", tone: "done" };
  }
}

/** grading_runs.error is jsonb: a string, {"message": ...}, or another object. */
export function runError(e: unknown): string | null {
  if (e === null || e === undefined || e === "") return null;
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return JSON.stringify(e);
}

export function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "-";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} detik` : `${Math.floor(s / 60)} menit ${s % 60} detik`;
}

export const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "essay", label: "Uraian" },
  { value: "calculation", label: "Hitungan" },
  { value: "objective", label: "Jawaban singkat / pilihan" },
];

export const questionTypeLabel = (t: QuestionType) => QUESTION_TYPES.find((x) => x.value === t)?.label ?? t;

/** AI confidence as words. The number alone invites false precision. */
export function confidenceLabel(c: number | null) {
  if (c === null) return "tidak diketahui";
  if (c >= 0.8) return "tinggi";
  if (c >= 0.55) return "sedang";
  return "rendah";
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
