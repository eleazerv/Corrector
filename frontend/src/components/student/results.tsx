"use client";

import Link from "next/link";
import { api } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { Page, PageHead } from "@/components/app/page";
import { FinalScore } from "@/components/kit/score";
import { Empty, ErrorState, Loading } from "@/components/kit/status";

export function StudentResults() {
  const res = useResource("my-results", () => api.myTests());
  const items = res.data?.items ?? [];
  return (
    <Page>
      <PageHead title="Nilai saya" />
      {res.loading ? (
        <Loading what="nilai" />
      ) : res.error ? (
        <ErrorState error={res.error} onRetry={res.reload} />
      ) : items.length === 0 ? (
        <Empty title="Belum ada nilai">Nilai muncul di sini setelah dosen memeriksa dan mempublikasikannya.</Empty>
      ) : (
        <ul className="divide-y divide-rule rounded-md border border-rule bg-surface">
          {items.map((r) => (
            <li key={r.student_test_id}>
              <Link
                href={`/mahasiswa/nilai/${r.student_test_id}`}
                className="flex items-center justify-between gap-4 px-5 py-5 hover:bg-sunken"
              >
                <span className="min-w-0">
                  <span className="block text-xl font-semibold">{r.test_name}</span>
                  <span className="block text-pencil">{[r.subject_name, r.class_name].filter(Boolean).join(" · ")}</span>
                  {r.published_at && <span className="block text-sm text-pencil">Dipublikasikan {formatDate(r.published_at)}</span>}
                </span>
                <span className="shrink-0 text-2xl">
                  <FinalScore value={r.total_grade} max={r.max_score} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
