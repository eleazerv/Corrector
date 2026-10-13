"use client";
//  : dashboard memakai data backend. Dibuat sesederhana mungkin:
// "Perlu tindakan Anda" (daftar tugas dengan 1 tombol jelas) di atas, daftar kelas di bawah.

import Link from "next/link";
import { useState } from "react";
import { Bell, CircleCheck, ClipboardCheck, LoaderCircle, MessageSquareWarning, Plus, Send, Upload, type LucideIcon } from "lucide-react";
import type { ClassTestItem, ListResponse, NotificationItem, TeacherComplaint } from "@/lib/backend-types";
import { date } from "@/lib/format";
import { useApi, useSession } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Container, PageHeader } from "@/components/ui/page";
import { ClassTable, CreateClassModal } from "./class-parts";

interface Task {
  href: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  action: string;
  busy?: boolean;
}

export function Dashboard() {
  const session = useSession();
  const [creating, setCreating] = useState(false);
  const tests = useApi<ListResponse<ClassTestItem>>("/class-tests");
  const complaints = useApi<{ items: TeacherComplaint[]; pending: number }>("/complaints?status=pending&limit=50");
  const notifications = useApi<{ items: NotificationItem[]; unread: number }>("/notifications?unread_only=true&limit=5");

  const tasks: Task[] = [];
  for (const ct of tests.data?.items ?? []) {
    const where = `${ct.class_name} • ${date(ct.test_date)}`;
    if (ct.status === "reviewing")
      tasks.push({
        href: `/dosen/ujian/${ct.id}/review`,
        icon: ClipboardCheck,
        title: `${ct.test_name}: nilai dari AI siap Anda periksa`,
        detail: where,
        action: "Periksa nilai",
      });
    else if (ct.status === "processing")
      tasks.push({
        href: `/dosen/ujian/${ct.id}/unggah`,
        icon: LoaderCircle,
        title: `${ct.test_name}: AI sedang membaca dan menilai jawaban`,
        detail: `${where}. Anda tidak perlu menunggu di halaman ini.`,
        action: "Lihat kemajuan",
        busy: true,
      });
    else if (ct.status === "scheduled")
      tasks.push({
        href: `/dosen/ujian/${ct.id}/unggah`,
        icon: Upload,
        title: `${ct.test_name}: belum ada lembar jawaban`,
        detail: where,
        action: "Unggah jawaban",
      });
  }
  const pending = complaints.data?.pending ?? 0;
  if (pending)
    tasks.push({
      href: "/dosen/keberatan",
      icon: MessageSquareWarning,
      title: `${pending} keberatan nilai menunggu keputusan Anda`,
      detail: "Ringkasan dari AI sudah disiapkan untuk setiap keberatan.",
      action: "Buka keberatan",
    });
  const unread = notifications.data?.unread ?? 0;
  if (unread)
    tasks.push({
      href: "/dosen/notifikasi",
      icon: Bell,
      title: `${unread} pemberitahuan belum dibaca`,
      detail: notifications.data?.items[0]?.title ?? "",
      action: "Baca",
    });

  const loading = tests.loading && !tests.data;
  const published = (tests.data?.items ?? []).filter((t) => t.status === "published").length;

  return (
    <Container>
      <PageHeader
        title="Beranda"
        meta={`Selamat datang, ${session?.me?.name ?? "Bapak/Ibu"}.`}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            Buat Kelas
          </Button>
        }
      />

      <section aria-labelledby="tugas">
        <h2 id="tugas" className="text-h2">
          Perlu tindakan Anda
        </h2>
        {loading ? (
          <p role="status" className="mt-3 flex items-center gap-2 text-text-muted">
            <Icon icon={LoaderCircle} className="animate-spin" />
            Memuat…
          </p>
        ) : tasks.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-5">
            <Icon icon={CircleCheck} className="text-success" />
            Tidak ada yang menunggu. Untuk mulai menilai, buka salah satu kelas di bawah lalu pilih ujiannya.
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-border rounded-md border border-border bg-surface">
            {tasks.map((t) => (
              <li key={t.href + t.title} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                <Icon icon={t.icon} size={24} className={`shrink-0 text-primary ${t.busy ? "animate-spin" : ""}`} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t.title}</span>
                  <span className="text-small text-text-muted">{t.detail}</span>
                </span>
                <Link
                  href={t.href}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-primary px-5 font-semibold text-white hover:bg-primary-hover"
                >
                  {t.action}
                </Link>
              </li>
            ))}
          </ol>
        )}
        {published > 0 && (
          <p className="mt-3 flex items-center gap-2 text-small text-text-muted">
            <Icon icon={Send} size={16} />
            {published} ujian sudah diumumkan ke mahasiswa.
          </p>
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
