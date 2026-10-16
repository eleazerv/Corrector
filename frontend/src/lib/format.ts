// format angka/tanggal + label status backend dalam bahasa sehari-hari.
export type Tone = "neutral" | "info" | "warning" | "danger" | "success";

// semua tanggal/jam ditampilkan dalam WIB, apa pun zona waktu komputer pengguna.
// Database tetap menyimpan timestamptz (UTC); konversi hanya saat ditampilkan.
export const TZ = "Asia/Jakarta";
const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const dateLongFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
const isoDateFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });

/** Tanggal hari ini menurut WIB, format YYYY-MM-DD (untuk nilai awal <input type="date">). */
export function todayWIB(): string {
  return isoDateFmt.format(new Date());
}

/** "2026-10-13" dari <input type="date"> -> jam 00:00 WIB hari itu (bukan 00:00 UTC). */
export function wibDateToISO(yyyyMmDd: string): string {
  return `${yyyyMmDd}T00:00:00+07:00`;
}

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

export function score(n: number | null | undefined, max: number | null | undefined): string {
  return `${num(n)} / ${num(max)}`;
}

export function date(iso: string | null | undefined): string {
  return iso ? dateFmt.format(new Date(iso)) : "-";
}

export function dateLong(iso: string | null | undefined): string {
  return iso ? dateLongFmt.format(new Date(iso)) : "-";
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${dateFmt.format(d)}, ${timeFmt.format(d).replace(".", ":")} WIB`;
}

/** Status lembar jawaban (student_tests.status) -> label + warna + apakah sedang diproses. */
export const SHEET_STATUS: Record<string, { label: string; tone: Tone; busy?: boolean }> = {
  not_uploaded: { label: "Belum diunggah", tone: "neutral" },
  absent: { label: "Tidak hadir", tone: "neutral" },
  ocr_queued: { label: "Menunggu dibaca", tone: "info", busy: true },
  ocr_processing: { label: "Sedang dibaca", tone: "info", busy: true },
  grading: { label: "Sedang dinilai", tone: "info", busy: true },
  graded: { label: "Sudah dinilai", tone: "info" },
  reviewed: { label: "Sudah diperiksa", tone: "success" },
  published: { label: "Sudah diumumkan", tone: "success" },
  needs_reupload: { label: "Foto kurang jelas", tone: "danger" },
  failed: { label: "Gagal diproses", tone: "danger" },
  quota_exceeded: { label: "Kuota habis", tone: "danger" },
};

export function sheetStatus(status: string, needsReview = false) {
  if (status === "graded" && needsReview) return { label: "Perlu dicek", tone: "warning" as Tone };
  return SHEET_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
}

export const BUSY_STATUSES = ["ocr_queued", "ocr_processing", "grading"];

/** Tahap ujian (class_tests.status). */
export const CLASS_TEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  scheduled: { label: "Belum ada jawaban", tone: "neutral" },
  uploading: { label: "Mengunggah", tone: "info" },
  processing: { label: "Sedang dinilai AI", tone: "info" },
  reviewing: { label: "Siap diperiksa", tone: "warning" },
  published: { label: "Sudah diumumkan", tone: "success" },
};

export const COMPLAINT_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Menunggu keputusan", tone: "warning" },
  accepted: { label: "Diterima", tone: "success" },
  rejected: { label: "Ditolak", tone: "neutral" },
};

export const QUESTION_TYPES: { id: "objective" | "essay" | "calculation"; label: string; help: string }[] = [
  { id: "essay", label: "Uraian / esai", help: "Jawaban berupa penjelasan. Dinilai AI per kriteria." },
  { id: "calculation", label: "Hitungan", help: "Ada langkah perhitungan. AI ikut mengecek angkanya." },
  { id: "objective", label: "Pilihan ganda / isian singkat", help: "Cukup dicocokkan dengan kunci, tanpa AI." },
];

export function questionTypeLabel(t: string): string {
  return QUESTION_TYPES.find((q) => q.id === t)?.label ?? t;
}

export const TEST_TYPES: { id: "ASG" | "MID" | "FINAL"; label: string }[] = [
  { id: "ASG", label: "Tugas / kuis" },
  { id: "MID", label: "UTS" },
  { id: "FINAL", label: "UAS" },
];

/** confidence 0–1 -> kata sederhana */
export function confidenceLabel(c: number | null | undefined): { label: string; tone: Tone } {
  if (c === null || c === undefined) return { label: "-", tone: "neutral" };
  if (c >= 0.8) return { label: "AI yakin", tone: "success" };
  if (c >= 0.6) return { label: "AI cukup yakin", tone: "info" };
  return { label: "AI ragu", tone: "warning" };
}
