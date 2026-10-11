/**
 * Calls to the FastAPI backend, one function per route registered in backend/main.py
 * (branch backend-1). Request and response shapes are in ./types.ts.
 */
import { API_URL } from "@/lib/config";
import { currentToken, request, requestFile, withQuery } from "./http";
import type {
  ApproveOut,
  CalibrationResult,
  CalibrationSample,
  ClassTestEvent,
  ComplaintIn,
  ComplaintList,
  ComplaintStatus,
  GradeClassOut,
  GradingRunsOut,
  MyComplaint,
  MyTest,
  MyTestDetail,
  OverrideInput,
  OverrideOut,
  ProgressOut,
  PublishOut,
  RegradeOut,
  ResolveInput,
  ResolveOut,
  ReuploadOut,
  StudentTestDetail,
  TeacherTrait,
  TraitEvidence,
  TraitPatch,
  UploadOut,
  Uuid,
  ZipOut,
} from "./types";

export type StreamState = "connecting" | "open" | "retrying";

const V1 = "/api/v1";

export const live = {
  /* submission */

  uploadPages(classTestId: Uuid, student: { student_id?: Uuid; nim?: string }, files: File[]) {
    const form = new FormData();
    for (const f of files) form.append("files", f, f.name);
    if (student.student_id) form.append("student_id", student.student_id);
    if (student.nim) form.append("nim", student.nim);
    return request<UploadOut>("POST", `${V1}/class-tests/${classTestId}/uploads`, form);
  },

  uploadZip(classTestId: Uuid, file: File) {
    const form = new FormData();
    form.append("file", file, file.name);
    return request<ZipOut>("POST", `${V1}/class-tests/${classTestId}/zip`, form);
  },

  reuploadPage(studentTestId: Uuid, pageNo: number, file: File) {
    const form = new FormData();
    form.append("file", file, file.name);
    return request<ReuploadOut>("POST", `${V1}/student-tests/${studentTestId}/pages/${pageNo}/reupload`, form);
  },

  getProgress(classTestId: Uuid) {
    return request<ProgressOut>("GET", `${V1}/class-tests/${classTestId}/progress`);
  },

  /** Server-Sent Events. EventSource cannot send headers, so the token rides in the query string. */
  subscribe(classTestId: Uuid, onEvent: (e: ClassTestEvent) => void, onState: (s: StreamState) => void) {
    let source: EventSource | null = null;
    let closed = false;

    currentToken().then((token) => {
      if (closed) return;
      const qs = token ? `?access_token=${encodeURIComponent(token)}` : "";
      source = new EventSource(`${API_URL}${V1}/class-tests/${classTestId}/events${qs}`);
      onState("connecting");
      source.onopen = () => onState("open");
      source.onerror = () => onState("retrying"); // EventSource reconnects on its own (retry: 5000)
      source.onmessage = (msg) => {
        try {
          onEvent(JSON.parse(msg.data) as ClassTestEvent);
        } catch {
          // ignore malformed frames
        }
      };
    });

    return () => {
      closed = true;
      source?.close();
    };
  },

  /* review */

  getStudentTest(studentTestId: Uuid) {
    return request<StudentTestDetail>("GET", withQuery(`${V1}/student-tests/${studentTestId}`, { include_ocr: true }));
  },

  approveSheet(studentTestId: Uuid) {
    return request<ApproveOut>("POST", `${V1}/student-tests/${studentTestId}/approve`);
  },

  overrideAnswer(testAnswerId: Uuid, input: OverrideInput) {
    return request<OverrideOut>("POST", `${V1}/test-answers/${testAnswerId}/override`, input);
  },

  regradeSheet(studentTestId: Uuid, questionIds?: Uuid[]) {
    return request<RegradeOut>(
      "POST",
      `${V1}/student-tests/${studentTestId}/regrade`,
      questionIds ? { question_ids: questionIds } : {},
    );
  },

  retryFailed(classTestId: Uuid, includeQuota: boolean) {
    return request<GradeClassOut>(
      "POST",
      withQuery(`${V1}/class-tests/${classTestId}/grade`, { include_quota_exceeded: includeQuota }),
    );
  },

  gradingRuns(classTestId: Uuid) {
    return request<GradingRunsOut>("GET", withQuery(`${V1}/class-tests/${classTestId}/grading-runs`, { limit: 200 }));
  },

  /* publish */

  publish(classTestId: Uuid, allowNeedsReview: boolean) {
    return request<PublishOut>(
      "POST",
      withQuery(`${V1}/class-tests/${classTestId}/publish`, { allow_needs_review: allowNeedsReview }),
    );
  },

  exportCsv(classTestId: Uuid, fallbackName: string) {
    return requestFile(`${V1}/class-tests/${classTestId}/export.csv`, fallbackName);
  },

  /* complaints, lecturer side */

  listComplaints(status: ComplaintStatus) {
    return request<ComplaintList>("GET", withQuery(`${V1}/complaints`, { status, limit: 500 }));
  },

  resolveComplaint(complaintId: Uuid, input: ResolveInput) {
    return request<ResolveOut>("POST", `${V1}/complaints/${complaintId}/resolve`, input);
  },

  /* grading notes */

  listTraits() {
    return request<{ items: TeacherTrait[] }>("GET", withQuery(`${V1}/traits`, { include_inactive: true }));
  },

  patchTrait(traitId: Uuid, patch: TraitPatch) {
    return request<TeacherTrait>("PATCH", `${V1}/traits/${traitId}`, patch);
  },

  traitEvidences(traitId: Uuid) {
    return request<{ items: TraitEvidence[] }>("GET", `${V1}/traits/${traitId}/evidences`);
  },

  /* blind calibration */

  calibrationSample(classTestId: Uuid, n: number) {
    return request<CalibrationSample>("GET", withQuery(`${V1}/class-tests/${classTestId}/calibration`, { n }));
  },

  saveCalibration(classTestId: Uuid, testAnswerId: Uuid, teacherGrade: number) {
    return request<{ test_answer_id: Uuid; teacher_grade: number }>(
      "POST",
      `${V1}/class-tests/${classTestId}/calibration`,
      { test_answer_id: testAnswerId, teacher_grade: teacherGrade },
    );
  },

  calibrationResult(classTestId: Uuid) {
    return request<CalibrationResult>("GET", `${V1}/class-tests/${classTestId}/calibration/result`);
  },

  /* student side */

  myTests() {
    return request<{ items: MyTest[] }>("GET", `${V1}/me/tests`);
  },

  myTest(studentTestId: Uuid) {
    return request<MyTestDetail>("GET", `${V1}/me/tests/${studentTestId}`);
  },

  submitComplaint(studentTestId: Uuid, input: ComplaintIn) {
    return request<{ id: Uuid; student_test_id: Uuid; test_answer_id: Uuid | null; complaint: string; status: ComplaintStatus }>(
      "POST",
      `${V1}/me/tests/${studentTestId}/complaints`,
      input,
    );
  },

  myComplaints() {
    return request<{ items: MyComplaint[] }>("GET", `${V1}/me/complaints`);
  },
};
