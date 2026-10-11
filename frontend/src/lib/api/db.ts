/**
 * Classes, exams, rubric and class roster, read and written straight to the Supabase tables with
 * the lecturer's own session. The FastAPI backend has routers for these on backend-1, but they are
 * not registered in main.py, so this is the only way to reach them without changing the backend.
 *
 * Row-level security in schema.sql is the access check: a lecturer reads their school's classes,
 * subjects and students; creates exams; edits the rubric of exams they made (or coordinate);
 * links exams to classes they teach and manages those classes' rosters. Creating classes,
 * subjects and student accounts is left to a school admin.
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { ApiError, PARTIAL_WRITE } from "./errors";
import type {
  AddStudentsOut,
  ClassDetail,
  ClassSummary,
  ClassTestDetail,
  ClassTestHeader,
  ClassTestStatus,
  ClassTestSummary,
  NewExamInput,
  QuestionInput,
  QuestionType,
  SheetStatus,
  Student,
  Subject,
  Uuid,
} from "./types";

const GRADED: SheetStatus[] = ["graded", "reviewed", "published"];
const BROKEN: SheetStatus[] = ["needs_reupload", "failed", "quota_exceeded"];

function client(): SupabaseClient {
  const sb = supabase();
  if (!sb) throw new ApiError(0, "NO_SUPABASE", "Supabase belum dikonfigurasi.");
  return sb;
}

/** Turns a PostgREST error into the ApiError the screens already know how to show. */
function fail(e: PostgrestError, forbidden: string): never {
  if (e.code === "42501") throw new ApiError(403, "FORBIDDEN", forbidden, e);
  if (e.code === "23505") throw new ApiError(409, "CONFLICT", "Data yang sama sudah ada.", e);
  if (e.code === "PGRST116") throw new ApiError(404, "NOT_FOUND", "Data tidak ditemukan.", e);
  if (/fetch/i.test(e.message)) throw new ApiError(0, "NETWORK", "Supabase tidak bisa dihubungi.", e);
  throw new ApiError(400, "DB_ERROR", `Database menolak permintaan: ${e.message}`, e);
}

const READ_DENIED = "Akun Anda tidak punya akses ke data ini.";

/** The lecturer row of the signed-in user, cached per user. */
let meCache: { userId: string; value: Promise<{ teacherId: Uuid; schoolId: Uuid }> } | null = null;

async function me() {
  const sb = client();
  const { data } = await sb.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new ApiError(401, "UNAUTHORIZED", "Sesi berakhir.");
  if (meCache?.userId !== userId) {
    const value = (async () => {
      const r = await sb.from("teachers").select("id, school_id").eq("user_id", userId).maybeSingle();
      if (r.error) fail(r.error, READ_DENIED);
      if (!r.data) throw new ApiError(403, "FORBIDDEN", "Akun ini bukan akun dosen.");
      return { teacherId: r.data.id as Uuid, schoolId: r.data.school_id as Uuid };
    })();
    meCache = { userId, value };
    value.catch(() => {
      if (meCache?.value === value) meCache = null;
    });
  }
  return meCache.value;
}

/* ---------- reading ---------- */

interface ClassRow {
  id: Uuid;
  name: string;
  code: string;
  description: string | null;
  teacher_id: Uuid | null;
}

interface ClassTestRow {
  id: Uuid;
  class_id: Uuid;
  test_id: Uuid;
  status: ClassTestStatus;
  test_date: string | null;
  published_at: string | null;
  tests: { name: string; max_score: number | null } | null;
}

const count = <T>(rows: T[], key: (r: T) => string) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return m;
};

/** Class rows plus the counts each class card needs, in five queries whatever the number of classes. */
async function summaries(classes: ClassRow[], teacherId: Uuid): Promise<ClassSummary[]> {
  const sb = client();
  const ids = classes.map((c) => c.id);
  if (ids.length === 0) return [];

  const cts = await sb
    .from("class_tests")
    .select("id, class_id, test_id, status, test_date, published_at, tests(name, max_score)")
    .in("class_id", ids)
    .order("test_date", { ascending: false });
  if (cts.error) fail(cts.error, READ_DENIED);
  const rows = (cts.data ?? []) as unknown as ClassTestRow[];
  const testIds = [...new Set(rows.map((r) => r.test_id))];
  const ctIds = rows.map((r) => r.id);

  const [questions, sheets, roster] = await Promise.all([
    testIds.length ? sb.from("test_questions").select("test_id").in("test_id", testIds) : Promise.resolve({ data: [], error: null }),
    ctIds.length
      ? sb.from("student_tests").select("class_test_id, status, needs_review").in("class_test_id", ctIds)
      : Promise.resolve({ data: [], error: null }),
    sb.from("student_classes").select("class_id").in("class_id", ids),
  ]);
  for (const r of [questions, sheets, roster]) if (r.error) fail(r.error, READ_DENIED);

  const qCount = count((questions.data ?? []) as { test_id: string }[], (r) => r.test_id);
  const rosterCount = count((roster.data ?? []) as { class_id: string }[], (r) => r.class_id);
  const sheetRows = (sheets.data ?? []) as { class_test_id: string; status: SheetStatus; needs_review: boolean }[];

  return classes.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    description: c.description,
    is_teacher: c.teacher_id === teacherId,
    student_count: rosterCount.get(c.id) ?? 0,
    class_tests: rows
      .filter((r) => r.class_id === c.id)
      .map((r): ClassTestSummary => {
        const mine = sheetRows.filter((s) => s.class_test_id === r.id);
        return {
          id: r.id,
          class_id: r.class_id,
          test_name: r.tests?.name ?? "Ujian",
          status: r.status,
          max_score: r.tests?.max_score ?? 0,
          test_date: r.test_date,
          published_at: r.published_at,
          questions_count: qCount.get(r.test_id) ?? 0,
          sheets_total: Math.max(rosterCount.get(c.id) ?? 0, mine.length),
          sheets_graded: mine.filter((s) => GRADED.includes(s.status)).length,
          sheets_published: mine.filter((s) => s.status === "published").length,
          needs_review: mine.filter((s) => s.needs_review && GRADED.includes(s.status)).length,
          needs_attention: mine.filter((s) => BROKEN.includes(s.status)).length,
        };
      }),
  }));
}

/** Classes this lecturer teaches, plus classes holding an exam they correct. */
async function listClasses(): Promise<ClassSummary[]> {
  const sb = client();
  const { teacherId } = await me();
  // RLS returns only the class tests this lecturer may open (teacher of the class, or corrector).
  const visible = await sb.from("class_tests").select("class_id");
  if (visible.error) fail(visible.error, READ_DENIED);
  const viaExams = [...new Set(((visible.data ?? []) as { class_id: string }[]).map((r) => r.class_id))];
  const filter = viaExams.length ? `teacher_id.eq.${teacherId},id.in.(${viaExams.join(",")})` : `teacher_id.eq.${teacherId}`;
  const cls = await sb.from("classes").select("id, name, code, description, teacher_id").or(filter).order("name");
  if (cls.error) fail(cls.error, READ_DENIED);
  return summaries((cls.data ?? []) as ClassRow[], teacherId);
}

async function getClass(id: Uuid): Promise<ClassDetail> {
  const sb = client();
  const { teacherId } = await me();
  const cls = await sb.from("classes").select("id, name, code, description, teacher_id").eq("id", id).single();
  if (cls.error) fail(cls.error, READ_DENIED);
  const [summary] = await summaries([cls.data as ClassRow], teacherId);
  const roster = await sb.from("student_classes").select("students(id, nim, name)").eq("class_id", id);
  if (roster.error) fail(roster.error, READ_DENIED);
  const students = ((roster.data ?? []) as unknown as { students: Student | null }[])
    .map((r) => r.students)
    .filter((s): s is Student => !!s)
    .sort((a, b) => a.nim.localeCompare(b.nim));
  return { ...summary, students };
}

async function listSubjects(): Promise<Subject[]> {
  const r = await client().from("subjects").select("id, name, code").order("name");
  if (r.error) fail(r.error, READ_DENIED);
  return (r.data ?? []) as Subject[];
}

interface ClassTestJoin {
  id: Uuid;
  class_id: Uuid;
  test_id: Uuid;
  status: ClassTestStatus;
  test_date: string | null;
  published_at: string | null;
  tests: { name: string; max_score: number | null; maker_id: Uuid | null; subject_id: Uuid } | null;
  classes: { name: string; code: string } | null;
}

async function classTestRow(id: Uuid): Promise<ClassTestJoin> {
  const r = await client()
    .from("class_tests")
    .select("id, class_id, test_id, status, test_date, published_at, tests(name, max_score, maker_id, subject_id), classes(name, code)")
    .eq("id", id)
    .single();
  if (r.error) fail(r.error, READ_DENIED);
  return r.data as unknown as ClassTestJoin;
}

/** Mirrors teacher_can_manage_test() in schema.sql: the exam's maker or a coordinator of its subject. */
async function canManage(ct: ClassTestJoin, teacherId: Uuid) {
  if (ct.tests?.maker_id === teacherId) return true;
  if (!ct.tests) return false;
  const r = await client()
    .from("subject_coordinators")
    .select("subject_id")
    .eq("subject_id", ct.tests.subject_id)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  return !r.error && !!r.data;
}

interface QuestionRow {
  id: Uuid;
  number: number;
  question_type: QuestionType;
  question_text: string;
  max_points: number;
  key_answer: string;
  question_criteria: { id: Uuid; description: string; points: number; created_at: string }[];
}

async function getClassTest(id: Uuid): Promise<ClassTestDetail> {
  const sb = client();
  const { teacherId } = await me();
  const ct = await classTestRow(id);
  const [q, editable] = await Promise.all([
    sb
      .from("test_questions")
      .select("id, number, question_type, question_text, max_points, key_answer, question_criteria(id, description, points, created_at)")
      .eq("test_id", ct.test_id)
      .order("number"),
    canManage(ct, teacherId),
  ]);
  if (q.error) fail(q.error, READ_DENIED);
  const questions = ((q.data ?? []) as QuestionRow[]).map((row) => ({
    id: row.id,
    number: row.number,
    question_type: row.question_type,
    question_text: row.question_text,
    key_answer: row.key_answer,
    max_points: row.max_points,
    criteria: [...row.question_criteria]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((c) => ({ id: c.id, description: c.description, points: c.points })),
  }));
  return {
    id: ct.id,
    test_id: ct.test_id,
    can_edit_rubric: editable,
    class_id: ct.class_id,
    class_name: ct.classes?.name ?? "",
    class_code: ct.classes?.code ?? "",
    test_name: ct.tests?.name ?? "Ujian",
    status: ct.status,
    max_score: ct.tests?.max_score ?? 0,
    test_date: ct.test_date,
    published_at: ct.published_at,
    // The tables keep no edit time, so the rubric only reports whether it is saved.
    rubric_updated_at: null,
    questions,
  };
}

/** Exam header with the class name and question count, which the progress endpoint lacks. */
async function getClassTestHeader(id: Uuid): Promise<ClassTestHeader> {
  const ct = await classTestRow(id);
  const q = await client().from("test_questions").select("id", { count: "exact", head: true }).eq("test_id", ct.test_id);
  if (q.error) fail(q.error, READ_DENIED);
  return {
    id: ct.id,
    class_id: ct.class_id,
    class_name: ct.classes?.name ?? null,
    test_name: ct.tests?.name ?? "Ujian",
    status: ct.status,
    max_score: ct.tests?.max_score ?? null,
    published_at: ct.published_at,
    questions_count: q.count ?? 0,
  };
}

/* ---------- writing ---------- */

async function createClassTest(classId: Uuid, input: NewExamInput): Promise<ClassTestSummary> {
  const sb = client();
  const { teacherId } = await me();
  const test = await sb
    .from("tests")
    .insert({ subject_id: input.subject_id, maker_id: teacherId, name: input.test_name.trim(), test_type: input.test_type, status: "draft" })
    .select("id, name, max_score")
    .single();
  if (test.error) fail(test.error, "Akun Anda tidak bisa membuat ujian untuk mata kuliah ini.");

  const ct = await sb
    .from("class_tests")
    .insert({ class_id: classId, test_id: test.data.id, test_date: input.test_date, status: "scheduled", corrector_id: teacherId })
    .select("id, status, test_date")
    .single();
  if (ct.error) {
    // Leave no orphan exam behind when the class refuses it.
    await sb.from("tests").delete().eq("id", test.data.id);
    fail(ct.error, "Hanya dosen pengampu kelas ini yang bisa menambah ujian.");
  }
  return {
    id: ct.data.id,
    class_id: classId,
    test_name: test.data.name,
    status: ct.data.status,
    max_score: test.data.max_score ?? 0,
    test_date: ct.data.test_date,
    published_at: null,
    questions_count: 0,
    sheets_total: 0,
    sheets_graded: 0,
    sheets_published: 0,
    needs_review: 0,
    needs_attention: 0,
  };
}

const RUBRIC_DENIED = "Hanya pembuat ujian atau koordinator mata kuliah yang bisa mengubah rubrik ini.";

/** Every write that RLS filtered out returns no row; treat that as a refusal, not a success. */
async function expectRow(q: PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }>) {
  const r = await q;
  if (r.error) fail(r.error, RUBRIC_DENIED);
  if (!r.data || r.data.length === 0) throw new ApiError(403, "FORBIDDEN", RUBRIC_DENIED);
}

/**
 * Saves the rubric in place, keeping question and criterion ids, because graded answers point at
 * them (test_answers.question_id cascades on delete; criteria_result stores criterion ids).
 * Not one transaction: a failure part way leaves what was already written, and the screen reloads.
 */
async function saveRubric(id: Uuid, input: QuestionInput[]): Promise<ClassTestDetail> {
  const sb = client();
  const { teacherId } = await me();
  const ct = await classTestRow(id);
  if (!(await canManage(ct, teacherId))) throw new ApiError(403, "FORBIDDEN", RUBRIC_DENIED);
  for (const q of input) {
    if (!Number.isInteger(q.max_points) || q.criteria.some((c) => !Number.isInteger(c.points))) {
      throw new ApiError(422, "VALIDATION_ERROR", "Poin harus bilangan bulat.");
    }
  }

  const current = await sb.from("test_questions").select("id, question_criteria(id)").eq("test_id", ct.test_id);
  if (current.error) fail(current.error, READ_DENIED);
  const existing = (current.data ?? []) as { id: Uuid; question_criteria: { id: Uuid }[] }[];

  try {
    await writeRubric(sb, ct.test_id, existing, input);
  } catch (err) {
    // Some rows may already be written; the screen must reload before saving again.
    if (err instanceof ApiError) throw new ApiError(err.status, PARTIAL_WRITE, err.message, err.details);
    throw err;
  }
  return getClassTest(id);
}

async function writeRubric(
  sb: SupabaseClient,
  testId: Uuid,
  existing: { id: Uuid; question_criteria: { id: Uuid }[] }[],
  input: QuestionInput[],
) {
  const keep = new Set(input.map((q) => q.id).filter(Boolean));

  const removed = existing.filter((q) => !keep.has(q.id)).map((q) => q.id);
  if (removed.length) await expectRow(sb.from("test_questions").delete().in("id", removed).select("id"));

  // test_questions has UNIQUE (test_id, number): park kept questions on negative numbers first.
  const kept = existing.filter((q) => keep.has(q.id));
  await Promise.all(kept.map((q, i) => expectRow(sb.from("test_questions").update({ number: -1 - i }).eq("id", q.id).select("id"))));

  await Promise.all(
    input.map(async (q, i) => {
      const fields = {
        number: i + 1,
        question_type: q.question_type,
        question_text: q.question_text.trim(),
        key_answer: q.key_answer.trim(),
        max_points: q.max_points,
      };
      let questionId = q.id;
      if (questionId) {
        await expectRow(sb.from("test_questions").update(fields).eq("id", questionId).select("id"));
      } else {
        const ins = await sb.from("test_questions").insert({ ...fields, test_id: testId }).select("id").single();
        if (ins.error) fail(ins.error, RUBRIC_DENIED);
        questionId = ins.data.id as Uuid;
      }

      const had = existing.find((x) => x.id === questionId)?.question_criteria.map((c) => c.id) ?? [];
      const still = new Set(q.criteria.map((c) => c.id).filter(Boolean));
      const gone = had.filter((cid) => !still.has(cid));
      if (gone.length) await expectRow(sb.from("question_criteria").delete().in("id", gone).select("id"));
      // Sequential, so created_at keeps the order the lecturer typed new criteria in.
      for (const c of q.criteria) {
        const row = { description: c.description.trim(), points: c.points };
        if (c.id) await expectRow(sb.from("question_criteria").update(row).eq("id", c.id).select("id"));
        else await expectRow(sb.from("question_criteria").insert({ ...row, question_id: questionId }).select("id"));
      }
    }),
  );

  const total = input.reduce((a, q) => a + q.max_points, 0);
  await expectRow(sb.from("tests").update({ max_score: total, status: "ready" }).eq("id", testId).select("id"));
}

const ROSTER_DENIED = "Hanya dosen pengampu kelas ini yang bisa mengubah daftar mahasiswanya.";

async function addStudents(classId: Uuid, nims: string[]): Promise<AddStudentsOut> {
  const sb = client();
  const wanted = [...new Set(nims.map((n) => n.trim()).filter(Boolean))];
  const found = await sb.from("students").select("id, nim").in("nim", wanted);
  if (found.error) fail(found.error, READ_DENIED);
  const byNim = new Map(((found.data ?? []) as { id: Uuid; nim: string }[]).map((s) => [s.nim, s.id]));
  const enrolled = await sb.from("student_classes").select("student_id").eq("class_id", classId);
  if (enrolled.error) fail(enrolled.error, ROSTER_DENIED);
  const already = new Set(((enrolled.data ?? []) as { student_id: Uuid }[]).map((r) => r.student_id));

  const fresh = wanted.filter((n) => byNim.has(n) && !already.has(byNim.get(n)!));
  if (fresh.length) {
    const ins = await sb.from("student_classes").insert(fresh.map((n) => ({ class_id: classId, student_id: byNim.get(n)! })));
    if (ins.error) fail(ins.error, ROSTER_DENIED);
  }
  return {
    added: fresh.length,
    already: wanted.filter((n) => byNim.has(n) && already.has(byNim.get(n)!)).length,
    unknown: wanted.filter((n) => !byNim.has(n)),
  };
}

async function removeStudent(classId: Uuid, studentId: Uuid): Promise<void> {
  const r = await client().from("student_classes").delete().eq("class_id", classId).eq("student_id", studentId).select("id");
  if (r.error) fail(r.error, ROSTER_DENIED);
  if (!r.data || r.data.length === 0) throw new ApiError(403, "FORBIDDEN", ROSTER_DENIED);
}

export const db = {
  listClasses,
  getClass,
  listSubjects,
  getClassTest,
  getClassTestHeader,
  createClassTest,
  saveRubric,
  addStudents,
  removeStudent,
};
