// Bentuk response backend (FastAPI, prefix /api/v1).
// Disalin dari modules/*/schemas.py & service.py. Kalau backend berubah, ubah juga di sini.

export type BackendRole = "teacher" | "student" | "school_admin";

export interface ListResponse<T> {
  items: T[];
  total: number;
}

/** Format error backend: {"error": {"code", "message", "details"}} */
export interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

/* ---------------------------------------------------------------- auth */
export interface Me {
  user_id: string;
  role: BackendRole;
  profile_id: string;
  school_id: string;
  name: string | null;
  email: string | null;
  nim: string | null;
}

/* ---------------------------------------------------------------- kelas */
export interface ClassItem {
  id: string;
  school_id: string;
  teacher_id: string | null;
  teacher_name: string | null;
  name: string;
  code: string;
  description: string | null;
  student_count: number;
  test_count: number;
}

export interface StudentItem {
  id: string;
  nim: string;
  name: string;
  email: string;
}

export interface ClassDetail extends ClassItem {
  students: StudentItem[];
  /** id = class_test id */
  tests: { id: string; test_id: string; test_name: string; status: string; test_date: string }[];
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  description: string;
}

/* ---------------------------------------------------------------- tes & soal */
export type QuestionType = "objective" | "essay" | "calculation";
export type TestType = "ASG" | "MID" | "FINAL";

export interface Criterion {
  id: string;
  question_id: string;
  description: string;
  points: number;
}

export interface Question {
  id: string;
  test_id: string;
  number: number;
  question_type: QuestionType;
  question_text: string;
  max_points: number;
  key_answer: string;
  criteria: Criterion[];
}

export interface TestItem {
  id: string;
  subject_id: string;
  subject_name: string;
  maker_id: string | null;
  maker_name: string | null;
  name: string;
  max_score: number;
  test_type: TestType;
  status: string;
  question_count: number;
}

export interface TestDetail extends TestItem {
  questions: Question[];
}

/** class_tests status */
export type ClassTestStatus = "scheduled" | "uploading" | "processing" | "reviewing" | "published";

export interface ClassTestItem {
  id: string;
  class_id: string;
  class_name: string;
  test_id: string;
  test_name: string;
  corrector_id: string | null;
  corrector_name: string | null;
  status: ClassTestStatus;
  test_date: string;
  student_count: number;
}

export interface ClassTestDetail extends ClassTestItem {
  total_pages: number;
  completed_pages: number;
}

/* ---------------------------------------------------------------- lembar jawaban */
export type SheetStatus =
  | "absent"
  | "needs_reupload"
  | "failed"
  | "ocr_queued"
  | "ocr_processing"
  | "grading"
  | "graded"
  | "reviewed"
  | "published"
  | "quota_exceeded";

/** GET /class-tests/{id}/progress */
export interface ProgressItem {
  student_id: string;
  nim: string;
  name: string;
  student_test_id: string | null;
  /** "not_uploaded" kalau mahasiswa belum punya lembar */
  status: SheetStatus | "not_uploaded" | string;
  pages_done: number;
  total_pages: number;
  total_grade: number | null;
  needs_review: boolean;
}

export interface Progress {
  class_test_id: string;
  class_test_status: ClassTestStatus;
  test_name: string;
  max_score: number | null;
  published_at: string | null;
  summary: { total: number; by_status: Record<string, number>; needs_review: number };
  items: ProgressItem[];
}

export interface UploadResult {
  student_test_id: string;
  student_id: string;
  nim: string;
  pages: { id: string; page_no: number }[];
  enqueued: number;
}

export interface ZipResult {
  students: number;
  pages: number;
  enqueued: number;
  uploaded: UploadResult[];
  skipped: { nim: string; reason: string }[];
  unmatched_nims: string[];
  unmatched_files: string[];
}

/** Kotak bukti di foto (skala 0–1000). kind: gain = poin didapat, partial, loss = poin hilang */
export interface BBox {
  block_id: string;
  page_no: number;
  bbox: [number, number, number, number];
  kind: "gain" | "partial" | "loss";
  criterion_id?: string;
}

export interface OcrBlock {
  text?: string;
  label?: string;
  bbox?: number[];
}

export interface CriterionResult {
  criterion_id: string;
  description: string | null;
  points: number;
  max_points: number;
  reasoning?: string;
  evidence_block_ids?: string[];
}

export interface StudentFeedback {
  summary: string;
  points: { no: number; points: number; max_points: number; feedback: string; block_ids?: string[] }[];
}

/** GET /student-tests/{id} (versi DOSEN) */
export interface SheetDetail {
  id: string;
  status: SheetStatus;
  total_grade: number | null;
  needs_review: boolean;
  pages_done: number;
  total_pages: number;
  class_test: { id: string; status: ClassTestStatus };
  student: { id: string; nim: string; name: string };
  test: { id: string; name: string; max_score: number };
  pages: {
    id: string;
    page_no: number;
    status: string;
    error: unknown;
    image_url: string | null;
    ocr_blocks?: OcrBlock[];
  }[];
  answers: {
    id: string | null;
    question: {
      id: string;
      number: number;
      type: QuestionType;
      text: string;
      max_points: number;
      key_answer: string;
      criteria: { id: string; description: string; points: number }[];
    };
    answer_status: "answered" | "unanswered" | "irrelevant" | "unmapped" | null;
    answer_text: string | null;
    grade: number | null;
    confidence_grading: number | null;
    needs_review: boolean;
    ocr_issue: boolean;
    criteria_result: CriterionResult[];
    bbox: BBox[];
    student_feedback: StudentFeedback | null;
    grading_internal: { notes?: string[] } | null;
    override: {
      id: string;
      old_grade: number | null;
      new_grade: number;
      reason: string;
      by: string;
      at: string;
      complaint_id: string | null;
    } | null;
  }[];
}

export interface OverrideResult {
  override_id: string;
  test_answer_id: string;
  student_test_id: string;
  old_grade: number | null;
  new_grade: number;
  total_grade: number;
  needs_review: boolean;
}

export interface PublishResult {
  class_test_id: string;
  status: string;
  published_at: string | null;
  published_now: number;
  published_total: number;
  not_published: Record<string, number> | number | unknown;
}

/* ---------------------------------------------------------------- keberatan */
export type ComplaintStatus = "pending" | "accepted" | "rejected";

export interface TeacherComplaint {
  id: string;
  status: ComplaintStatus;
  complaint: string;
  ai_summary: string | null;
  ai_recommendation: string | null;
  teacher_response: string | null;
  resolved_at: string | null;
  student_test_id: string;
  test_answer_id: string | null;
  class_test_id: string;
  test_name: string;
  nim: string;
  student_name: string;
  question_number: number | null;
  max_points: number | null;
  current_grade: number | null;
}

/* ---------------------------------------------------------------- trait / catatan */
export interface Trait {
  id: string;
  subject_id: string;
  class_id: string | null;
  category: string | null;
  // 3 field ini null sampai diisi AI di worker
  aspect: string | null;
  condition: string | null;
  direction: "lenient" | "stricter" | null;
  canonical_text: string;
  evidence_count: number;
  last_seen: string | null;
  is_active: boolean;
  source: "learned" | "manual" | string;
  updated_at: string;
}

export interface TraitEvidence {
  override_id: string;
  relation: "support" | "contradict";
  decided_by: string;
  similarity: number | null;
  reason: string;
  old_grade: number | null;
  new_grade: number | null;
  created_at: string;
  question_number: number;
  test_name: string;
}

export interface TraitConflict {
  id: string;
  status: "pending" | "keep_old" | "replace" | "keep_both";
  kind: "contradict" | "duplicate"; // catatan manual yang isinya sama atau bertentangan
  override_id: string | null; 
  created_at: string;
  resolved_at: string | null;
  old_id: string;
  old_aspect: string;
  old_direction: string;
  old_canonical_text: string;
  new_id: string;
  new_aspect: string;
  new_direction: string;
  new_canonical_text: string;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

/* ---------------------------------------------------------------- kalibrasi */
export interface CalibrationItem {
  test_answer_id: string;
  student_test_id?: string;
  answer_text: string | null;
  bbox?: BBox[];
  question: {
    number: number;
    type: QuestionType;
    text: string;
    key_answer: string;
    max_points: number;
    criteria: { id: string; description: string; points: number }[];
  };
  pages: { page_no: number; image_url: string | null }[];
  teacher_grade: number | null;
}

export interface CalibrationResult {
  count: number;
  items: {
    test_answer_id: string;
    question_number: number;
    max_points: number;
    teacher_grade: number;
    ai_grade: number;
    diff: number;
    diff_pct: number;
  }[];
  summary: { mean_teacher_pct: number; mean_ai_pct: number; mean_diff_pct: number; mae_pct: number } | null;
}

/* ---------------------------------------------------------------- mahasiswa */
export interface MyTestItem {
  student_test_id: string;
  test_name: string;
  test_type: string;
  subject_name: string;
  subject_code: string;
  class_name: string;
  total_grade: number | null;
  max_score: number | null;
  test_date: string | null;
  published_at: string | null;
}

export interface MyTestDetail {
  student_test_id: string;
  test_name: string;
  subject_name: string;
  test_date: string | null;
  published_at: string | null;
  total_grade: number | null;
  max_score: number | null;
  pages: { page_no: number; image_url: string | null }[];
  answers: {
    test_answer_id: string | null;
    number: number;
    question_text: string;
    max_points: number;
    answer_status: string | null;
    answer_text: string | null;
    grade: number | null;
    adjusted_by_teacher: boolean;
    bbox: Omit<BBox, "criterion_id">[];
    student_feedback: StudentFeedback;
  }[];
  complaints: { id: string; test_answer_id: string | null; status: ComplaintStatus }[];
}

export interface MyComplaint {
  id: string;
  student_test_id: string;
  test_answer_id: string | null;
  complaint: string;
  status: ComplaintStatus;
  teacher_response: string | null;
  resolved_at: string | null;
  test_name: string;
  question_number: number | null;
}
