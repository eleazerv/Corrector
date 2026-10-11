/**
 * In-browser stand-in for the backend. It returns the same shapes and error codes as the
 * FastAPI routes, and imitates the OCR and grading workers by emitting the events they publish
 * to /class-tests/{id}/events.
 *
 * State lives in sessionStorage so a page reload keeps demo changes; closing the tab resets it.
 */
import { ApiError } from "../errors";
import type {
  AddStudentsOut,
  ApproveOut,
  CalibrationResult,
  CalibrationSample,
  ClassDetail,
  ClassSummary,
  ClassTestDetail,
  ClassTestEvent,
  ClassTestHeader,
  ClassTestSummary,
  ComplaintIn,
  ComplaintItem,
  ComplaintList,
  ComplaintStatus,
  GradeClassOut,
  GradingRunsOut,
  Me,
  MyComplaint,
  MyTest,
  MyTestDetail,
  NewExamInput,
  OverrideInput,
  OverrideOut,
  ProgressItem,
  ProgressOut,
  PublishOut,
  QuestionInput,
  RegradeOut,
  ResolveInput,
  ResolveOut,
  ReuploadOut,
  Role,
  SheetAnswer,
  SheetStatus,
  StudentTestDetail,
  Subject,
  TeacherTrait,
  TraitEvidence,
  TraitPatch,
  UploadOut,
  ZipOut,
} from "../types";
import {
  applyGrading,
  createSeed,
  round,
  type Db,
  type DbAnswer,
  type DbClassTest,
  type DbOverride,
  type DbSheet,
  type DbStudent,
} from "./seed";
import { listZipEntries } from "./zip";
import type { StreamState } from "../live";

const STORAGE_KEY = "corrector-demo-db";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 30;
const MAX_ZIP_BYTES = 50 * 1024 * 1024;
const REPLACEABLE: SheetStatus[] = ["absent", "needs_reupload", "failed"];
const GRADED: SheetStatus[] = ["graded", "reviewed", "published"];
const IN_PROGRESS: SheetStatus[] = ["ocr_queued", "ocr_processing", "grading"];
const REGRADABLE: SheetStatus[] = ["graded", "reviewed", "failed", "quota_exceeded"];
const ZIP_NAME_RE = /^(\d{6,15})[_-](?:p|page)?(\d{1,3})$/i;

/* ---------- storage ---------- */

let state: Db | null = null;

function db(): Db {
  if (state) return state;
  let loaded: Db | null = null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Db;
      if (parsed.version === 3) loaded = parsed;
    }
  } catch {
    // storage blocked or corrupt: start from the seed
  }
  state = loaded ?? createSeed();
  // Workers do not survive a reload; restart any simulated job that was mid-flight.
  for (const s of state.sheets) if (IN_PROGRESS.includes(s.status)) simulateSheet(s.id, "auto");
  return state;
}

function save() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota or private mode: the demo keeps working in memory
  }
}

export function resetDemo() {
  state = createSeed();
  save();
}

/* ---------- helpers ---------- */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const latency = () => wait(180 + Math.random() * 260);
const clone = <T>(v: T): T => structuredClone(v);
const nowIso = () => new Date().toISOString();
let seq = 0;
const newId = (prefix: string) => `demo-${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`;

const notFound = (what: string) => new ApiError(404, "NOT_FOUND", `${what} not found`);
const conflict = (msg: string) => new ApiError(409, "CONFLICT", msg);
const invalid = (msg: string) => new ApiError(422, "VALIDATION_ERROR", msg);

function classTest(id: string): DbClassTest {
  const ct = db().class_tests.find((c) => c.id === id);
  if (!ct) throw notFound("Class test");
  return ct;
}

function sheet(id: string): DbSheet {
  const s = db().sheets.find((x) => x.id === id);
  if (!s) throw notFound("Student test");
  return s;
}

function student(id: string): DbStudent {
  const s = db().students.find((x) => x.id === id);
  if (!s) throw notFound("Student");
  return s;
}

function roster(classId: string): DbStudent[] {
  return db()
    .enrol.filter((e) => e.class_id === classId)
    .map((e) => student(e.student_id))
    .sort((a, b) => a.nim.localeCompare(b.nim));
}

function findAnswer(answerId: string): { sheet: DbSheet; answer: DbAnswer } {
  for (const s of db().sheets) {
    const answer = s.answers.find((a) => a.id === answerId);
    if (answer) return { sheet: s, answer };
  }
  throw notFound("Test answer");
}

function lastOverride(answerId: string): DbOverride | undefined {
  return db()
    .overrides.filter((o) => o.test_answer_id === answerId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

/** RECALC_SHEET_SQL: total and review flag always come from all answers. */
function recalc(s: DbSheet) {
  s.total_grade = round(s.answers.reduce((x, a) => x + a.grade, 0));
  s.needs_review = s.answers.some((a) => a.needs_review);
}

function settleClassTest(ct: DbClassTest) {
  if (ct.status === "published") return;
  const sheets = db().sheets.filter((s) => s.class_test_id === ct.id);
  if (sheets.some((s) => IN_PROGRESS.includes(s.status))) ct.status = "processing";
  else if (sheets.length > 0) ct.status = "reviewing";
}

/** Variant of the sample answer a student gets, so the same student always writes the same thing. */
const variantFor = (s: DbSheet) => (_q: unknown, i: number) => (Number(student(s.student_id).nim.slice(-2)) || 0) + i;

/* ---------- events (stand-in for Redis pub/sub) ---------- */

const listeners = new Map<string, Set<(e: ClassTestEvent) => void>>();

function emit(classTestId: string, e: ClassTestEvent) {
  listeners.get(classTestId)?.forEach((fn) => fn(e));
}

function addRun(s: DbSheet, trigger: "auto" | "regrade" | "manual", ok: boolean, started: string) {
  const ct = classTest(s.class_test_id);
  const d = db();
  const attempt = d.runs.filter((r) => r.student_test_id === s.id).length + 1;
  d.runs.unshift({
    id: newId("run"),
    class_test_id: ct.id,
    student_test_id: s.id,
    trigger_source: trigger,
    attempt,
    status: ok ? "succeeded" : "failed",
    model: "[simulasi]",
    segment_method: "llm",
    tokens_total: ok ? 2800 + (attempt * 211) % 900 : 0,
    questions_total: ct.questions.length,
    questions_needs_review: ok ? s.answers.filter((a) => a.needs_review).length : 0,
    questions_error: 0,
    total_grade: ok ? s.total_grade : null,
    error: null,
    started_at: started,
    finished_at: nowIso(),
    duration_ms: Date.now() - new Date(started).getTime(),
  });
}

/**
 * Walks one sheet through OCR and grading, publishing the same events the workers do.
 * `only` limits a regrade to some questions; their AI grade is restored and their flag recomputed.
 */
function simulateSheet(sheetId: string, trigger: "auto" | "regrade" | "manual", only?: string[]) {
  const step = 650;
  const run = async () => {
    await wait(step);
    let s = state?.sheets.find((x) => x.id === sheetId);
    if (!s) return;
    const ctId = s.class_test_id;
    const started = nowIso();

    for (const page of s.pages) {
      if (page.status === "success") continue;
      s = state?.sheets.find((x) => x.id === sheetId);
      if (!s) return;
      s.status = "ocr_processing";
      page.status = "processing";
      save();
      emit(ctId, { event: "page_processing", student_test_id: sheetId, page_id: page.id });
      await wait(step);
      page.status = "success";
      s.pages_done = s.pages.filter((p) => p.status === "success").length;
      save();
      emit(ctId, { event: "page_done", student_test_id: sheetId, pages_done: s.pages_done, total_pages: s.total_pages });
    }

    s = state?.sheets.find((x) => x.id === sheetId);
    if (!s) return;
    s.status = "grading";
    save();
    emit(ctId, { event: "grading_queued", student_test_id: sheetId });
    await wait(step);
    emit(ctId, { event: "grading_run_started", student_test_id: sheetId });
    const ct = classTest(ctId);
    for (let i = 0; i < ct.questions.length; i++) {
      await wait(step);
      emit(ctId, { event: "question_graded", student_test_id: sheetId });
    }

    s = state?.sheets.find((x) => x.id === sheetId);
    if (!s) return;
    if (s.answers.length > 0 && trigger === "regrade") {
      for (const a of s.answers) {
        if (only && !only.includes(a.question_id)) continue;
        const q = ct.questions.find((x) => x.id === a.question_id);
        a.grade = round(Math.min(q?.max_points ?? Infinity, a.criteria_result.reduce((x, c) => x + c.points, 0)));
        a.needs_review = a.confidence_grading < 0.6;
      }
    } else {
      applyGrading(s, ct.questions, variantFor(s));
    }
    s.status = "graded";
    recalc(s);
    addRun(s, trigger, true, started);
    settleClassTest(ct);
    save();
    emit(ctId, { event: "grading_run_finished", student_test_id: sheetId, total_grade: s.total_grade, needs_review: s.needs_review });
  };
  void run();
}

/* ---------- image checks, same rules as modules/submission/service.py ---------- */

async function sniff(file: File): Promise<string | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

async function checkImages(files: File[]) {
  if (files.length === 0) throw invalid("At least one image is required");
  if (files.length > MAX_PAGES) throw new ApiError(413, "TOO_MANY_PAGES", `Maximum ${MAX_PAGES} pages per student`);
  for (const f of files) {
    if (f.size === 0) throw invalid(`File '${f.name}' is empty`);
    if (f.size > MAX_IMAGE_BYTES) throw new ApiError(413, "FILE_TOO_LARGE", `File '${f.name}' exceeds 10 MB`);
    if (!(await sniff(f))) {
      throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", `File '${f.name}' is not a JPEG, PNG or WebP image`);
    }
  }
}

function ingest(ct: DbClassTest, s: DbStudent, pageCount: number): UploadOut {
  const d = db();
  const existing = d.sheets.find((x) => x.class_test_id === ct.id && x.student_id === s.id);
  if (existing && !REPLACEABLE.includes(existing.status)) {
    throw conflict(`Student already has an answer sheet (status: ${existing.status})`);
  }
  const id = existing?.id ?? `${ct.id}-st-${s.id}`;
  const fresh: DbSheet = {
    id,
    class_test_id: ct.id,
    student_id: s.id,
    status: "ocr_queued",
    total_pages: pageCount,
    pages_done: 0,
    total_grade: null,
    needs_review: false,
    pages: Array.from({ length: pageCount }, (_, i) => ({
      id: `${id}-p${i + 1}`,
      page_no: i + 1,
      status: "pending",
      error: null,
      ocr_blocks: [],
    })),
    answers: [],
  };
  d.sheets = existing ? d.sheets.map((x) => (x.id === id ? fresh : x)) : [...d.sheets, fresh];
  if (["scheduled", "uploading", "reviewing"].includes(ct.status)) ct.status = "processing";
  save();
  simulateSheet(id, "auto");
  return {
    student_test_id: id,
    student_id: s.id,
    nim: s.nim,
    pages: fresh.pages.map((p) => ({ id: p.id, page_no: p.page_no })),
    enqueued: pageCount,
  };
}

/* ---------- read models ---------- */

function summarize(ct: DbClassTest): ClassTestSummary {
  const sheets = db().sheets.filter((s) => s.class_test_id === ct.id);
  return {
    id: ct.id,
    class_id: ct.class_id,
    test_name: ct.test_name,
    status: ct.status,
    max_score: ct.max_score,
    test_date: ct.test_date,
    published_at: ct.published_at,
    questions_count: ct.questions.length,
    sheets_total: roster(ct.class_id).length,
    sheets_graded: sheets.filter((s) => GRADED.includes(s.status)).length,
    sheets_published: sheets.filter((s) => s.status === "published").length,
    needs_review: sheets.filter((s) => s.needs_review && GRADED.includes(s.status)).length,
    needs_attention: sheets.filter((s) => ["needs_reupload", "failed", "quota_exceeded"].includes(s.status)).length,
  };
}

function classSummary(id: string): ClassSummary {
  const c = db().classes.find((x) => x.id === id);
  if (!c) throw notFound("Class");
  return {
    ...c,
    is_teacher: true,
    student_count: roster(c.id).length,
    class_tests: db()
      .class_tests.filter((ct) => ct.class_id === c.id)
      .map(summarize),
  };
}

/** The lecturer's view of one sheet, built like sheet_detail() in modules/review/service.py. */
function sheetDetail(id: string): StudentTestDetail {
  const s = sheet(id);
  const ct = classTest(s.class_test_id);
  const st = student(s.student_id);
  const answers: SheetAnswer[] = ct.questions.map((q) => {
    const a = s.answers.find((x) => x.question_id === q.id);
    const desc = new Map(q.criteria.map((c) => [c.id, c.description]));
    const question = {
      id: q.id,
      number: q.number,
      type: q.question_type,
      text: q.question_text,
      max_points: q.max_points,
      key_answer: q.key_answer,
      criteria: q.criteria,
    };
    if (!a) {
      return {
        id: null,
        question,
        answer_status: null,
        answer_text: null,
        grade: null,
        confidence_grading: null,
        needs_review: false,
        ocr_issue: false,
        criteria_result: [],
        bbox: [],
        student_feedback: null,
        grading_internal: null,
        override: null,
      };
    }
    const o = lastOverride(a.id);
    return {
      id: a.id,
      question,
      answer_status: a.answer_status,
      answer_text: a.answer_text,
      grade: a.grade,
      confidence_grading: a.confidence_grading,
      needs_review: a.needs_review,
      ocr_issue: a.ocr_issue,
      criteria_result: a.criteria_result.map((r) => ({ ...r, description: desc.get(r.criterion_id) ?? null })),
      bbox: a.bbox,
      student_feedback: a.student_feedback,
      grading_internal: a.grading_internal,
      override: o
        ? {
            id: o.id,
            old_grade: o.old_grade,
            new_grade: o.new_grade,
            reason: o.reason,
            by: o.teacher_name,
            at: o.created_at,
            complaint_id: o.complaint_id,
          }
        : null,
    };
  });
  return clone({
    id: s.id,
    status: s.status,
    total_grade: s.total_grade,
    needs_review: s.needs_review,
    pages_done: s.pages_done,
    total_pages: s.total_pages,
    class_test: { id: ct.id, status: ct.status },
    student: { id: st.id, nim: st.nim, name: st.name },
    test: { id: ct.id, name: ct.test_name, max_score: ct.max_score },
    pages: s.pages.map((p) => ({ id: p.id, page_no: p.page_no, status: p.status, error: p.error, image_url: null, ocr_blocks: p.ocr_blocks })),
    answers,
  });
}

function complaintItem(id: string): ComplaintItem {
  const c = db().complaints.find((x) => x.id === id);
  if (!c) throw notFound("Complaint");
  const s = sheet(c.student_test_id);
  const ct = classTest(s.class_test_id);
  const st = student(c.student_id);
  const answer = s.answers.find((a) => a.id === c.test_answer_id);
  const question = ct.questions.find((q) => q.id === answer?.question_id);
  return {
    id: c.id,
    status: c.status,
    complaint: c.complaint,
    ai_summary: c.ai_summary,
    ai_recommendation: c.ai_recommendation,
    teacher_response: c.teacher_response,
    resolved_at: c.resolved_at,
    student_test_id: s.id,
    test_answer_id: c.test_answer_id,
    class_test_id: ct.id,
    test_name: ct.test_name,
    nim: st.nim,
    student_name: st.name,
    question_number: question?.number ?? null,
    max_points: question?.max_points ?? null,
    current_grade: answer?.grade ?? null,
  };
}

function applyOverride(answerId: string, newGrade: number, reason: string, complaintId: string | null): OverrideOut {
  const { sheet: s, answer } = findAnswer(answerId);
  if (!GRADED.includes(s.status)) throw conflict(`Cannot override a sheet with status ${s.status}`);
  const q = classTest(s.class_test_id).questions.find((x) => x.id === answer.question_id);
  const max = q?.max_points ?? 0;
  if (!Number.isFinite(newGrade) || newGrade < 0 || newGrade > max + 1e-9) {
    throw invalid(`new_grade must be between 0 and ${max}`);
  }
  const o: DbOverride = {
    id: newId("o"),
    student_test_id: s.id,
    test_answer_id: answer.id,
    complaint_id: complaintId,
    teacher_name: db().teacher.name,
    reason,
    old_grade: answer.grade,
    new_grade: newGrade,
    created_at: nowIso(),
  };
  db().overrides.push(o);
  answer.grade = newGrade;
  answer.needs_review = false;
  recalc(s);
  learnTrait(o);
  return {
    override_id: o.id,
    test_answer_id: answer.id,
    student_test_id: s.id,
    old_grade: o.old_grade,
    new_grade: newGrade,
    total_grade: s.total_grade ?? 0,
    needs_review: s.needs_review,
  };
}

/** Stand-in for tasks/build_trait.py: every override becomes evidence for a learned note. */
function learnTrait(o: DbOverride) {
  setTimeout(() => {
    const d = state;
    if (!d) return;
    const { answer } = findAnswer(o.test_answer_id);
    const q = classTest(sheet(o.student_test_id).class_test_id).questions.find((x) => x.id === answer.question_id);
    const id = newId("tr");
    d.traits.unshift({
      id,
      subject_id: d.subject_id,
      class_id: classTest(sheet(o.student_test_id).class_test_id).class_id,
      category: q ? `Soal ${q.number}` : null,
      aspect: q?.criteria[0]?.description ?? "Penilaian umum",
      condition: "[Simulasi] Jawaban serupa dengan jawaban yang nilainya diubah",
      direction: o.new_grade >= (o.old_grade ?? 0) ? "lenient" : "stricter",
      canonical_text: o.reason,
      evidence_count: 1,
      last_seen: o.created_at,
      is_active: true,
      source: "learned",
      updated_at: nowIso(),
    });
    d.evidences.push({ trait_id: id, override_id: o.id, relation: "support", decided_by: "rule", similarity: null });
    save();
  }, 1500);
}

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* ---------- the API ---------- */

export const mock = {
  async me(role: Role): Promise<Me> {
    await latency();
    const d = db();
    if (role === "student") {
      const s = student(d.me_student_id);
      return { user_id: "demo-u-student", role, profile_id: s.id, school_id: "demo-school", name: s.name, email: null };
    }
    return {
      user_id: "demo-u-teacher",
      role: "teacher",
      profile_id: d.teacher.id,
      school_id: "demo-school",
      name: d.teacher.name,
      email: d.teacher.email,
    };
  },

  /* classes, exams and rubric (proposed contract, mock only) */

  async listClasses(): Promise<ClassSummary[]> {
    await latency();
    return db().classes.map((c) => classSummary(c.id));
  },

  async getClass(id: string): Promise<ClassDetail> {
    await latency();
    return { ...classSummary(id), students: clone(roster(id)) };
  },

  async createClass(input: { name: string; code: string; description: string | null }): Promise<ClassSummary> {
    await latency();
    if (!input.name.trim() || !input.code.trim()) throw invalid("Nama dan kode kelas wajib diisi");
    const d = db();
    if (d.classes.some((c) => c.code.toLowerCase() === input.code.trim().toLowerCase())) {
      throw conflict(`Kode kelas ${input.code} sudah dipakai`);
    }
    const c = { id: newId("c"), name: input.name.trim(), code: input.code.trim(), description: input.description };
    d.classes.push(c);
    save();
    return classSummary(c.id);
  },

  async listSubjects(): Promise<Subject[]> {
    await latency();
    return [{ id: db().subject_id, name: "Metodologi Penelitian", code: "MP" }];
  },

  /** Like the real roster: only students who already have an account in the school can be added. */
  async addStudents(classId: string, nims: string[]): Promise<AddStudentsOut> {
    await latency();
    classSummary(classId);
    const d = db();
    const wanted = [...new Set(nims.map((n) => n.trim()).filter(Boolean))];
    let added = 0;
    let already = 0;
    const unknown: string[] = [];
    for (const nim of wanted) {
      const s = d.students.find((x) => x.nim === nim);
      if (!s) unknown.push(nim);
      else if (d.enrol.some((e) => e.class_id === classId && e.student_id === s.id)) already++;
      else {
        d.enrol.push({ class_id: classId, student_id: s.id });
        added++;
      }
    }
    save();
    return { added, already, unknown };
  },

  async removeStudent(classId: string, studentId: string): Promise<void> {
    await latency();
    const d = db();
    if (!d.enrol.some((e) => e.class_id === classId && e.student_id === studentId)) throw notFound("Student in class");
    d.enrol = d.enrol.filter((e) => !(e.class_id === classId && e.student_id === studentId));
    save();
  },

  async createClassTest(classId: string, input: NewExamInput): Promise<ClassTestSummary> {
    await latency();
    classSummary(classId);
    if (!input.test_name.trim()) throw invalid("Nama ujian wajib diisi");
    const ct: DbClassTest = {
      id: newId("ct"),
      class_id: classId,
      test_name: input.test_name.trim(),
      status: "scheduled",
      max_score: 0,
      test_date: input.test_date,
      published_at: null,
      rubric_updated_at: null,
      questions: [],
    };
    db().class_tests.push(ct);
    save();
    return summarize(ct);
  },

  async getClassTest(id: string): Promise<ClassTestDetail> {
    await latency();
    const ct = classTest(id);
    const cls = db().classes.find((c) => c.id === ct.class_id);
    return clone({ ...ct, test_id: ct.id, can_edit_rubric: true, class_name: cls?.name ?? "", class_code: cls?.code ?? "" });
  },

  async getClassTestHeader(id: string): Promise<ClassTestHeader> {
    await latency();
    const ct = classTest(id);
    const cls = db().classes.find((c) => c.id === ct.class_id);
    return {
      id: ct.id,
      class_id: ct.class_id,
      class_name: cls?.name ?? null,
      test_name: ct.test_name,
      status: ct.status,
      max_score: ct.max_score,
      published_at: ct.published_at,
      questions_count: ct.questions.length,
    };
  },

  async saveRubric(id: string, questions: QuestionInput[]): Promise<ClassTestDetail> {
    await latency();
    const ct = classTest(id);
    if (questions.length === 0) throw invalid("Rubrik perlu minimal satu soal");
    questions.forEach((q, i) => {
      if (!q.question_text.trim()) throw invalid(`Soal ${i + 1}: teks soal kosong`);
      if (q.criteria.length === 0) throw invalid(`Soal ${i + 1}: perlu minimal satu kriteria`);
      if (q.criteria.some((c) => !Number.isInteger(c.points))) throw invalid("Poin harus bilangan bulat.");
      const sum = q.criteria.reduce((a, c) => a + c.points, 0);
      if (Math.abs(sum - q.max_points) > 1e-9) {
        throw invalid(`Soal ${i + 1}: jumlah poin kriteria (${sum}) harus sama dengan poin maksimum (${q.max_points})`);
      }
    });
    ct.questions = questions.map((q, i) => ({
      id: q.id ?? newId("q"),
      number: i + 1,
      question_type: q.question_type,
      question_text: q.question_text.trim(),
      key_answer: q.key_answer.trim(),
      max_points: q.max_points,
      criteria: q.criteria.map((c) => ({ id: c.id ?? newId("cr"), description: c.description.trim(), points: c.points })),
    }));
    ct.max_score = ct.questions.reduce((a, q) => a + q.max_points, 0);
    ct.rubric_updated_at = nowIso();
    save();
    return mock.getClassTest(id);
  },

  /* submission */

  async getProgress(id: string): Promise<ProgressOut> {
    await latency();
    const ct = classTest(id);
    const sheets = db().sheets.filter((s) => s.class_test_id === id);
    const members = roster(ct.class_id);
    const ids = new Set(members.map((m) => m.id));
    for (const s of sheets) if (!ids.has(s.student_id)) members.push(student(s.student_id));

    const items: ProgressItem[] = members.map((m) => {
      const s = sheets.find((x) => x.student_id === m.id);
      return {
        student_id: m.id,
        nim: m.nim,
        name: m.name,
        student_test_id: s?.id ?? null,
        status: s?.status ?? "absent",
        pages_done: s?.pages_done ?? 0,
        total_pages: s?.total_pages ?? 0,
        total_grade: s?.total_grade ?? null,
        needs_review: s?.needs_review ?? false,
      };
    });
    items.sort((a, b) => Number(b.needs_review) - Number(a.needs_review) || a.nim.localeCompare(b.nim));
    const by_status: Partial<Record<SheetStatus, number>> = {};
    for (const i of items) by_status[i.status] = (by_status[i.status] ?? 0) + 1;

    return {
      class_test_id: ct.id,
      class_test_status: ct.status,
      test_name: ct.test_name,
      max_score: ct.max_score,
      published_at: ct.published_at,
      summary: { total: items.length, by_status, needs_review: items.filter((i) => i.needs_review).length },
      items,
    };
  },

  async uploadPages(id: string, who: { student_id?: string; nim?: string }, files: File[]): Promise<UploadOut> {
    await latency();
    const ct = classTest(id);
    if (!who.student_id && !who.nim) throw invalid("student_id or nim is required");
    const s = roster(ct.class_id).find((m) => m.id === who.student_id || m.nim === who.nim?.trim());
    if (!s) throw notFound("student in this class");
    await checkImages(files);
    return ingest(ct, s, files.length);
  },

  async uploadZip(id: string, file: File): Promise<ZipOut> {
    await latency();
    const ct = classTest(id);
    if (file.size > MAX_ZIP_BYTES) throw new ApiError(413, "FILE_TOO_LARGE", "ZIP exceeds 50 MB");
    const entries = await listZipEntries(file);
    if (!entries) throw invalid("File is not a valid ZIP");

    const pagesByNim = new Map<string, Set<number>>();
    const unmatched_files: string[] = [];
    for (const e of entries) {
      const parts = e.name.split("/");
      const base = parts[parts.length - 1];
      if (e.isDir || parts.includes("__MACOSX") || base.startsWith(".")) continue;
      const dot = base.lastIndexOf(".");
      const stem = dot > 0 ? base.slice(0, dot) : base;
      const ext = dot > 0 ? base.slice(dot).toLowerCase() : "";
      const m = ZIP_NAME_RE.exec(stem);
      if (!m || ![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
        unmatched_files.push(e.name);
        continue;
      }
      const pages = pagesByNim.get(m[1]) ?? new Set<number>();
      if (pages.has(Number(m[2]))) {
        unmatched_files.push(e.name);
        continue;
      }
      pages.add(Number(m[2]));
      pagesByNim.set(m[1], pages);
    }

    const members = new Map(roster(ct.class_id).map((m) => [m.nim, m]));
    const uploaded: UploadOut[] = [];
    const skipped: { nim: string; reason: string }[] = [];
    for (const nim of [...pagesByNim.keys()].sort()) {
      const m = members.get(nim);
      if (!m) continue;
      try {
        uploaded.push(ingest(ct, m, pagesByNim.get(nim)!.size));
      } catch (err) {
        skipped.push({ nim, reason: err instanceof ApiError ? err.message : String(err) });
      }
    }
    return {
      students: uploaded.length,
      pages: uploaded.reduce((a, u) => a + u.pages.length, 0),
      enqueued: uploaded.reduce((a, u) => a + u.enqueued, 0),
      uploaded,
      skipped,
      unmatched_nims: [...pagesByNim.keys()].filter((n) => !members.has(n)).sort(),
      unmatched_files,
    };
  },

  async reuploadPage(studentTestId: string, pageNo: number, file: File): Promise<ReuploadOut> {
    await latency();
    const s = sheet(studentTestId);
    const page = s.pages.find((p) => p.page_no === pageNo);
    if (!page) throw notFound(`page ${studentTestId} no ${pageNo} is not`);
    if (page.status !== "needs_reupload" && page.status !== "failed") throw conflict("page doesnt need to be reuploaded");
    await checkImages([file]);
    page.status = "pending";
    page.error = null;
    s.status = "ocr_queued";
    s.pages_done = s.pages.filter((p) => p.status === "success").length;
    const ct = classTest(s.class_test_id);
    if (["scheduled", "uploading", "reviewing"].includes(ct.status)) ct.status = "processing";
    save();
    simulateSheet(s.id, "auto");
    return { student_test_id: s.id, page: { id: page.id, page_no: pageNo }, enqueued: 1 };
  },

  subscribe(id: string, onEvent: (e: ClassTestEvent) => void, onState: (s: StreamState) => void) {
    db();
    const set = listeners.get(id) ?? new Set();
    set.add(onEvent);
    listeners.set(id, set);
    queueMicrotask(() => onState("open"));
    return () => {
      set.delete(onEvent);
    };
  },

  /* review */

  async getStudentTest(id: string): Promise<StudentTestDetail> {
    await latency();
    return sheetDetail(id);
  },

  async approveSheet(id: string): Promise<ApproveOut> {
    await latency();
    const s = sheet(id);
    if (s.status !== "graded" && s.status !== "reviewed") {
      throw conflict(`Only graded sheets can be approved (status : ${s.status})`);
    }
    s.status = "reviewed";
    s.needs_review = false;
    for (const a of s.answers) a.needs_review = false;
    save();
    return { student_test_id: s.id, status: s.status, total_grade: s.total_grade };
  },

  async overrideAnswer(answerId: string, input: OverrideInput): Promise<OverrideOut> {
    await latency();
    const reason = input.reason.trim();
    if (reason.length < 3) throw invalid("Input is not Valid ");
    const out = applyOverride(answerId, input.new_grade, reason, null);
    save();
    return out;
  },

  async regradeSheet(id: string, questionIds?: string[]): Promise<RegradeOut> {
    await latency();
    const s = sheet(id);
    if (!REGRADABLE.includes(s.status)) throw conflict(`Cannot regrade a sheet with status ${s.status}`);
    if (s.total_pages <= 0 || s.pages_done < s.total_pages) throw conflict("OCR not complete");
    simulateSheet(s.id, "regrade", questionIds);
    return { student_test_id: s.id, queued: true };
  },

  async retryFailed(classTestId: string, includeQuota: boolean): Promise<GradeClassOut> {
    await latency();
    classTest(classTestId);
    const statuses: SheetStatus[] = includeQuota ? ["failed", "quota_exceeded"] : ["failed"];
    const found = db().sheets.filter(
      (s) => s.class_test_id === classTestId && statuses.includes(s.status) && s.total_pages > 0 && s.pages_done >= s.total_pages,
    );
    for (const s of found) simulateSheet(s.id, "manual");
    return { class_test_id: classTestId, found: found.length, queued: found.length };
  },

  async gradingRuns(classTestId: string): Promise<GradingRunsOut> {
    await latency();
    classTest(classTestId);
    const items = db()
      .runs.filter((r) => r.class_test_id === classTestId)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .map((r) => {
        const st = student(sheet(r.student_test_id).student_id);
        return {
          id: r.id,
          student_test_id: r.student_test_id,
          nim: st.nim,
          student_name: st.name,
          trigger_source: r.trigger_source,
          attempt: r.attempt,
          status: r.status,
          model: r.model,
          segment_method: r.segment_method,
          tokens_total: r.tokens_total,
          questions_total: r.questions_total,
          questions_needs_review: r.questions_needs_review,
          questions_error: r.questions_error,
          total_grade: r.total_grade,
          error: r.error,
          started_at: r.started_at,
          finished_at: r.finished_at,
          duration_ms: r.duration_ms,
        };
      });
    return {
      items: clone(items),
      tokens_total: items.reduce((a, r) => a + (r.tokens_total ?? 0), 0),
      failed: items.filter((r) => r.status === "failed").length,
    };
  },

  /* publish */

  async publish(classTestId: string, allowNeedsReview: boolean): Promise<PublishOut> {
    await latency();
    const ct = classTest(classTestId);
    const sheets = db().sheets.filter((s) => s.class_test_id === classTestId);
    const busy = sheets.filter((s) => IN_PROGRESS.includes(s.status));
    if (busy.length) throw conflict("some answer sheets are still being processed");
    const ready = sheets.filter((s) => s.status === "graded" || s.status === "reviewed");
    if (ready.length === 0) throw conflict("No graded answer sheets to publish");
    const flagged = sheets.filter((s) => s.status === "graded" && s.needs_review).length;
    if (flagged && !allowNeedsReview) {
      throw new ApiError(409, "NEEDS_REVIEW", `${flagged} answer sheet(s) still need review`, { needs_review: flagged });
    }
    const already = sheets.filter((s) => s.status === "published").length;
    for (const s of ready) s.status = "published";
    ct.status = "published";
    ct.published_at = ct.published_at ?? nowIso();

    const not_published: Partial<Record<SheetStatus, number>> = {};
    for (const s of sheets) if (s.status !== "published") not_published[s.status] = (not_published[s.status] ?? 0) + 1;
    const absent = roster(ct.class_id).filter((m) => !sheets.some((s) => s.student_id === m.id)).length;
    if (absent) not_published.absent = absent;
    save();
    return {
      class_test_id: ct.id,
      status: ct.status,
      published_at: ct.published_at,
      published_now: ready.length,
      published_total: ready.length + already,
      not_published,
    };
  },

  async exportCsv(classTestId: string, fallbackName: string): Promise<{ blob: Blob; filename: string }> {
    await latency();
    const ct = classTest(classTestId);
    const sheets = db()
      .sheets.filter((s) => s.class_test_id === classTestId)
      .map((s) => ({ s, st: student(s.student_id) }))
      .sort((a, b) => a.st.nim.localeCompare(b.st.nim));
    const head = ["nim", "name", "status", "total_grade", ...ct.questions.map((q) => `q${q.number} (max ${q.max_points})`)];
    const rows = sheets.map(({ s, st }) => [
      st.nim,
      st.name,
      s.status,
      s.total_grade,
      ...ct.questions.map((q) => s.answers.find((a) => a.question_id === q.id)?.grade ?? ""),
    ]);
    const text = "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
    return { blob: new Blob([text], { type: "text/csv;charset=utf-8" }), filename: fallbackName };
  },

  /* complaints, lecturer side */

  async listComplaints(status: ComplaintStatus): Promise<ComplaintList> {
    await latency();
    const all = db().complaints.map((c) => complaintItem(c.id));
    const items = all
      .filter((c) => c.status === status)
      .sort((a, b) => (b.resolved_at ?? "").localeCompare(a.resolved_at ?? "") || a.nim.localeCompare(b.nim));
    return { items, pending: items.filter((c) => c.status === "pending").length };
  },

  async resolveComplaint(id: string, input: ResolveInput): Promise<ResolveOut> {
    await latency();
    const c = db().complaints.find((x) => x.id === id);
    if (!c) throw notFound("Complaint");
    if (c.status !== "pending") throw conflict(`Complaint is already ${c.status}`);
    const response = input.teacher_response.trim();
    if (response.length < 3) throw invalid("Input is not Valid ");
    let o: OverrideOut | null = null;
    if (input.status === "accepted" && c.test_answer_id) {
      if (input.new_grade === null || input.new_grade === undefined) {
        throw invalid("new_grade is required when accepting this complaint");
      }
      o = applyOverride(c.test_answer_id, input.new_grade, response, c.id);
    } else if (input.new_grade !== null && input.new_grade !== undefined) {
      throw invalid("new_grade is only allowed when accepting a complaint about one question");
    }
    c.status = input.status;
    c.teacher_response = response;
    c.resolved_at = nowIso();
    save();
    return {
      id: c.id,
      status: c.status,
      teacher_response: response,
      resolved_at: c.resolved_at,
      student_test_id: c.student_test_id,
      test_answer_id: c.test_answer_id,
      override_id: o?.override_id ?? null,
      new_grade: o?.new_grade ?? null,
      total_grade: o?.total_grade ?? null,
    };
  },

  /* grading notes */

  async listTraits(): Promise<{ items: TeacherTrait[] }> {
    await latency();
    const items = [...db().traits].sort(
      (a, b) =>
        Number(b.is_active) - Number(a.is_active) ||
        Number(b.source === "manual") - Number(a.source === "manual") ||
        b.evidence_count - a.evidence_count ||
        b.updated_at.localeCompare(a.updated_at),
    );
    return { items: clone(items) };
  },

  async patchTrait(id: string, patch: TraitPatch): Promise<TeacherTrait> {
    await latency();
    const t = db().traits.find((x) => x.id === id);
    if (!t) throw notFound("Trait");
    if (patch.canonical_text !== undefined) {
      const text = patch.canonical_text.trim();
      if (text.length < 10) throw invalid("Input is not Valid ");
      t.canonical_text = text;
    }
    if (patch.is_active !== undefined) t.is_active = patch.is_active;
    t.updated_at = nowIso();
    save();
    return clone(t);
  },

  async traitEvidences(id: string): Promise<{ items: TraitEvidence[] }> {
    await latency();
    const d = db();
    if (!d.traits.some((t) => t.id === id)) throw notFound("Trait");
    const items = d.evidences
      .filter((e) => e.trait_id === id)
      .map((e) => {
        const o = d.overrides.find((x) => x.id === e.override_id)!;
        const { answer } = findAnswer(o.test_answer_id);
        const ct = classTest(sheet(o.student_test_id).class_test_id);
        const q = ct.questions.find((x) => x.id === answer.question_id);
        return {
          override_id: o.id,
          relation: e.relation,
          decided_by: e.decided_by,
          similarity: e.similarity,
          reason: o.reason,
          old_grade: o.old_grade,
          new_grade: o.new_grade,
          created_at: o.created_at,
          question_number: q?.number ?? 0,
          test_name: ct.test_name,
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { items };
  },

  /* blind calibration */

  async calibrationSample(classTestId: string, n: number): Promise<CalibrationSample> {
    await latency();
    const ct = classTest(classTestId);
    const d = db();
    const pool = d.sheets
      .filter((s) => s.class_test_id === classTestId && GRADED.includes(s.status))
      .flatMap((s) => s.answers.filter((a) => a.answer_status === "answered").map((a) => ({ s, a })))
      .filter(({ a }) => ct.questions.find((q) => q.id === a.question_id)?.question_type !== "objective")
      // stable pseudo-random order, so stopping and coming back shows the same answers
      .sort((x, y) => hash(x.a.id) - hash(y.a.id))
      .slice(0, n);
    const items = pool.map(({ s, a }) => {
      const q = ct.questions.find((x) => x.id === a.question_id)!;
      const pages = [...new Set(a.bbox.map((b) => b.page_no))];
      return {
        test_answer_id: a.id,
        question: {
          number: q.number,
          type: q.question_type,
          text: q.question_text,
          key_answer: q.key_answer,
          max_points: q.max_points,
          criteria: q.criteria,
        },
        answer_text: a.answer_text,
        pages: (pages.length ? pages : s.pages.map((p) => p.page_no)).map((page_no) => ({ page_no, image_url: null })),
        teacher_grade: d.calibration.find((c) => c.test_answer_id === a.id)?.teacher_grade ?? null,
      };
    });
    return clone({ total: items.length, done: items.filter((i) => i.teacher_grade !== null).length, items });
  },

  async saveCalibration(classTestId: string, testAnswerId: string, grade: number) {
    await latency();
    const { sheet: s, answer } = findAnswer(testAnswerId);
    if (s.class_test_id !== classTestId) throw notFound("Test answer");
    const max = classTest(classTestId).questions.find((q) => q.id === answer.question_id)?.max_points ?? 0;
    if (!Number.isFinite(grade) || grade < 0 || grade > max + 1e-9) {
      throw invalid(`teacher_grade must be between 0 and ${max}`);
    }
    const d = db();
    d.calibration = [...d.calibration.filter((c) => c.test_answer_id !== testAnswerId), { test_answer_id: testAnswerId, teacher_grade: grade }];
    save();
    return { test_answer_id: testAnswerId, teacher_grade: grade };
  },

  async calibrationResult(classTestId: string): Promise<CalibrationResult> {
    await latency();
    const ct = classTest(classTestId);
    const d = db();
    const items = d.calibration
      .map((c) => {
        const { sheet: s, answer } = findAnswer(c.test_answer_id);
        if (s.class_test_id !== classTestId) return null;
        const q = ct.questions.find((x) => x.id === answer.question_id)!;
        const first = d.overrides
          .filter((o) => o.test_answer_id === answer.id)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
        const ai = first?.old_grade ?? answer.grade;
        const diff = round(ai - c.teacher_grade);
        return {
          test_answer_id: answer.id,
          question_number: q.number,
          max_points: q.max_points,
          teacher_grade: c.teacher_grade,
          ai_grade: ai,
          diff,
          diff_pct: q.max_points ? Math.round((diff / q.max_points) * 1000) / 10 : 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.question_number - b.question_number);
    const n = items.length;
    if (n === 0) return { count: 0, items: [], summary: null };
    const pct = (f: (i: (typeof items)[number]) => number) => Math.round((items.reduce((a, i) => a + f(i), 0) / n) * 10) / 10;
    return {
      count: n,
      items,
      summary: {
        mean_teacher_pct: pct((i) => (i.teacher_grade / i.max_points) * 100),
        mean_ai_pct: pct((i) => (i.ai_grade / i.max_points) * 100),
        mean_diff_pct: pct((i) => i.diff_pct),
        mae_pct: pct((i) => Math.abs(i.diff_pct)),
        within_10_pct: items.filter((i) => Math.abs(i.diff_pct) <= 10).length,
      },
    };
  },

  /* student side */

  async myTests(): Promise<{ items: MyTest[] }> {
    await latency();
    const d = db();
    const items = d.sheets
      .filter((s) => s.student_id === d.me_student_id && s.status === "published")
      .map((s) => {
        const ct = classTest(s.class_test_id);
        const cls = d.classes.find((c) => c.id === ct.class_id);
        return {
          student_test_id: s.id,
          test_name: ct.test_name,
          test_type: "ASG",
          subject_name: cls?.name ?? "",
          subject_code: cls?.code ?? "",
          class_name: cls?.name ?? "",
          total_grade: s.total_grade,
          max_score: ct.max_score,
          test_date: ct.test_date,
          published_at: ct.published_at,
        };
      })
      .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
    return { items };
  },

  /** Same whitelist as modules/student/dto.py: no rubric, no AI confidence, no lecturer reasons. */
  async myTest(studentTestId: string): Promise<MyTestDetail> {
    await latency();
    const d = db();
    const s = d.sheets.find((x) => x.id === studentTestId && x.student_id === d.me_student_id && x.status === "published");
    if (!s) throw notFound("Test result");
    const ct = classTest(s.class_test_id);
    const cls = d.classes.find((c) => c.id === ct.class_id);
    return clone({
      student_test_id: s.id,
      test_name: ct.test_name,
      subject_name: cls?.name ?? "",
      test_date: ct.test_date,
      published_at: ct.published_at,
      total_grade: s.total_grade,
      max_score: ct.max_score,
      pages: s.pages.map((p) => ({ page_no: p.page_no, image_url: null })),
      answers: ct.questions.map((q) => {
        const a = s.answers.find((x) => x.question_id === q.id);
        const adjusted = !!a && d.overrides.some((o) => o.test_answer_id === a.id);
        return {
          test_answer_id: a?.id ?? null,
          number: q.number,
          question_text: q.question_text,
          max_points: q.max_points,
          answer_status: a?.answer_status ?? null,
          answer_text: a?.answer_text ?? null,
          grade: a?.grade ?? null,
          adjusted_by_teacher: adjusted,
          bbox: (a?.bbox ?? []).map(({ page_no, bbox, kind, block_id }) => ({ page_no, bbox, kind, block_id })),
          student_feedback: adjusted
            ? { summary: "Nilai soal ini sudah disesuaikan oleh dosen.", points: [] }
            : (a?.student_feedback ?? { summary: "", points: [] }),
        };
      }),
      complaints: d.complaints
        .filter((c) => c.student_test_id === s.id && c.student_id === d.me_student_id)
        .map((c) => ({ id: c.id, test_answer_id: c.test_answer_id, status: c.status })),
    });
  },

  async submitComplaint(studentTestId: string, input: ComplaintIn) {
    await latency();
    const d = db();
    const s = d.sheets.find((x) => x.id === studentTestId && x.student_id === d.me_student_id && x.status === "published");
    if (!s) throw notFound("Test result");
    const text = input.complaint.trim();
    if (text.length < 10 || text.length > 4000) throw invalid("Input is not Valid ");
    if (input.test_answer_id && !s.answers.some((a) => a.id === input.test_answer_id)) throw notFound("Test answer");
    const open = d.complaints.some(
      (c) => c.student_test_id === s.id && c.status === "pending" && c.test_answer_id === (input.test_answer_id ?? null),
    );
    if (open) throw conflict("You already have a pending complaint for this item");

    const id = newId("k");
    d.complaints.unshift({
      id,
      student_id: d.me_student_id,
      student_test_id: s.id,
      test_answer_id: input.test_answer_id ?? null,
      status: "pending",
      complaint: text,
      ai_summary: null,
      ai_recommendation: null,
      teacher_response: null,
      resolved_at: null,
      created_at: nowIso(),
    });
    save();

    // Stand-in for tasks/summarize_complaint.py, clearly marked as simulated.
    setTimeout(() => {
      const c = state?.complaints.find((x) => x.id === id);
      if (!c || c.ai_summary) return;
      c.ai_summary = `[Simulasi] Ringkasan keberatan: "${c.complaint.slice(0, 140)}${c.complaint.length > 140 ? "..." : ""}"`;
      c.ai_recommendation = "review: [Simulasi] Ringkasan AI sungguhan dibuat oleh worker backend.";
      save();
      emit(s.class_test_id, { event: "complaint_summarized", student_test_id: s.id });
    }, 2500);

    return { id, student_test_id: s.id, test_answer_id: input.test_answer_id ?? null, complaint: text, status: "pending" as const };
  },

  async myComplaints(): Promise<{ items: MyComplaint[] }> {
    await latency();
    const d = db();
    const items = d.complaints
      .filter((c) => c.student_id === d.me_student_id)
      .map((c) => {
        const item = complaintItem(c.id);
        return {
          id: c.id,
          student_test_id: c.student_test_id,
          test_answer_id: c.test_answer_id,
          complaint: c.complaint,
          status: c.status,
          teacher_response: c.teacher_response,
          resolved_at: c.resolved_at,
          test_name: item.test_name,
          question_number: item.question_number,
        };
      })
      .sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || (b.resolved_at ?? "").localeCompare(a.resolved_at ?? ""));
    return { items };
  },
};

/** Small stable string hash, standing in for the backend's md5(id) ordering. */
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
