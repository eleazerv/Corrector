/**
 * Single entry point for data. Each method goes to the real backend or to the in-browser
 * mock, decided by:
 *
 *   - MODE "demo" (no Supabase keys): always the mock.
 *   - MODE "live": the backend when ENDPOINTS[x].live is true and the id is a real one.
 *     Demo records (ids starting with "demo-") keep using the mock so the full flow can
 *     still be tried. A real record that needs a missing endpoint fails with
 *     NotAvailableError, which the screens render as an explicit "not connected" state.
 *
 * The classroom and test modules exist on backend-1 but are not registered in main.py. Until they
 * are, classes, exams, rubric and roster go straight to the Supabase tables (./db.ts, entries whose
 * route starts with "supabase:"). When the routers are registered, move those calls to ./live.ts.
 * Creating a class stays unavailable: in the database only a school admin may do it.
 */
import { MODE } from "@/lib/config";
import { db } from "./db";
import { NotAvailableError } from "./errors";
import { live, type StreamState } from "./live";
import { mock } from "./mock/server";
import type {
  ClassTestEvent,
  ClassTestHeader,
  ComplaintIn,
  ComplaintStatus,
  NewExamInput,
  OverrideInput,
  QuestionInput,
  ResolveInput,
  Role,
  TraitPatch,
  Uuid,
} from "./types";

export const ENDPOINTS = {
  listClasses: { route: "supabase: classes", live: true, feature: "Daftar kelas" },
  getClass: { route: "supabase: classes, student_classes", live: true, feature: "Detail kelas" },
  createClass: { route: "admin sekolah", live: false, feature: "Membuat kelas" },
  listSubjects: { route: "supabase: subjects", live: true, feature: "Daftar mata kuliah" },
  addStudents: { route: "supabase: student_classes", live: true, feature: "Menambah mahasiswa" },
  removeStudent: { route: "supabase: student_classes", live: true, feature: "Mengeluarkan mahasiswa" },
  createClassTest: { route: "supabase: tests, class_tests", live: true, feature: "Membuat ujian" },
  getClassTest: { route: "supabase: test_questions, question_criteria", live: true, feature: "Rubrik ujian" },
  saveRubric: { route: "supabase: test_questions, question_criteria", live: true, feature: "Menyimpan rubrik" },

  uploadPages: { route: "POST /api/v1/class-tests/{id}/uploads", live: true, feature: "Unggah foto per mahasiswa" },
  uploadZip: { route: "POST /api/v1/class-tests/{id}/zip", live: true, feature: "Unggah ZIP satu kelas" },
  reuploadPage: { route: "POST /api/v1/student-tests/{id}/pages/{page_no}/reupload", live: true, feature: "Unggah ulang halaman" },
  getProgress: { route: "GET /api/v1/class-tests/{id}/progress", live: true, feature: "Progres penilaian" },
  subscribe: { route: "GET /api/v1/class-tests/{id}/events", live: true, feature: "Pembaruan langsung" },

  getStudentTest: { route: "GET /api/v1/student-tests/{id}", live: true, feature: "Lembar jawaban" },
  approveSheet: { route: "POST /api/v1/student-tests/{id}/approve", live: true, feature: "Menandai lembar diperiksa" },
  overrideAnswer: { route: "POST /api/v1/test-answers/{id}/override", live: true, feature: "Mengubah nilai" },
  regradeSheet: { route: "POST /api/v1/student-tests/{id}/regrade", live: true, feature: "Menilai ulang" },
  retryFailed: { route: "POST /api/v1/class-tests/{id}/grade", live: true, feature: "Menilai ulang lembar gagal" },
  gradingRuns: { route: "GET /api/v1/class-tests/{id}/grading-runs", live: true, feature: "Riwayat penilaian AI" },
  publish: { route: "POST /api/v1/class-tests/{id}/publish", live: true, feature: "Publikasi nilai" },
  exportCsv: { route: "GET /api/v1/class-tests/{id}/export.csv", live: true, feature: "Unduh nilai" },

  listComplaints: { route: "GET /api/v1/complaints", live: true, feature: "Kotak keberatan" },
  resolveComplaint: { route: "POST /api/v1/complaints/{id}/resolve", live: true, feature: "Memutuskan keberatan" },

  listTraits: { route: "GET /api/v1/traits", live: true, feature: "Catatan penilaian" },
  patchTrait: { route: "PATCH /api/v1/traits/{id}", live: true, feature: "Mengubah catatan" },
  traitEvidences: { route: "GET /api/v1/traits/{id}/evidences", live: true, feature: "Dasar catatan" },

  calibrationSample: { route: "GET /api/v1/class-tests/{id}/calibration", live: true, feature: "Kalibrasi" },
  saveCalibration: { route: "POST /api/v1/class-tests/{id}/calibration", live: true, feature: "Menyimpan nilai kalibrasi" },
  calibrationResult: { route: "GET /api/v1/class-tests/{id}/calibration/result", live: true, feature: "Hasil kalibrasi" },

  myTests: { route: "GET /api/v1/me/tests", live: true, feature: "Daftar nilai mahasiswa" },
  myTest: { route: "GET /api/v1/me/tests/{id}", live: true, feature: "Rincian nilai mahasiswa" },
  submitComplaint: { route: "POST /api/v1/me/tests/{id}/complaints", live: true, feature: "Mengajukan keberatan" },
  myComplaints: { route: "GET /api/v1/me/complaints", live: true, feature: "Status keberatan mahasiswa" },
} as const;

export type EndpointName = keyof typeof ENDPOINTS;

export const isDemoId = (id: string) => id.startsWith("demo-");

/** True when this data comes from the mock even though the app runs live. */
export function servedByMock(name: EndpointName, id?: string) {
  if (MODE === "demo") return true;
  if (id !== undefined && isDemoId(id)) return true;
  return !ENDPOINTS[name].live;
}

function unavailable(name: EndpointName): Promise<never> {
  const e = ENDPOINTS[name];
  return Promise.reject(new NotAvailableError(e.route, e.feature));
}

/** Endpoint keyed by a record id: real ids go to the server, demo ids to the mock. */
function byId<T>(name: EndpointName, id: string, real: () => Promise<T>, demo: () => Promise<T>): Promise<T> {
  if (!servedByMock(name, id)) return real();
  if (MODE === "live" && !isDemoId(id)) return unavailable(name);
  return demo();
}

/** List without an id: the server in live mode, the mock in demo mode. */
function list<T>(real: () => Promise<T>, demo: () => Promise<T>): Promise<T> {
  return MODE === "live" ? real() : demo();
}

export const api = {
  demoMe: (role: Role) => mock.me(role),

  /* classes, exams, rubric and roster: Supabase tables in live mode (see ./db.ts) */

  listClasses: () => list(() => db.listClasses(), () => mock.listClasses()),
  getClass: (id: Uuid) => byId("getClass", id, () => db.getClass(id), () => mock.getClass(id)),
  createClass: (input: { name: string; code: string; description: string | null }) =>
    MODE === "live" ? unavailable("createClass") : mock.createClass(input),
  listSubjects: () => list(() => db.listSubjects(), () => mock.listSubjects()),
  addStudents: (classId: Uuid, nims: string[]) =>
    byId("addStudents", classId, () => db.addStudents(classId, nims), () => mock.addStudents(classId, nims)),
  removeStudent: (classId: Uuid, studentId: Uuid) =>
    byId("removeStudent", classId, () => db.removeStudent(classId, studentId), () => mock.removeStudent(classId, studentId)),
  createClassTest: (classId: Uuid, input: NewExamInput) =>
    byId("createClassTest", classId, () => db.createClassTest(classId, input), () => mock.createClassTest(classId, input)),
  getClassTest: (id: Uuid) => byId("getClassTest", id, () => db.getClassTest(id), () => mock.getClassTest(id)),
  saveRubric: (id: Uuid, questions: QuestionInput[]) =>
    byId("saveRubric", id, () => db.saveRubric(id, questions), () => mock.saveRubric(id, questions)),

  /**
   * Exam header for every exam screen. Real exams read it from the tables; if that read is refused
   * (a corrector without access to the class, say), the progress endpoint still names the exam.
   */
  getClassTestHeader: (id: Uuid): Promise<ClassTestHeader> =>
    byId(
      "getClassTest",
      id,
      () =>
        db.getClassTestHeader(id).catch(async () => {
          const p = await live.getProgress(id);
          return {
            id,
            class_id: null,
            class_name: null,
            test_name: p.test_name,
            status: p.class_test_status,
            max_score: p.max_score,
            published_at: p.published_at,
            questions_count: null,
          };
        }),
      () => mock.getClassTestHeader(id),
    ),

  /* submission */

  getProgress: (id: Uuid) => byId("getProgress", id, () => live.getProgress(id), () => mock.getProgress(id)),
  uploadPages: (id: Uuid, who: { student_id?: Uuid; nim?: string }, files: File[]) =>
    byId("uploadPages", id, () => live.uploadPages(id, who, files), () => mock.uploadPages(id, who, files)),
  uploadZip: (id: Uuid, file: File) => byId("uploadZip", id, () => live.uploadZip(id, file), () => mock.uploadZip(id, file)),
  reuploadPage: (studentTestId: Uuid, pageNo: number, file: File) =>
    byId(
      "reuploadPage",
      studentTestId,
      () => live.reuploadPage(studentTestId, pageNo, file),
      () => mock.reuploadPage(studentTestId, pageNo, file),
    ),
  subscribe: (id: Uuid, onEvent: (e: ClassTestEvent) => void, onState: (s: StreamState) => void) =>
    servedByMock("subscribe", id) ? mock.subscribe(id, onEvent, onState) : live.subscribe(id, onEvent, onState),

  /* review */

  getStudentTest: (id: Uuid) => byId("getStudentTest", id, () => live.getStudentTest(id), () => mock.getStudentTest(id)),
  approveSheet: (id: Uuid) => byId("approveSheet", id, () => live.approveSheet(id), () => mock.approveSheet(id)),
  overrideAnswer: (answerId: Uuid, input: OverrideInput) =>
    byId("overrideAnswer", answerId, () => live.overrideAnswer(answerId, input), () => mock.overrideAnswer(answerId, input)),
  regradeSheet: (id: Uuid, questionIds?: Uuid[]) =>
    byId("regradeSheet", id, () => live.regradeSheet(id, questionIds), () => mock.regradeSheet(id, questionIds)),
  retryFailed: (classTestId: Uuid, includeQuota: boolean) =>
    byId(
      "retryFailed",
      classTestId,
      () => live.retryFailed(classTestId, includeQuota),
      () => mock.retryFailed(classTestId, includeQuota),
    ),
  gradingRuns: (classTestId: Uuid) =>
    byId("gradingRuns", classTestId, () => live.gradingRuns(classTestId), () => mock.gradingRuns(classTestId)),

  /* publish */

  publish: (classTestId: Uuid, allowNeedsReview: boolean) =>
    byId(
      "publish",
      classTestId,
      () => live.publish(classTestId, allowNeedsReview),
      () => mock.publish(classTestId, allowNeedsReview),
    ),
  exportCsv: (classTestId: Uuid, fallbackName: string) =>
    byId(
      "exportCsv",
      classTestId,
      () => live.exportCsv(classTestId, fallbackName),
      () => mock.exportCsv(classTestId, fallbackName),
    ),

  /* complaints, lecturer side */

  listComplaints: (status: ComplaintStatus) => list(() => live.listComplaints(status), () => mock.listComplaints(status)),
  resolveComplaint: (id: Uuid, input: ResolveInput) =>
    byId("resolveComplaint", id, () => live.resolveComplaint(id, input), () => mock.resolveComplaint(id, input)),

  /* grading notes */

  listTraits: () => list(() => live.listTraits(), () => mock.listTraits()),
  patchTrait: (id: Uuid, patch: TraitPatch) => byId("patchTrait", id, () => live.patchTrait(id, patch), () => mock.patchTrait(id, patch)),
  traitEvidences: (id: Uuid) => byId("traitEvidences", id, () => live.traitEvidences(id), () => mock.traitEvidences(id)),

  /* blind calibration */

  calibrationSample: (classTestId: Uuid, n: number) =>
    byId(
      "calibrationSample",
      classTestId,
      () => live.calibrationSample(classTestId, n),
      () => mock.calibrationSample(classTestId, n),
    ),
  saveCalibration: (classTestId: Uuid, testAnswerId: Uuid, grade: number) =>
    byId(
      "saveCalibration",
      classTestId,
      () => live.saveCalibration(classTestId, testAnswerId, grade),
      () => mock.saveCalibration(classTestId, testAnswerId, grade),
    ),
  calibrationResult: (classTestId: Uuid) =>
    byId(
      "calibrationResult",
      classTestId,
      () => live.calibrationResult(classTestId),
      () => mock.calibrationResult(classTestId),
    ),

  /* student side: no demo fallback in live mode, so a student never sees sample grades as theirs */

  myTests: () => list(() => live.myTests(), () => mock.myTests()),
  myTest: (id: Uuid) => byId("myTest", id, () => live.myTest(id), () => mock.myTest(id)),
  submitComplaint: (id: Uuid, input: ComplaintIn) =>
    byId("submitComplaint", id, () => live.submitComplaint(id, input), () => mock.submitComplaint(id, input)),
  myComplaints: () => list(() => live.myComplaints(), () => mock.myComplaints()),
};

export { ApiError, NotAvailableError, PARTIAL_WRITE, errorMessage } from "./errors";
export type { StreamState } from "./live";
