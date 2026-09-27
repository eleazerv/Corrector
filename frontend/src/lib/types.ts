export type ExamStage = "draft" | "validasi" | "penilaian" | "review" | "publish" | "ditutup";

export type FileStatus =
  | "uploaded"
  | "processing"
  | "ocr_failed"
  | "graded"
  | "review_required"
  | "published";

export type ComplaintStatus = "baru" | "ditinjau" | "selesai" | "ditolak" | "ditutup";

export type Confidence = "tinggi" | "sedang" | "rendah";

export interface Student {
  id: string;
  nim: string;
  name: string;
}

export interface ClassRoom {
  id: string;
  name: string;
  code: string;
  period: string;
  description?: string;
  studentIds: string[];
}

export interface Criterion {
  id: string;
  name: string;
  weight: number;
  baseScore: number;
  deduction: number;
  max: number;
}

export interface Question {
  id: string;
  number: number;
  prompt: string;
  maxScore: number;
  answerKey: string;
  criteria: Criterion[];
  requiredConcepts: string[];
  keywords: string[];
  alternatives: string[];
  commonMistakes: string[];
}

export interface StudentViewSettings {
  perQuestion: boolean;
  evidence: boolean;
  overrideReason: boolean;
}

export interface Exam {
  id: string;
  classId: string;
  title: string;
  stage: ExamStage;
  rubricVersion: number;
  rubricUpdatedAt: string;
  questions: Question[];
  studentView: StudentViewSettings;
  createdAt: string;
  publishedAt?: string;
  complaintDeadline?: string;
}

export interface Evidence {
  id: string;
  effect: "plus" | "minus";
  page: number;
  paragraph: number;
  quote: string;
  note: string;
}

export interface Override {
  criterionScores: Record<string, number>;
  reason: string;
  by: string;
  at: string;
}

export interface Grade {
  questionId: string;
  aiCriterionScores: Record<string, number>;
  confidence: Confidence;
  reviewRequired: boolean;
  reasoning: string;
  studentFeedback: string;
  evidence: Evidence[];
  override?: Override;
  approved?: { by: string; at: string };
}

export interface AnswerPage {
  page: number;
  questionId: string;
  paragraphs: string[];
}

export interface Submission {
  id: string;
  examId: string;
  studentId: string | null;
  fileName: string;
  status: FileStatus;
  pages: AnswerPage[];
  grades: Grade[];
  publishedAt?: string;
}

export interface Complaint {
  id: string;
  examId: string;
  studentId: string;
  questionId: string;
  reason: string;
  attachmentName?: string;
  status: ComplaintStatus;
  createdAt: string;
  aiSummary: string;
  decisionNote?: string;
  decidedAt?: string;
}

export interface FeedbackMemory {
  id: string;
  examId: string;
  questionId: string;
  criterionName: string;
  aiScore: number;
  lecturerScore: number;
  max: number;
  reason: string;
  rubricVersion: number;
  active: boolean;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface AppData {
  lecturer: { id: string; name: string };
  currentStudentId: string;
  students: Student[];
  classes: ClassRoom[];
  exams: Exam[];
  submissions: Submission[];
  complaints: Complaint[];
  memory: FeedbackMemory[];
  audit: AuditEntry[];
}
