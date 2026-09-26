"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { useData } from "@/lib/store";
import { formatDateLong } from "@/lib/grading";
import { ComplaintBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/panels";
import { GradeSheet } from "./grade-sheet";

export function usePublishedResult(examId: string) {
  const { data } = useData();
  const exam = data.exams.find((e) => e.id === examId);
  const sub = data.submissions.find(
    (s) => s.examId === examId && s.studentId === data.currentStudentId && s.status === "published",
  );
  const cls = exam && data.classes.find((c) => c.id === exam.classId);
  return exam && sub && cls ? { exam, sub, cls } : null;
}

export function deadlinePassed(deadline?: string) {
  return Boolean(deadline && Date.now() > new Date(deadline).getTime());
}

export function StudentGrade({ examId }: { examId: string }) {
  const { data } = useData();
  const result = usePublishedResult(examId);

  if (!result) {
    return (
      <EmptyState icon={FileText} title="Nilai ini belum tersedia." action={<ButtonLink href="/mahasiswa">Kembali ke Nilai Saya</ButtonLink>}>
        Nilai hanya bisa dilihat setelah dosen mempublikasikannya.
      </EmptyState>
    );
  }
  const { exam, sub, cls } = result;
  const complaints = data.complaints.filter((c) => c.examId === exam.id && c.studentId === data.currentStudentId);
  const closed = deadlinePassed(exam.complaintDeadline);

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-4 text-small">
        <Link href="/mahasiswa" className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline">
          Nilai Saya
        </Link>
        <span className="mx-2 text-text-muted">/</span>
        <span className="text-text-muted">{exam.title}</span>
      </nav>
      <GradeSheet
        exam={exam}
        cls={cls}
        submission={sub}
        footer={
          <div className="space-y-4">
            {complaints.length > 0 && (
              <div>
                <p className="font-semibold">Keberatan Anda untuk ujian ini</p>
                <ul className="mt-2 space-y-2">
                  {complaints.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2">
                      <span>Soal {exam.questions.find((q) => q.id === c.questionId)?.number}</span>
                      <ComplaintBadge status={c.status} />
                      <Link href="/mahasiswa/keberatan" className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline">
                        Lihat detail
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {closed ? (
              <p className="text-text-muted">
                Batas pengajuan keberatan sudah lewat ({formatDateLong(exam.complaintDeadline!)}).
              </p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {exam.complaintDeadline && (
                  <p className="text-small text-text-muted">Batas pengajuan: {formatDateLong(exam.complaintDeadline)}</p>
                )}
                <ButtonLink href={`/mahasiswa/nilai/${exam.id}/keberatan`} className="w-full sm:w-auto">
                  Ajukan Keberatan Nilai
                </ButtonLink>
              </div>
            )}
          </div>
        }
      />
    </div>
  );
}
