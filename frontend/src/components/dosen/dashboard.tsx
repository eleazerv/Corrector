"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleCheck, FileText, MessageSquareWarning, Plus, Send, type LucideIcon } from "lucide-react";
import { useData } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Container, PageHeader } from "@/components/ui/page";
import { ClassTable, CreateClassModal } from "./class-parts";

interface Task {
  href: string;
  icon: LucideIcon;
  title: string;
  detail: string;
}

export function Dashboard() {
  const { data } = useData();
  const [creating, setCreating] = useState(false);

  const gradingExams = data.exams.filter((e) => e.stage === "penilaian" || e.stage === "review");
  const reviewSubs = data.submissions.filter((s) => s.status === "review_required");
  const newComplaints = data.complaints.filter((c) => c.status === "baru");

  const tasks: Task[] = [];
  for (const exam of data.exams) {
    const cls = data.classes.find((c) => c.id === exam.classId);
    const subs = data.submissions.filter((s) => s.examId === exam.id);
    const review = subs.filter((s) => s.status === "review_required").length;
    const unmapped = subs.filter((s) => !s.studentId).length;
    const failed = subs.filter((s) => s.status === "ocr_failed").length;
    const ready = subs.filter((s) => s.status === "graded").length;
    const where = `${exam.title}, ${cls?.name ?? ""}`;
    if (review)
      tasks.push({
        href: `/dosen/ujian/${exam.id}/review?filter=review`,
        icon: FileText,
        title: `${review} jawaban perlu review`,
        detail: where,
      });
    if (unmapped || failed)
      tasks.push({
        href: `/dosen/ujian/${exam.id}/unggah`,
        icon: FileText,
        title: [unmapped && `${unmapped} file belum dipetakan`, failed && `${failed} file OCR gagal`]
          .filter(Boolean)
          .join(", "),
        detail: where,
      });
    if (ready && !review && exam.stage === "review")
      tasks.push({ href: `/dosen/ujian/${exam.id}/publikasi`, icon: Send, title: "Siap dipublikasikan", detail: where });
  }
  if (newComplaints.length)
    tasks.push({
      href: "/dosen/keberatan",
      icon: MessageSquareWarning,
      title: `${newComplaints.length} keberatan nilai baru`,
      detail: "Baca keberatan asli dan putuskan tindak lanjutnya.",
    });

  const counts = [
    { label: "Kelas aktif", value: data.classes.length, href: "/dosen/kelas" },
    { label: "Ujian sedang dinilai", value: gradingExams.length, href: gradingExams[0] ? `/dosen/ujian/${gradingExams[0].id}/review` : "/dosen/kelas" },
    { label: "Jawaban perlu review", value: reviewSubs.length, href: reviewSubs[0] ? `/dosen/ujian/${reviewSubs[0].examId}/review?filter=review` : "/dosen/kelas" },
    { label: "Keberatan baru", value: newComplaints.length, href: "/dosen/keberatan" },
  ];

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

      <ul aria-label="Ringkasan" className="grid grid-cols-2 border-y border-border bg-surface md:grid-cols-4">
        {counts.map((c, i) => (
          <li
            key={c.label}
            className={`border-border ${i % 2 ? "border-l" : ""} ${i >= 2 ? "border-t md:border-t-0" : ""} ${i > 0 ? "md:border-l" : ""}`}
          >
            <Link href={c.href} className="block min-h-11 px-4 py-3 hover:bg-primary-soft">
              <span className="block text-small text-text-muted">{c.label}</span>
              <span className="tabular block text-score-md font-bold">{c.value}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="tugas" className="mt-10">
        <h2 id="tugas" className="text-h2">
          Perlu tindakan Anda
        </h2>
        {tasks.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-4">
            <Icon icon={CircleCheck} className="text-success" />
            Tidak ada yang menunggu. Jawaban baru dan keberatan akan muncul di sini.
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-border rounded-md border border-border bg-surface">
            {tasks.map((t) => (
              <li key={t.href + t.title}>
                <Link href={t.href} className="flex min-h-11 items-start gap-3 px-4 py-4 hover:bg-primary-soft">
                  <Icon icon={t.icon} className="mt-0.5 shrink-0 text-primary" />
                  <span>
                    <span className="block font-semibold text-primary underline-offset-4">{t.title}</span>
                    <span className="text-small text-text-muted">{t.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="kelas" className="mt-12">
        <h2 id="kelas" className="mb-3 text-h2">
          Kelas Anda
        </h2>
        <ClassTable onCreate={() => setCreating(true)} />
      </section>

      <CreateClassModal open={creating} onClose={() => setCreating(false)} />
    </Container>
  );
}
