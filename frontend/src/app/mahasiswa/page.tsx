"use client";
import Link from "next/link";
import { FileText } from "lucide-react";
import type { MyTestItem } from "@/lib/backend-types";
import { dateLong, score } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { EmptyState } from "@/components/ui/panels";
import { LoadError, Loading } from "@/components/ui/state";

export default function NilaiSaya() {
  const list = useApi<{ items: MyTestItem[] }>("/me/tests");
  return (
    <div>
      <h1 className="doc-rule mb-6 pb-4 text-h1">Nilai Saya</h1>
      {list.loading && !list.data ? (
        <Loading text="Memuat nilai…" />
      ) : list.error ? (
        <LoadError title="Nilai gagal dimuat." message={list.error} onRetry={list.reload} />
      ) : (list.data?.items ?? []).length === 0 ? (
        <EmptyState icon={FileText} title="Belum ada nilai yang diumumkan.">
          Nilai muncul di sini setelah dosen memeriksa dan mengumumkannya.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {list.data!.items.map((t) => (
            <li key={t.student_test_id}>
              <Link
                href={`/mahasiswa/nilai/${t.student_test_id}`}
                className="flex items-center gap-4 rounded-md border border-border bg-surface px-4 py-4 hover:border-primary sm:px-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-h3 font-bold text-primary">{t.test_name}</span>
                  <span className="block text-text-muted">
                    {t.subject_name} • {t.class_name}
                  </span>
                  <span className="block text-small text-text-muted">Diumumkan {dateLong(t.published_at)}</span>
                </span>
                <span className="tabular shrink-0 text-score-md font-bold">{score(t.total_grade, t.max_score)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
