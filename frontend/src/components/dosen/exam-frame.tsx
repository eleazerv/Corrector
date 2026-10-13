"use client";
// : kerangka halaman 1 ujian (id di URL = class_test id).
// Mengambil GET /class-tests/{id} + GET /tests/{test_id}, lalu dibagikan ke halaman anak lewat useExam().

import { usePathname } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import type { ClassTestDetail, TestDetail } from "@/lib/backend-types";
import { date, TEST_TYPES } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { ClassTestBadge } from "@/components/ui/badge";
import { Container, PageHeader } from "@/components/ui/page";
import { LoadError, Loading } from "@/components/ui/state";
import { Stepper } from "@/components/ui/stepper";
import Link from "next/link";

interface ExamCtx {
  ct: ClassTestDetail;
  test: TestDetail;
  reload: () => void;
}

const ExamContext = createContext<ExamCtx | null>(null);

export function useExam() {
  const ctx = useContext(ExamContext);
  if (!ctx) throw new Error("useExam must be used inside ExamFrame");
  return ctx;
}

export function ExamFrame({ examId, children }: { examId: string; children: ReactNode }) {
  const path = usePathname();
  const ct = useApi<ClassTestDetail>(`/class-tests/${examId}`);
  const test = useApi<TestDetail>(ct.data ? `/tests/${ct.data.test_id}` : null);

  if ((ct.loading && !ct.data) || (test.loading && !test.data)) return <Loading text="Memuat ujian…" />;
  if (ct.error || test.error || !ct.data || !test.data)
    return (
      <Container>
        <LoadError
          title="Ujian tidak bisa dibuka."
          message={ct.error ?? test.error ?? "Ujian tidak ditemukan."}
          onRetry={() => {
            ct.reload();
            test.reload();
          }}
        />
      </Container>
    );

  const c = ct.data;
  const t = test.data;
  const base = `/dosen/ujian/${c.id}`;
  const hasQuestions = t.questions.length > 0;
  const status = c.status;
  const steps = [
    {
      href: `${base}/rubrik`,
      label: "Soal & Kunci",
      // changed by : selesai = soal ada + ditandai lengkap (status 'ready')
      hint: !hasQuestions ? "Belum ada soal" : t.status === "ready" ? `${t.questions.length} soal, lengkap` : `${t.questions.length} soal, belum ditandai lengkap`,
      done: hasQuestions && t.status === "ready",
    },
    {
      href: `${base}/unggah`,
      label: "Unggah Jawaban",
      hint: status === "scheduled" ? "Belum ada foto" : "Foto sudah masuk",
      done: status !== "scheduled",
    },
    {
      href: `${base}/review`,
      label: "Periksa Nilai",
      hint: status === "reviewing" ? "Siap diperiksa" : status === "published" ? "Selesai" : "Tunggu AI selesai",
      done: status === "published",
    },
    {
      href: `${base}/publikasi`,
      label: "Umumkan",
      hint: status === "published" ? `Diumumkan` : "Kirim nilai ke mahasiswa",
      done: status === "published",
    },
  ].map((s) => ({ ...s, active: path.startsWith(s.href) }));
  const wide = path.endsWith("/review");
  const typeLabel = TEST_TYPES.find((x) => x.id === t.test_type)?.label ?? t.test_type;

  return (
    <ExamContext.Provider
      value={{
        ct: c,
        test: t,
        reload: () => {
          ct.reload();
          test.reload();
        },
      }}
    >
      <div className={wide ? "w-full" : "mx-auto w-full max-w-[1200px]"}>
        <PageHeader
          crumbs={[
            { href: "/dosen", label: "Beranda" },
            { href: `/dosen/kelas/${c.class_id}`, label: c.class_name },
            { label: c.test_name },
          ]}
          title={c.test_name}
          meta={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                {t.subject_name} • {typeLabel} • Nilai maksimal {t.max_score} • {date(c.test_date)}
              </span>
              <ClassTestBadge status={c.status} />
              <Link href={`${base}/kalibrasi`} className="text-small text-primary underline underline-offset-4">
                Uji akurasi AI
              </Link>
            </span>
          }
        >
          <Stepper steps={steps} />
        </PageHeader>
        {children}
      </div>
    </ExamContext.Provider>
  );
}
