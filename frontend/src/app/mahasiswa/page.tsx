"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { useData } from "@/lib/store";
import { examMax, formatDateLong, scoreText, submissionFinalTotal } from "@/lib/grading";
import { EmptyState } from "@/components/ui/panels";

export default function NilaiSaya() {
  const { data } = useData();
  const mine = data.submissions
    .filter((s) => s.studentId === data.currentStudentId && s.status === "published")
    .map((s) => {
      const exam = data.exams.find((e) => e.id === s.examId)!;
      return { s, exam, cls: data.classes.find((c) => c.id === exam.classId)! };
    });

  return (
    <div>
      <h1 className="doc-rule mb-6 pb-4 text-h1">Nilai Saya</h1>
      {mine.length === 0 ? (
        <EmptyState icon={FileText} title="Belum ada nilai yang dipublikasikan.">
          Nilai muncul di sini setelah dosen memeriksa dan mempublikasikannya. Anda juga akan menerima notifikasi.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {mine.map(({ s, exam, cls }) => (
            <li key={s.id}>
              <Link
                href={`/mahasiswa/nilai/${exam.id}`}
                className="flex items-center gap-4 rounded-md border border-border bg-surface px-4 py-4 hover:border-primary sm:px-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-h3 font-bold text-primary">{exam.title}</span>
                  <span className="block text-text-muted">{cls.name}</span>
                  <span className="block text-small text-text-muted">
                    Dipublikasikan {s.publishedAt ? formatDateLong(s.publishedAt) : ""}
                  </span>
                </span>
                <span className="tabular shrink-0 text-score-md font-bold">{scoreText(submissionFinalTotal(s), examMax(exam))}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
