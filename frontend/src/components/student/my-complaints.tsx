"use client";

import Link from "next/link";
import { api } from "@/lib/data";
import { complaintStatus, formatDate } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { Page, PageHead } from "@/components/app/page";
import { Empty, ErrorState, Loading, Notice, StatusTag } from "@/components/kit/status";

export function MyComplaints() {
  const res = useResource("my-complaints", () => api.myComplaints());
  const items = res.data?.items ?? [];
  return (
    <Page>
      <PageHead title="Keberatan saya" />
      {res.loading ? (
        <Loading what="keberatan" />
      ) : res.error ? (
        <ErrorState error={res.error} onRetry={res.reload} />
      ) : items.length === 0 ? (
        <Empty title="Belum ada keberatan">
          Untuk mengajukan keberatan, buka nilai ujian di halaman{" "}
          <Link href="/mahasiswa" className="underline underline-offset-4">
            Nilai saya
          </Link>
          .
        </Empty>
      ) : (
        <ul className="space-y-4">
          {items.map((c) => {
            const st = complaintStatus(c.status, "student");
            return (
              <li key={c.id} className="rounded-md border border-rule bg-surface px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Link
                    href={`/mahasiswa/nilai/${c.student_test_id}`}
                    className="text-lg font-semibold underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                  >
                    {c.test_name}
                    {c.question_number ? `, soal ${c.question_number}` : ", nilai keseluruhan"}
                  </Link>
                  <StatusTag tone={st.tone}>{st.label}</StatusTag>
                </div>
                <p className="mt-3 max-w-[70ch] whitespace-pre-line">{c.complaint}</p>
                {c.teacher_response ? (
                  <div className="mt-3">
                    <Notice title={c.resolved_at ? `Tanggapan dosen, ${formatDate(c.resolved_at)}` : "Tanggapan dosen"}>
                      {c.teacher_response}
                    </Notice>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-pencil">Menunggu dibaca dosen. Nilai tidak berubah sampai ada keputusan.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
