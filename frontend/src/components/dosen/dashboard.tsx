"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleCheck, Plus } from "lucide-react";
import { useData } from "@/lib/store";
import { stageText } from "@/lib/grading";
import type { Tone } from "@/lib/grading";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Container, PageHeader } from "@/components/ui/page";
import { ClassTable, CreateClassModal } from "./class-parts";

interface Task {
  href: string;
  tone: Tone;
  status: string;
  title: string;
  detail: string;
  action: string;
}

export function Dashboard() {
  const { data } = useData();
  const [creating, setCreating] = useState(false);

  const tasks: Task[] = [];
  for (const exam of data.exams) {
    const cls = data.classes.find((c) => c.id === exam.classId);
    const subs = data.submissions.filter((s) => s.examId === exam.id);
    const review = subs.filter((s) => s.status === "review_required").length;
    const unmapped = subs.filter((s) => !s.studentId).length;
    const failed = subs.filter((s) => s.status === "ocr_failed").length;
    const ready = subs.filter((s) => s.status === "graded").length;
    const where = `${exam.title} • ${cls?.name ?? ""}`;
    if (review)
      tasks.push({
        href: `/dosen/ujian/${exam.id}/review?filter=review`,
        tone: "warning",
        status: "Perlu Review",
        title: `${review} jawaban ditandai AI untuk diperiksa`,
        detail: where,
        action: "Mulai review",
      });
    if (unmapped || failed)
      tasks.push({
        href: `/dosen/ujian/${exam.id}/unggah`,
        tone: "danger",
        status: "File bermasalah",
        title: [unmapped && `${unmapped} file belum dipetakan`, failed && `${failed} file OCR gagal`].filter(Boolean).join(", "),
        detail: where,
        action: "Perbaiki file",
      });
    if (ready && !review && exam.stage === "review")
      tasks.push({
        href: `/dosen/ujian/${exam.id}/publikasi`,
        tone: "success",
        status: "Siap",
        title: `${ready} nilai siap dipublikasikan`,
        detail: where,
        action: "Buka publikasi",
      });
  }
  const newComplaints = data.complaints.filter((c) => c.status === "baru");
  if (newComplaints.length)
    tasks.push({
      href: "/dosen/keberatan",
      tone: "info",
      status: "Keberatan",
      title: `${newComplaints.length} keberatan nilai baru`,
      detail: "Baca keberatan asli sebelum memutuskan",
      action: "Buka keberatan",
    });

  const running = data.exams.filter((e) => e.stage === "penilaian" || e.stage === "review");

  return (
    <Container>
      <PageHeader
        title="Dashboard"
        meta={`Selamat datang, ${data.lecturer.name}.`}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            Buat Kelas
          </Button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="tugas" className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="tugas" className="text-h2">
              Perlu tindakan Anda
            </h2>
            <span className="tabular text-small text-text-muted">{tasks.length} item</span>
          </div>
          {tasks.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-5">
              <Icon icon={CircleCheck} className="text-success" />
              Tidak ada yang menunggu. Jawaban baru dan keberatan akan muncul di sini.
            </p>
          ) : (
            <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {tasks.map((t) => (
                <li key={t.href + t.title} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <Badge tone={t.tone}>{t.status}</Badge>
                    <p className="mt-1.5 font-medium">{t.title}</p>
                    <p className="text-small text-text-muted">{t.detail}</p>
                  </div>
                  <Link href={t.href} className={buttonClass("secondary", true, "shrink-0")}>
                    {t.action}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside aria-labelledby="berjalan">
          <h2 id="berjalan" className="mb-3 text-h2">
            Penilaian berjalan
          </h2>
          {running.length === 0 ? (
            <p className="text-text-muted">Belum ada ujian yang sedang dinilai.</p>
          ) : (
            <ul className="space-y-3">
              {running.map((e) => {
                const subs = data.submissions.filter((s) => s.examId === e.id && s.studentId);
                const done = subs.filter((s) => s.status === "graded" || s.status === "published").length;
                const pct = subs.length ? Math.round((done / subs.length) * 100) : 0;
                const cls = data.classes.find((c) => c.id === e.classId);
                return (
                  <li key={e.id}>
                    <Link
                      href={`/dosen/ujian/${e.id}/review`}
                      className="block rounded-lg border border-border bg-surface p-4 hover:border-border-strong"
                    >
                      <span className="block font-medium">{e.title}</span>
                      <span className="block text-small text-text-muted">
                        {cls?.name} • {stageText(e.stage)}
                      </span>
                      <span
                        className="mt-3 block h-1.5 overflow-hidden rounded-full bg-disabled"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct}
                        aria-label={`Progres review ${e.title}`}
                      >
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="tabular mt-1.5 block text-small text-text-muted">
                        {done} dari {subs.length} jawaban selesai direview
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>

      <section aria-labelledby="kelas" className="mt-12">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="kelas" className="text-h2">
            Kelas Anda
          </h2>
          <Link
            href="/dosen/kelas"
            className="inline-flex min-h-11 items-center text-small text-text-muted underline decoration-border-strong underline-offset-4 hover:text-text md:min-h-0"
          >
            Semua kelas
          </Link>
        </div>
        <ClassTable onCreate={() => setCreating(true)} />
      </section>

      <CreateClassModal open={creating} onClose={() => setCreating(false)} />
    </Container>
  );
}
