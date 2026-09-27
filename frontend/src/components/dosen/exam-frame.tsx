"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { useData } from "@/lib/store";
import { examMax } from "@/lib/grading";
import type { ClassRoom, Exam } from "@/lib/types";
import { PageHeader } from "@/components/ui/page";
import { Stepper } from "@/components/ui/stepper";
import { MissingState } from "./not-found-state";

const ExamContext = createContext<{ exam: Exam; cls: ClassRoom } | null>(null);

export function useExam() {
  const ctx = useContext(ExamContext);
  if (!ctx) throw new Error("useExam must be used inside ExamFrame");
  return ctx;
}

const SECTIONS = [
  { slug: "rubrik", label: "Soal & Rubrik" },
  { slug: "unggah", label: "Unggah Jawaban" },
  { slug: "review", label: "Review" },
  { slug: "publikasi", label: "Publikasi" },
];

export function ExamFrame({ examId, children }: { examId: string; children: ReactNode }) {
  const { data } = useData();
  const path = usePathname();
  const exam = data.exams.find((e) => e.id === examId);
  const cls = exam && data.classes.find((c) => c.id === exam.classId);
  if (!exam || !cls) return <MissingState what="Ujian" back="/dosen/kelas" backLabel="Kembali ke daftar kelas" />;

  const current = SECTIONS.find((s) => path.endsWith(`/${s.slug}`));
  const wide = current?.slug === "review";

  return (
    <ExamContext.Provider value={{ exam, cls }}>
      <div className={wide ? "w-full" : "mx-auto w-full max-w-[1200px]"}>
        <PageHeader
          crumbs={[
            { href: "/dosen", label: "Dashboard" },
            { href: `/dosen/kelas/${cls.id}`, label: cls.name },
            { label: exam.title },
          ]}
          title={exam.title}
          meta={`${cls.code} • ${cls.period} • Nilai maksimum ${examMax(exam)}`}
        >
          <Stepper stage={exam.stage} />
        </PageHeader>
        <nav aria-label="Bagian ujian" className="-mt-4 mb-8 grid grid-cols-2 border-b border-border sm:flex">
          {SECTIONS.map((s) => {
            const active = s === current;
            return (
              <Link
                key={s.slug}
                href={`/dosen/ujian/${exam.id}/${s.slug}`}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap border-b-2 px-4 sm:justify-start font-semibold ${
                  active ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text"
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </ExamContext.Provider>
  );
}
