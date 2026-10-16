"use client";
import Link from "next/link";
import { MessageSquareWarning } from "lucide-react";
import type { MyComplaint } from "@/lib/backend-types";
import { dateLong } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { ComplaintBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/panels";
import { LoadError, Loading } from "@/components/ui/state";

export default function KeberatanSaya() {
  const list = useApi<{ items: MyComplaint[] }>("/me/complaints");
  return (
    <div>
      <h1 className="doc-rule mb-6 pb-4 text-h1">Keberatan Saya</h1>
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <LoadError title="Keberatan gagal dimuat." message={list.error} onRetry={list.reload} />
      ) : (list.data?.items ?? []).length === 0 ? (
        <EmptyState icon={MessageSquareWarning} title="Anda belum mengajukan keberatan.">
          Buka salah satu nilai di halaman Nilai Saya untuk mengajukan keberatan.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {list.data!.items.map((c) => (
            <li key={c.id} className="rounded-md border border-border bg-surface px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`/mahasiswa/nilai/${c.student_test_id}`} className="text-h3 font-bold text-primary underline-offset-4 hover:underline">
                  {c.test_name}
                  {c.question_number ? ` • Soal ${c.question_number}` : " • Seluruh ujian"}
                </Link>
                <ComplaintBadge status={c.status} />
              </div>
              <p className="mt-2 whitespace-pre-wrap">{c.complaint}</p>
              {c.teacher_response && (
                <div className="mt-3 rounded-md border-l-4 border-primary bg-primary-soft px-4 py-3">
                  <p className="text-small font-semibold">Tanggapan dosen {c.resolved_at ? `(${dateLong(c.resolved_at)})` : ""}</p>
                  <p>{c.teacher_response}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
