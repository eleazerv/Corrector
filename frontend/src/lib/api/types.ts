/**
 * Wire types for the Corrector API. Field names are snake_case on purpose: they match the
 * FastAPI responses and the Postgres columns, so nothing is renamed between server and UI.
 *
 * Sections marked "live" mirror backend/modules/<module>/ on branch backend-1, router by router.
 * The mock server returns exactly these shapes too. Sections marked "proposed" are for endpoints
 * that are written but not registered in backend/main.py; only the mock serves them.
 */

export type Uuid = string;
export type Role = "teacher" | "student" | "school_admin";

export interface Me {
  user_id: Uuid;
  role: Role;
  profile_id: Uuid;
  school_id: Uuid;
  name: string;
  email: string | null;
}

/* ---------- status values written by the backend ---------- */

/** class_tests.status (CHECK constraint in schema.sql) */
export type ClassTestStatus = "scheduled" | "uploading" | "processing" | "reviewing" | "published";

/** student_tests.status */
export type SheetStatus =
  | "absent"
  | "ocr_queued"
  | "ocr_processing"
  | "grading"
  | "graded"
  | "reviewed"
  | "published"
  | "needs_reupload"
  | "failed"
  | "quota_exceeded";

/** test_pages.status */
export type PageStatus = "pending" | "processing" | "success" | "needs_reupload" | "failed";

/** test_answers.answer_status */
export type AnswerStatus = "answered" | "unanswered" | "irrelevant" | "unmapped";

export type QuestionType = "essay" | "calculation" | "objective";

/** student_complaints.status */
export type ComplaintStatus = "pending" | "accepted" | "rejected";

/* ---------- live: submission ---------- */

export interface PageRef {
  id: Uuid;
  page_no: number;
}

export interface UploadOut {
  student_test_id: Uuid;
  student_id: Uuid;
  nim: string;
  pages: PageRef[];
  enqueued: number;
}

export interface ZipOut {
  students: number;
  pages: number;
  enqueued: number;
  uploaded: UploadOut[];
  skipped: { nim: string; reason: string }[];
  unmatched_nims: string[];
  unmatched_files: string[];
}

export interface ReuploadOut {
  student_test_id: Uuid;
  page: PageRef;
  enqueued: number;
}

export interface ProgressItem {
  student_id: Uuid;
  nim: string;
  name: string;
  student_test_id: Uuid | null;
  status: SheetStatus;
  pages_done: number;
  total_pages: number;
  total_grade: number | null;
  needs_review: boolean;
}

export interface ProgressOut {
  class_test_id: Uuid;
  class_test_status: ClassTestStatus;
  test_name: string;
  max_score: number | null;
  published_at: string | null;
  summary: {
    total: number;
    by_status: Partial<Record<SheetStatus, number>>;
    needs_review: number;
  };
  items: ProgressItem[];
}

/** One message from GET /class-tests/{id}/events. Workers publish these through Redis. */
export interface ClassTestEvent {
  event:
    | "page_processing"
    | "page_needs_reupload"
    | "page_done"
    | "page_failed"
    | "grading_queued"
    | "grading_started"
    | "question_graded"
    | "grading_run_started"
    | "grading_run_finished"
    | "grading_failed"
    | "complaint_summarized"
    | (string & {});
  student_test_id?: Uuid;
  page_id?: Uuid;
  pages_done?: number;
  total_pages?: number;
  total_grade?: number | null;
  needs_review?: boolean;
  error?: string;
}

/* ---------- live: review (modules/review) ---------- */

export interface Criterion {
  id: Uuid;
  description: string;
  points: number;
}

export interface SheetQuestion {
  id: Uuid;
  number: number;
  type: QuestionType;
  text: string;
  max_points: number;
  key_answer: string;
  criteria: Criterion[];
}

/** test_answers.criteria_result item, with the criterion text merged in by the backend. */
export interface CriterionResult {
  /** A rubric criterion id, or "auto..." for the exact-match shortcut. */
  criterion_id: string;
  points: number;
  max_points: number;
  evidence_block_ids: string[];
  reasoning: string;
  description: string | null;
}

/** [x0, y0, x1, y1] on a 0-1000 scale of the page photo. */
export type Box = [number, number, number, number];

/** test_answers.bbox item: where on the photo a criterion found its evidence. */
export interface EvidenceBox {
  block_id: string;
  page_no: number;
  bbox: Box;
  criterion_id: string;
  kind: "gain" | "partial" | "loss";
}

export interface StudentFeedback {
  summary: string;
  points: { no: number; points: number; max_points: number; feedback: string; block_ids: string[] }[];
}

export interface GradingInternal {
  precheck?: string | null;
  traits_used?: string[];
  notes?: string[];
  error?: string;
}

/** The latest grade_overrides row for an answer. */
export interface AnswerOverride {
  id: Uuid;
  old_grade: number | null;
  new_grade: number;
  reason: string;
  by: string;
  at: string;
  complaint_id: Uuid | null;
}

/** One question of a sheet. `id` is null while the question has no grading result yet. */
export interface SheetAnswer {
  id: Uuid | null;
  question: SheetQuestion;
  answer_status: AnswerStatus | null;
  answer_text: string | null;
  grade: number | null;
  confidence_grading: number | null;
  needs_review: boolean;
  ocr_issue: boolean;
  criteria_result: CriterionResult[];
  bbox: EvidenceBox[];
  student_feedback: StudentFeedback | null;
  grading_internal: GradingInternal | null;
  override: AnswerOverride | null;
}

/** test_pages.ocr_result item. Block ids in the pipeline are "p{page_no}-{index in this list}". */
export interface OcrBlock {
  text: string;
  label: string;
  bbox: number[];
}

export interface SheetPage {
  id: Uuid;
  page_no: number;
  status: PageStatus;
  error: string | null;
  /** Signed URL, valid ~10 minutes (SIGNED_URL_TTL in the backend). */
  image_url: string | null;
  /** Present when the sheet was fetched with include_ocr=true. */
  ocr_blocks?: OcrBlock[];
}

export interface StudentTestDetail {
  id: Uuid;
  status: SheetStatus;
  total_grade: number | null;
  needs_review: boolean;
  pages_done: number;
  total_pages: number;
  class_test: { id: Uuid; status: ClassTestStatus };
  student: { id: Uuid; nim: string; name: string };
  test: { id: Uuid; name: string; max_score: number | null };
  pages: SheetPage[];
  answers: SheetAnswer[];
}

export interface OverrideInput {
  new_grade: number;
  reason: string;
}

export interface OverrideOut {
  override_id: Uuid;
  test_answer_id: Uuid;
  student_test_id: Uuid;
  old_grade: number | null;
  new_grade: number;
  total_grade: number;
  needs_review: boolean;
}

export interface ApproveOut {
  student_test_id: Uuid;
  status: SheetStatus;
  total_grade: number | null;
}

export interface RegradeOut {
  student_test_id: Uuid;
  queued: boolean;
}

export interface GradeClassOut {
  class_test_id: Uuid;
  found: number;
  queued: number;
}

export interface GradingRun {
  id: Uuid;
  student_test_id: Uuid;
  nim: string;
  student_name: string;
  trigger_source: "auto" | "regrade" | "manual" | "retry";
  attempt: number;
  status: "running" | "succeeded" | "failed" | "quota_exceeded" | "skipped";
  model: string | null;
  segment_method: string | null;
  tokens_total: number | null;
  questions_total: number | null;
  questions_needs_review: number | null;
  questions_error: number | null;
  total_grade: number | null;
  /** jsonb: usually a string or {"message": ...}, sometimes another object. */
  error: unknown;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface GradingRunsOut {
  items: GradingRun[];
  tokens_total: number;
  failed: number;
}

/* ---------- live: publish ---------- */

export interface PublishOut {
  class_test_id: Uuid;
  status: ClassTestStatus;
  published_at: string;
  published_now: number;
  published_total: number;
  /** Sheets left out, by status, e.g. {"absent": 2, "failed": 1}. */
  not_published: Partial<Record<SheetStatus, number>>;
}

/* ---------- live: complaints, lecturer side ---------- */

export interface ComplaintItem {
  id: Uuid;
  status: ComplaintStatus;
  complaint: string;
  /** Lecturer only. The student never receives these two. */
  ai_summary: string | null;
  ai_recommendation: string | null;
  teacher_response: string | null;
  resolved_at: string | null;
  student_test_id: Uuid;
  /** null: the complaint is about the sheet as a whole. */
  test_answer_id: Uuid | null;
  class_test_id: Uuid;
  test_name: string;
  nim: string;
  student_name: string;
  question_number: number | null;
  max_points: number | null;
  current_grade: number | null;
}

export interface ComplaintList {
  items: ComplaintItem[];
  pending: number;
}

export interface ResolveInput {
  status: "accepted" | "rejected";
  teacher_response: string;
  new_grade?: number | null;
}

export interface ResolveOut {
  id: Uuid;
  status: ComplaintStatus;
  teacher_response: string;
  resolved_at: string;
  student_test_id: Uuid;
  test_answer_id: Uuid | null;
  override_id: Uuid | null;
  new_grade: number | null;
  total_grade: number | null;
}

/* ---------- live: grading notes (teacher_traits) ---------- */

export interface TeacherTrait {
  id: Uuid;
  subject_id: Uuid;
  class_id: Uuid | null;
  category: string | null;
  aspect: string;
  condition: string;
  direction: "lenient" | "stricter";
  canonical_text: string;
  evidence_count: number;
  last_seen: string | null;
  is_active: boolean;
  /** learned: built by the worker from an override. manual: written by the lecturer. */
  source: "learned" | "manual";
  updated_at: string;
}

export interface TraitPatch {
  canonical_text?: string;
  is_active?: boolean;
}

export interface TraitEvidence {
  override_id: Uuid;
  relation: "support" | "contradict";
  decided_by: "rule" | "llm";
  similarity: number | null;
  reason: string;
  old_grade: number | null;
  new_grade: number;
  created_at: string;
  question_number: number;
  test_name: string;
}

/* ---------- live: blind calibration ---------- */

export interface CalibrationItem {
  test_answer_id: Uuid;
  question: {
    number: number;
    type: QuestionType;
    text: string;
    key_answer: string;
    max_points: number;
    criteria: Criterion[];
  };
  answer_text: string;
  pages: { page_no: number; image_url: string | null }[];
  teacher_grade: number | null;
}

export interface CalibrationSample {
  total: number;
  done: number;
  items: CalibrationItem[];
}

export interface CalibrationResultItem {
  test_answer_id: Uuid;
  question_number: number;
  max_points: number;
  teacher_grade: number;
  ai_grade: number;
  /** ai - lecturer. Negative: the AI gave less. */
  diff: number;
  diff_pct: number;
}

export interface CalibrationResult {
  count: number;
  items: CalibrationResultItem[];
  summary: {
    mean_teacher_pct: number;
    mean_ai_pct: number;
    mean_diff_pct: number;
    mae_pct: number;
    within_10_pct: number;
  } | null;
}

/* ---------- live: student side (modules/student, filtered by dto.py) ---------- */

export interface MyTest {
  student_test_id: Uuid;
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

export interface MyAnswer {
  test_answer_id: Uuid | null;
  number: number;
  question_text: string;
  max_points: number;
  answer_status: AnswerStatus | null;
  answer_text: string | null;
  grade: number | null;
  adjusted_by_teacher: boolean;
  bbox: { page_no: number; bbox: Box; kind: EvidenceBox["kind"]; block_id: string }[];
  student_feedback: StudentFeedback;
}

export interface MyTestDetail {
  student_test_id: Uuid;
  test_name: string;
  subject_name: string;
  test_date: string | null;
  published_at: string | null;
  total_grade: number | null;
  max_score: number | null;
  pages: { page_no: number; image_url: string | null }[];
  answers: MyAnswer[];
  complaints: { id: Uuid; test_answer_id: Uuid | null; status: ComplaintStatus }[];
}

export interface ComplaintIn {
  test_answer_id: Uuid | null;
  complaint: string;
}

export interface MyComplaint {
  id: Uuid;
  student_test_id: Uuid;
  test_answer_id: Uuid | null;
  complaint: string;
  status: ComplaintStatus;
  teacher_response: string | null;
  resolved_at: string | null;
  test_name: string;
  question_number: number | null;
}

/*
 * ---------- classes, exams, rubric ----------
 * Read and written straight to the Supabase tables (lib/api/db.ts), because the classroom and test
 * routers are not registered in the FastAPI app. Row-level security decides what a lecturer may do:
 * create exams and rubrics, link an exam to a class they teach, and manage that class's roster.
 * Classes, subjects and student accounts are created by a school admin.
 */

export interface Student {
  id: Uuid;
  nim: string;
  name: string;
}

export interface Subject {
  id: Uuid;
  name: string;
  code: string;
}

/** tests.test_type */
export type TestType = "ASG" | "MID" | "FINAL";

export interface NewExamInput {
  test_name: string;
  subject_id: Uuid;
  test_type: TestType;
  /** class_tests.test_date is NOT NULL */
  test_date: string;
}

export interface AddStudentsOut {
  added: number;
  already: number;
  /** NIMs with no student account in this school. */
  unknown: string[];
}

export interface ClassTestSummary {
  id: Uuid;
  class_id: Uuid;
  test_name: string;
  status: ClassTestStatus;
  max_score: number;
  test_date: string | null;
  published_at: string | null;
  questions_count: number;
  sheets_total: number;
  /** graded, reviewed or published */
  sheets_graded: number;
  sheets_published: number;
  needs_review: number;
  needs_attention: number;
}

export interface ClassSummary {
  id: Uuid;
  name: string;
  code: string;
  description: string | null;
  /** The signed-in lecturer teaches this class, so they may add exams and change the roster. */
  is_teacher: boolean;
  student_count: number;
  class_tests: ClassTestSummary[];
}

export interface ClassDetail extends ClassSummary {
  students: Student[];
}

export interface Question {
  id: Uuid;
  number: number;
  question_type: QuestionType;
  question_text: string;
  key_answer: string;
  max_points: number;
  criteria: Criterion[];
}

export interface ClassTestDetail {
  id: Uuid;
  test_id: Uuid;
  /** Only the exam's maker or the subject coordinator may change its rubric. */
  can_edit_rubric: boolean;
  class_id: Uuid;
  class_name: string;
  class_code: string;
  test_name: string;
  status: ClassTestStatus;
  max_score: number;
  test_date: string | null;
  published_at: string | null;
  rubric_updated_at: string | null;
  questions: Question[];
}

/** Header data every exam screen needs. Live exams build it from the progress endpoint. */
export interface ClassTestHeader {
  id: Uuid;
  class_id: Uuid | null;
  class_name: string | null;
  test_name: string;
  status: ClassTestStatus;
  max_score: number | null;
  published_at: string | null;
  questions_count: number | null;
}

export interface QuestionInput {
  id?: Uuid;
  question_type: QuestionType;
  question_text: string;
  key_answer: string;
  max_points: number;
  criteria: { id?: Uuid; description: string; points: number }[];
}
