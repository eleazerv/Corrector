import type {
  AppData,
  ComplaintStatus,
  Confidence,
  Exam,
  ExamStage,
  FileStatus,
  Grade,
  Question,
  Submission,
} from "./types";

export const STAGES: { id: ExamStage; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "validasi", label: "Validasi" },
  { id: "penilaian", label: "Penilaian" },
  { id: "review", label: "Review" },
  { id: "publish", label: "Publish" },
  { id: "ditutup", label: "Ditutup" },
];

export type Tone = "neutral" | "info" | "warning" | "danger" | "success";

export const FILE_STATUS: Record<FileStatus, { label: string; tone: Tone }> = {
  uploaded: { label: "Diunggah", tone: "neutral" },
  processing: { label: "Diproses", tone: "info" },
  ocr_failed: { label: "OCR Gagal", tone: "danger" },
  graded: { label: "Dinilai AI", tone: "info" },
  review_required: { label: "Perlu Review", tone: "warning" },
  published: { label: "Dipublikasikan", tone: "success" },
};

export const COMPLAINT_STATUS: Record<ComplaintStatus, { label: string; tone: Tone }> = {
  baru: { label: "Baru", tone: "info" },
  ditinjau: { label: "Sedang Ditinjau", tone: "warning" },
  selesai: { label: "Selesai", tone: "success" },
  ditolak: { label: "Ditolak", tone: "neutral" },
  ditutup: { label: "Ditutup", tone: "neutral" },
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  tinggi: "Tinggi",
  sedang: "Sedang",
  rendah: "Rendah",
};

export function stageIndex(stage: ExamStage) {
  return STAGES.findIndex((s) => s.id === stage);
}

export function stageText(stage: ExamStage) {
  const i = stageIndex(stage);
  return `Tahap ${i + 1} dari ${STAGES.length}: ${STAGES[i].label}`;
}

export function examMax(exam: Exam) {
  return exam.questions.reduce((sum, q) => sum + q.maxScore, 0);
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function aiScore(grade: Grade) {
  return sum(Object.values(grade.aiCriterionScores));
}

export function finalScore(grade: Grade) {
  return grade.override ? sum(Object.values(grade.override.criterionScores)) : aiScore(grade);
}

export function submissionAiTotal(sub: Submission) {
  return sum(sub.grades.map(aiScore));
}

export function submissionFinalTotal(sub: Submission) {
  return sum(sub.grades.map(finalScore));
}

/** A grade counts as confirmed once the lecturer approved or overrode it. */
export function isConfirmed(grade: Grade) {
  return Boolean(grade.override || grade.approved);
}

export function needsReview(sub: Submission) {
  return sub.status === "review_required";
}

export function isGradable(sub: Submission) {
  return sub.grades.length > 0 && sub.status !== "ocr_failed";
}

export function scoreText(score: number, max: number) {
  return `${formatNumber(score)} / ${formatNumber(max)}`;
}

export function formatNumber(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

const dateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});
const dateLongFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});
const timeFmt = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

export function formatDate(iso: string) {
  return dateFmt.format(new Date(iso));
}

export function formatDateLong(iso: string) {
  return dateLongFmt.format(new Date(iso));
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${dateFmt.format(d)}, ${timeFmt.format(d).replace(".", ":")}`;
}

export function studentName(data: AppData, id: string | null) {
  if (!id) return null;
  return data.students.find((s) => s.id === id) ?? null;
}

export function questionById(exam: Exam, id: string): Question | undefined {
  return exam.questions.find((q) => q.id === id);
}

export function weightTotal(q: Question) {
  return sum(q.criteria.map((c) => c.weight));
}

export function criteriaMaxTotal(q: Question) {
  return sum(q.criteria.map((c) => c.max));
}

/** Rubric problems that block saving, written as instructions to fix. */
export function rubricProblems(q: Question): string[] {
  const problems: string[] = [];
  if (!q.prompt.trim()) problems.push("Isi teks pertanyaan.");
  if (!(q.maxScore > 0)) problems.push("Nilai maksimum soal harus lebih dari 0.");
  if (q.criteria.length === 0) problems.push("Tambahkan minimal satu kriteria rubrik.");
  q.criteria.forEach((c, i) => {
    if (!c.name.trim()) problems.push(`Beri nama kriteria baris ${i + 1}.`);
    if (c.max <= 0) problems.push(`Skor maksimum kriteria baris ${i + 1} harus lebih dari 0.`);
  });
  const w = weightTotal(q);
  if (q.criteria.length > 0 && w !== 100) problems.push(`Total bobot ${w}%, harus tepat 100%.`);
  const m = criteriaMaxTotal(q);
  if (q.criteria.length > 0 && m !== q.maxScore)
    problems.push(`Jumlah skor maksimum kriteria ${m}, harus sama dengan nilai maksimum soal (${q.maxScore}).`);
  return problems;
}
