"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { MODE } from "@/lib/config";
import { api, type ClassSummary, type ClassTestSummary } from "@/lib/data";
import { classTestStatus } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { Page, PageHead, SectionTitle } from "@/components/app/page";
import { Button } from "@/components/kit/button";
import { Icon } from "@/components/kit/icon";
import { Empty, ErrorState, Loading, MockNotice, StatusTag } from "@/components/kit/status";
import { CreateClassDialog } from "./create-class";

interface Waiting {
  key: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  urgent: boolean;
}

/** Everything that needs the lecturer, most urgent first. This list is the point of the page. */
function waitingItems(classes: ClassSummary[], fresh: number): Waiting[] {
  const out: Waiting[] = [];
  for (const c of classes) {
    for (const t of c.class_tests) {
      const where = `${t.test_name}, ${c.name}`;
      if (t.needs_review > 0) {
        out.push({
          key: `${t.id}-r`,
          title: `${t.needs_review} lembar perlu diperiksa`,
          detail: where,
          href: `/dosen/ujian/${t.id}/review`,
          action: "Periksa",
          urgent: true,
        });
      }
      if (t.needs_attention > 0) {
        out.push({
          key: `${t.id}-a`,
          title: `${t.needs_attention} lembar gagal diproses`,
          detail: `${where}. Unggah ulang fotonya atau minta nilai ulang.`,
          href: `/dosen/ujian/${t.id}`,
          action: "Lihat lembar",
          urgent: true,
        });
      }
      const ready = t.sheets_graded - t.sheets_published - t.needs_review;
      if (ready > 0 && t.needs_review === 0) {
        out.push({
          key: `${t.id}-p`,
          title: `${ready} nilai siap dipublikasikan`,
          detail: where,
          href: `/dosen/ujian/${t.id}/publikasi`,
          action: "Periksa & publikasikan",
          urgent: false,
        });
      }
      if (t.questions_count === 0) {
        out.push({
          key: `${t.id}-q`,
          title: "Rubrik belum diisi",
          detail: `${where}. Jawaban baru bisa dinilai setelah rubrik ada.`,
          href: `/dosen/ujian/${t.id}/rubrik`,
          action: "Isi rubrik",
          urgent: false,
        });
      }
    }
  }
  if (fresh > 0) {
    out.splice(out.filter((w) => w.urgent).length, 0, {
      key: "complaints",
      title: `${fresh} keberatan baru`,
      detail: "Mahasiswa mengajukan keberatan atas nilai yang sudah dipublikasikan.",
      href: "/dosen/keberatan",
      action: "Buka keberatan",
      urgent: true,
    });
  }
  return out;
}

/** Each item is one link: the whole row goes where the work is, so there is no row of competing buttons. */
function WaitingList({ items }: { items: Waiting[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-rule bg-surface px-5 py-6 text-pencil">
        Tidak ada yang menunggu keputusan Anda. Lembar baru muncul di sini setelah diunggah dan dinilai.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-rule rounded-md border border-rule bg-surface">
      {items.map((w) => (
        <li key={w.key}>
          <Link
            href={w.href}
            className="group flex flex-col gap-1 px-5 py-4 hover:bg-sunken sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          >
            <span className="min-w-0">
              <span className="block font-semibold">{w.title}</span>
              <span className="block text-sm text-pencil">{w.detail}</span>
            </span>
            <span className="shrink-0 text-sm font-medium underline decoration-rule-strong underline-offset-4 group-hover:decoration-ink">
              {w.action}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ExamRow({ t }: { t: ClassTestSummary }) {
  const s = classTestStatus(t.status);
  return (
    <li>
      <Link
        href={`/dosen/ujian/${t.id}`}
        className="-mx-2 grid gap-x-6 gap-y-1 rounded-sm px-2 py-3 hover:bg-sunken sm:grid-cols-[minmax(0,1fr)_auto_10rem] sm:items-center"
      >
        <span className="min-w-0 font-medium">{t.test_name}</span>
        <span>
          <StatusTag tone={s.tone}>{s.label}</StatusTag>
        </span>
        <span className="num text-sm text-pencil sm:text-right">
          {t.questions_count === 0
            ? "Rubrik kosong"
            : t.sheets_total === 0
              ? "Belum ada mahasiswa"
              : `${t.sheets_graded} dari ${t.sheets_total} dinilai`}
        </span>
      </Link>
    </li>
  );
}

function ClassBlock({ c }: { c: ClassSummary }) {
  return (
    <section aria-labelledby={`kelas-${c.id}`} className="rounded-md border border-rule bg-surface px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-3">
        <h3 id={`kelas-${c.id}`} className="text-lg">
          <Link href={`/dosen/kelas/${c.id}`} className="hover:underline hover:underline-offset-4">
            {c.name}
          </Link>
        </h3>
        <p className="text-sm text-pencil">
          {c.code} · {c.student_count} mahasiswa
        </p>
      </div>
      {c.class_tests.length === 0 ? (
        <p className="py-3 text-pencil">
          Belum ada ujian.{" "}
          <Link href={`/dosen/kelas/${c.id}`} className="underline underline-offset-4">
            Buat ujian di halaman kelas
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {c.class_tests.map((t) => (
            <ExamRow key={t.id} t={t} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function TeacherHome() {
  const classes = useResource("classes", () => api.listClasses());
  const complaints = useResource("complaints:pending", () => api.listComplaints("pending"));
  const [creating, setCreating] = useState(false);
  // Only a school admin may create a class in the real database, so the button exists in demo mode only.
  const canCreate = MODE === "demo";

  return (
    <Page>
      <PageHead
        title="Kelas & ujian"
        actions={
          canCreate && (
            <Button onClick={() => setCreating(true)}>
              <Icon icon={Plus} />
              Kelas baru
            </Button>
          )
        }
      />

      <section aria-labelledby="menunggu" className="mb-10">
        <SectionTitle id="menunggu">Menunggu Anda</SectionTitle>
        {classes.loading || complaints.loading ? (
          <Loading what="pekerjaan" />
        ) : classes.error ? (
          <ErrorState error={classes.error} onRetry={classes.reload} />
        ) : complaints.error ? (
          <ErrorState error={complaints.error} onRetry={complaints.reload} />
        ) : (
          <WaitingList items={waitingItems(classes.data ?? [], complaints.data?.pending ?? 0)} />
        )}
      </section>

      <section aria-labelledby="kelas">
        <SectionTitle id="kelas" aside={<MockNotice endpoint="listClasses" />}>
          Kelas
        </SectionTitle>
        {classes.loading ? (
          <Loading what="kelas" />
        ) : classes.error ? (
          <ErrorState error={classes.error} onRetry={classes.reload} />
        ) : classes.data && classes.data.length > 0 ? (
          <div className="space-y-4">
            {classes.data.map((c) => (
              <ClassBlock key={c.id} c={c} />
            ))}
          </div>
        ) : (
          <Empty
            title="Belum ada kelas"
            action={
              canCreate && (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Buat kelas pertama
                </Button>
              )
            }
          >
            {canCreate
              ? "Kelas menampung daftar mahasiswa dan ujian-ujiannya."
              : "Belum ada kelas dengan Anda sebagai dosen pengampu. Kelas dibuat oleh admin sekolah; minta admin menambahkan kelas Anda."}
          </Empty>
        )}
      </section>

      <CreateClassDialog open={creating} onClose={() => setCreating(false)} />
    </Page>
  );
}
