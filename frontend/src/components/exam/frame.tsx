"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { Info, TriangleAlert } from "lucide-react";
import { api, isDemoId, type ClassTestHeader, type ProgressOut, type StreamState } from "@/lib/data";
import { MODE } from "@/lib/config";
import { formatNumber } from "@/lib/format";
import { invalidate, useClassTestEvents, useResource } from "@/lib/use-resource";
import { Breadcrumbs } from "@/components/app/page";
import { Icon } from "@/components/kit/icon";
import { ErrorState, Loading } from "@/components/kit/status";

interface ExamCtx {
  id: string;
  header: ClassTestHeader;
  progress: ProgressOut | undefined;
  progressError: unknown;
  reloadProgress: () => void;
  stream: StreamState;
}

const Ctx = createContext<ExamCtx | null>(null);

export function useExam() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useExam must be used inside ExamFrame");
  return v;
}

const READY = ["graded", "reviewed", "published"];

/** Silent while live updates work; speaks up only when they drop, because then the numbers may be stale. */
function StreamWarning({ state }: { state: StreamState }) {
  if (state !== "retrying") return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-attention">
      <Icon icon={TriangleAlert} size={15} />
      Pembaruan otomatis terputus, mencoba lagi
    </span>
  );
}

interface Step {
  slug: string;
  label: string;
  note: string;
  attention?: boolean;
  /** Extra routes that belong to this step. */
  also?: string[];
}

/**
 * Four steps in the order the work happens. Checking sheets and reviewing one sheet are the same
 * step: the review screen opens from the sheet list and returns to it.
 */
function steps(header: ClassTestHeader, p: ProgressOut | undefined): Step[] {
  const total = p?.summary.total ?? 0;
  const by = p?.summary.by_status ?? {};
  const uploaded = total - (by.absent ?? 0);
  const graded = p ? p.items.filter((i) => READY.includes(i.status)).length : 0;
  const failed = (by.needs_reupload ?? 0) + (by.failed ?? 0) + (by.quota_exceeded ?? 0);
  const review = p?.summary.needs_review ?? 0;
  const published = by.published ?? 0;
  const todo = [review > 0 && `${review} perlu diperiksa`, failed > 0 && `${failed} gagal diproses`].filter(Boolean).join(", ");
  return [
    {
      slug: "rubrik",
      label: "Rubrik",
      note:
        header.questions_count === null ? "" : header.questions_count === 0 ? "Belum diisi" : `${header.questions_count} soal`,
      attention: header.questions_count === 0,
    },
    { slug: "unggah", label: "Unggah", note: p ? `${uploaded} dari ${total} lembar` : "" },
    {
      slug: "",
      label: "Periksa",
      note: p ? todo || `${graded} dari ${total} dinilai` : "",
      attention: todo !== "",
      also: ["review", "kalibrasi"],
    },
    { slug: "publikasi", label: "Publikasi", note: p ? (published > 0 ? `${published} terbit` : "Belum terbit") : "" },
  ];
}

function StepTrack({ id, list }: { id: string; list: Step[] }) {
  const path = usePathname();
  const base = `/dosen/ujian/${id}`;
  return (
    <nav aria-label="Langkah ujian" className="border-b border-rule">
      <ol className="grid grid-cols-4">
        {list.map((s, i) => {
          const href = s.slug ? `${base}/${s.slug}` : base;
          const current = s.slug
            ? path.startsWith(href)
            : path === base || (s.also ?? []).some((a) => path.startsWith(`${base}/${a}`));
          return (
            <li key={s.label} className="min-w-0">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-12 flex-col justify-center border-b-2 px-1 py-2 sm:px-3 ${
                  current ? "border-ink" : "border-transparent hover:border-rule-strong"
                }`}
              >
                <span className={`flex items-baseline gap-1.5 truncate text-[13px] sm:text-[15px] ${current ? "font-semibold" : ""}`}>
                  <span className="num hidden text-pencil sm:inline">{i + 1}</span>
                  {s.label}
                </span>
                {s.note && (
                  <span
                    className={`hidden truncate text-[13px] sm:block ${s.attention ? "font-medium text-attention" : "text-pencil"}`}
                  >
                    {s.note}
                  </span>
                )}
                {s.note && <span className="sr-only sm:hidden">, {s.note}</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function ExamFrame({ id, children }: { id: string; children: ReactNode }) {
  const header = useResource(`class-test-header:${id}`, () => api.getClassTestHeader(id));
  const progress = useResource(`progress:${id}`, () => api.getProgress(id));
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touched = useRef(new Set<string>());

  // Worker events arrive in bursts (one per page and per question); refetch once per burst.
  const stream = useClassTestEvents(id, (e) => {
    if (e.student_test_id) touched.current.add(`sheet:${e.student_test_id}`);
    if (e.event === "complaint_summarized") touched.current.add("complaints");
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      const keys = [...touched.current];
      touched.current.clear();
      invalidate(`progress:${id}`, `class-test-header:${id}`, `grading-runs:${id}`, "classes", ...keys);
    }, 400);
  });

  const value = useMemo<ExamCtx | null>(
    () =>
      header.data
        ? {
            id,
            header: header.data,
            progress: progress.data,
            progressError: progress.error,
            reloadProgress: progress.reload,
            stream,
          }
        : null,
    [id, header.data, progress.data, progress.error, progress.reload, stream],
  );

  if (header.loading) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <Loading what="ujian" />
      </main>
    );
  }
  if (header.error || !value) {
    return (
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <ErrorState error={header.error} onRetry={header.reload} />
      </main>
    );
  }

  const h = value.header;
  const crumbs = [{ href: "/dosen", label: "Kelas & ujian" }];
  if (h.class_id && h.class_name) crumbs.push({ href: `/dosen/kelas/${h.class_id}`, label: h.class_name });

  return (
    <Ctx.Provider value={value}>
      <div className="border-b border-rule bg-surface">
        <div className="mx-auto max-w-[1400px] px-4 pt-4 sm:px-6">
          <Breadcrumbs items={crumbs} />
          <h1 className="mt-1 text-[26px] leading-tight sm:text-[30px]">{h.test_name}</h1>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pb-3 text-sm text-pencil">
            {h.max_score !== null && <span className="num">Nilai maksimum {formatNumber(h.max_score)}</span>}
            {MODE === "live" && isDemoId(id) && (
              <span className="inline-flex items-center gap-1.5">
                <Icon icon={Info} size={15} />
                Data contoh, belum tersambung ke server
              </span>
            )}
            <StreamWarning state={stream} />
          </p>
          <StepTrack id={id} list={steps(h, progress.data)} />
        </div>
      </div>
      {children}
    </Ctx.Provider>
  );
}
