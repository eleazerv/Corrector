"use client";

import Link from "next/link";
import { MessageSquareWarning } from "lucide-react";
import { useData } from "@/lib/store";
import { formatDateLong } from "@/lib/grading";
import { ComplaintBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/panels";

export default function KeberatanSaya() {
  const { data } = useData();
  const mine = data.complaints.filter((c) => c.studentId === data.currentStudentId);

  return (
    <div>
      <h1 className="doc-rule mb-6 pb-4 text-h1">Keberatan Saya</h1>
      {mine.length === 0 ? (
        <EmptyState icon={MessageSquareWarning} title="Anda belum mengajukan keberatan.">
          Buka salah satu nilai di halaman Nilai Saya untuk mengajukan keberatan sebelum batas waktunya.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {mine.map((c) => {
            const exam = data.exams.find((e) => e.id === c.examId)!;
            const q = exam.questions.find((x) => x.id === c.questionId);
            return (
              <li key={c.id} className="rounded-md border border-border bg-surface px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/mahasiswa/nilai/${exam.id}`}
                      className="text-h3 font-bold text-primary underline-offset-4 hover:underline"
                    >
                      {exam.title}, Soal {q?.number}
                    </Link>
                    <p className="text-small text-text-muted">Diajukan {formatDateLong(c.createdAt)}</p>
                  </div>
                  <ComplaintBadge status={c.status} />
                </div>
                <p className="mt-3 font-semibold">Alasan Anda</p>
                <p className="max-w-[68ch]">{c.reason}</p>
                {c.decisionNote && c.status !== "baru" && (
                  <div className="mt-3 rounded-md bg-primary-soft px-4 py-3">
                    <p className="font-semibold">Catatan dosen</p>
                    <p>{c.decisionNote}</p>
                  </div>
                )}
                {c.status === "baru" && <p className="mt-3 text-text-muted">Menunggu dibaca dosen. Nilai tidak berubah sampai ada keputusan.</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
