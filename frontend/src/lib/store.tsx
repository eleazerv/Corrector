"use client";

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import { initialData } from "./sample-data";
import { aiScore } from "./grading";
import type {
  AppData,
  ClassRoom,
  ComplaintStatus,
  Exam,
  FileStatus,
  Question,
  StudentViewSettings,
  Submission,
} from "./types";

export type Action =
  | { type: "createClass"; classRoom: ClassRoom }
  | { type: "addStudents"; classId: string; students: { nim: string; name: string }[] }
  | { type: "createExam"; exam: Exam }
  | { type: "saveQuestions"; examId: string; questions: Question[] }
  | { type: "addSubmissions"; submissions: Submission[] }
  | { type: "mapSubmission"; submissionId: string; studentId: string | null }
  | { type: "setSubmission"; submissionId: string; patch: Partial<Submission> }
  | { type: "setStage"; examId: string; stage: Exam["stage"] }
  | {
      type: "override";
      submissionId: string;
      questionId: string;
      criterionScores: Record<string, number>;
      reason: string;
      remember: boolean;
    }
  | { type: "cancelOverride"; submissionId: string; questionId: string }
  | { type: "approve"; submissionId: string; questionId: string }
  | { type: "setStudentView"; examId: string; settings: StudentViewSettings }
  | { type: "publish"; examId: string; submissionIds: string[] }
  | {
      type: "submitComplaint";
      id: string;
      examId: string;
      questionId: string;
      reason: string;
      attachmentName?: string;
    }
  | {
      type: "decideComplaint";
      complaintId: string;
      status: ComplaintStatus;
      note: string;
      newScore?: number;
    }
  | { type: "toggleMemory"; id: string }
  | { type: "deleteMemory"; id: string };

let seq = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const now = () => new Date().toISOString();

function log(state: AppData, action: string, detail: string): AppData["audit"] {
  return [{ id: uid("a"), at: now(), actor: state.lecturer.name, action, detail }, ...state.audit];
}

function mapSub(state: AppData, id: string, fn: (s: Submission) => Submission) {
  return state.submissions.map((s) => (s.id === id ? fn(s) : s));
}

/** Once every flagged grade is approved or overridden, the file leaves "Perlu Review". */
function settleStatus(sub: Submission): FileStatus {
  if (sub.status !== "review_required") return sub.status;
  const open = sub.grades.some((g) => g.reviewRequired && !g.override && !g.approved);
  return open ? "review_required" : "graded";
}

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case "createClass":
      return {
        ...state,
        classes: [...state.classes, action.classRoom],
        audit: log(state, "Membuat kelas", action.classRoom.name),
      };

    case "addStudents": {
      const students = [...state.students];
      const ids: string[] = [];
      for (const s of action.students) {
        const existing = students.find((x) => x.nim === s.nim);
        if (existing) {
          ids.push(existing.id);
        } else {
          const id = uid("s");
          students.push({ id, nim: s.nim, name: s.name });
          ids.push(id);
        }
      }
      return {
        ...state,
        students,
        classes: state.classes.map((c) =>
          c.id === action.classId
            ? { ...c, studentIds: [...c.studentIds, ...ids.filter((id) => !c.studentIds.includes(id))] }
            : c,
        ),
        audit: log(state, "Menambahkan mahasiswa", `${action.students.length} mahasiswa`),
      };
    }

    case "createExam":
      return { ...state, exams: [...state.exams, action.exam], audit: log(state, "Membuat ujian", action.exam.title) };

    case "saveQuestions":
      return {
        ...state,
        exams: state.exams.map((e) =>
          e.id === action.examId
            ? { ...e, questions: action.questions, rubricVersion: e.rubricVersion + 1, rubricUpdatedAt: now() }
            : e,
        ),
        audit: log(state, "Menyimpan rubrik", action.examId),
      };

    case "addSubmissions":
      return { ...state, submissions: [...state.submissions, ...action.submissions] };

    case "mapSubmission":
      return {
        ...state,
        submissions: mapSub(state, action.submissionId, (s) => ({ ...s, studentId: action.studentId })),
        audit: log(state, "Memetakan jawaban", action.submissionId),
      };

    case "setSubmission":
      return { ...state, submissions: mapSub(state, action.submissionId, (s) => ({ ...s, ...action.patch })) };

    case "setStage":
      return { ...state, exams: state.exams.map((e) => (e.id === action.examId ? { ...e, stage: action.stage } : e)) };

    case "override": {
      const sub = state.submissions.find((s) => s.id === action.submissionId);
      const exam = state.exams.find((e) => e.id === sub?.examId);
      const question = exam?.questions.find((q) => q.id === action.questionId);
      const grade = sub?.grades.find((g) => g.questionId === action.questionId);
      if (!sub || !exam || !question || !grade) return state;

      const memory = [...state.memory];
      if (action.remember) {
        for (const c of question.criteria) {
          const before = grade.aiCriterionScores[c.id];
          const after = action.criterionScores[c.id];
          if (before !== after) {
            memory.unshift({
              id: uid("m"),
              examId: exam.id,
              questionId: question.id,
              criterionName: c.name,
              aiScore: before,
              lecturerScore: after,
              max: c.max,
              reason: action.reason,
              rubricVersion: exam.rubricVersion,
              active: true,
            });
          }
        }
      }
      const newTotal = Object.values(action.criterionScores).reduce((a, b) => a + b, 0);
      return {
        ...state,
        memory,
        submissions: mapSub(state, sub.id, (s) => {
          const next = {
            ...s,
            grades: s.grades.map((g) =>
              g.questionId === action.questionId
                ? {
                    ...g,
                    approved: undefined,
                    override: { criterionScores: action.criterionScores, reason: action.reason, by: state.lecturer.name, at: now() },
                  }
                : g,
            ),
          };
          return { ...next, status: settleStatus(next) };
        }),
        audit: log(
          state,
          "Mengubah nilai",
          `Soal ${question.number}: ${aiScore(grade)} menjadi ${newTotal}. Alasan: ${action.reason}`,
        ),
      };
    }

    case "cancelOverride":
      return {
        ...state,
        submissions: mapSub(state, action.submissionId, (s) => {
          const next = {
            ...s,
            grades: s.grades.map((g) => (g.questionId === action.questionId ? { ...g, override: undefined } : g)),
          };
          const reopen = next.grades.some((g) => g.reviewRequired && !g.override && !g.approved);
          return { ...next, status: reopen && s.status === "graded" ? "review_required" : s.status };
        }),
        audit: log(state, "Membatalkan perubahan nilai", action.submissionId),
      };

    case "approve":
      return {
        ...state,
        submissions: mapSub(state, action.submissionId, (s) => {
          const next = {
            ...s,
            grades: s.grades.map((g) =>
              g.questionId === action.questionId ? { ...g, approved: { by: state.lecturer.name, at: now() } } : g,
            ),
          };
          return { ...next, status: settleStatus(next) };
        }),
        audit: log(state, "Menyetujui saran AI", action.submissionId),
      };

    case "setStudentView":
      return {
        ...state,
        exams: state.exams.map((e) => (e.id === action.examId ? { ...e, studentView: action.settings } : e)),
      };

    case "publish": {
      const at = now();
      return {
        ...state,
        exams: state.exams.map((e) =>
          e.id === action.examId
            ? {
                ...e,
                stage: "publish",
                publishedAt: e.publishedAt ?? at,
                complaintDeadline: e.complaintDeadline ?? new Date(Date.now() + 7 * 86400000).toISOString(),
              }
            : e,
        ),
        submissions: state.submissions.map((s) =>
          action.submissionIds.includes(s.id) ? { ...s, status: "published", publishedAt: at } : s,
        ),
        audit: log(state, "Mempublikasikan nilai", `${action.submissionIds.length} mahasiswa`),
      };
    }

    case "submitComplaint":
      return {
        ...state,
        complaints: [
          {
            id: action.id,
            examId: action.examId,
            studentId: state.currentStudentId,
            questionId: action.questionId,
            reason: action.reason,
            attachmentName: action.attachmentName,
            status: "baru",
            createdAt: now(),
            aiSummary:
              "Ringkasan belum tersedia: di prototipe ini ringkasan AI hanya ada untuk keberatan contoh. Baca keberatan asli di sebelah kanan.",
          },
          ...state.complaints,
        ],
      };

    case "decideComplaint": {
      const complaint = state.complaints.find((c) => c.id === action.complaintId);
      if (!complaint) return state;
      let submissions = state.submissions;
      if (action.status === "selesai" && action.newScore !== undefined) {
        const exam = state.exams.find((e) => e.id === complaint.examId);
        const question = exam?.questions.find((q) => q.id === complaint.questionId);
        const sub = state.submissions.find(
          (s) => s.examId === complaint.examId && s.studentId === complaint.studentId,
        );
        if (question && sub) {
          // Distribute the accepted total across criteria, filling each up to its max in order.
          let remaining = action.newScore;
          const scores: Record<string, number> = {};
          for (const c of question.criteria) {
            const v = Math.min(c.max, Math.max(0, remaining));
            scores[c.id] = v;
            remaining -= v;
          }
          submissions = mapSub(state, sub.id, (s) => ({
            ...s,
            grades: s.grades.map((g) =>
              g.questionId === question.id
                ? { ...g, override: { criterionScores: scores, reason: action.note, by: state.lecturer.name, at: now() } }
                : g,
            ),
          }));
        }
      }
      return {
        ...state,
        submissions,
        complaints: state.complaints.map((c) =>
          c.id === action.complaintId ? { ...c, status: action.status, decisionNote: action.note, decidedAt: now() } : c,
        ),
        audit: log(state, "Memutuskan keberatan", `${action.complaintId}: ${action.status}. ${action.note}`),
      };
    }

    case "toggleMemory":
      return { ...state, memory: state.memory.map((m) => (m.id === action.id ? { ...m, active: !m.active } : m)) };

    case "deleteMemory":
      return {
        ...state,
        memory: state.memory.filter((m) => m.id !== action.id),
        audit: log(state, "Menghapus catatan penilaian", action.id),
      };
  }
}

const DataContext = createContext<{ data: AppData; dispatch: Dispatch<Action> } | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, initialData);
  return <DataContext.Provider value={{ data, dispatch }}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
}

export { uid };
