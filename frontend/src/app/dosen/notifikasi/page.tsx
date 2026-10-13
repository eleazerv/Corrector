"use client";
import Link from "next/link";
import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import type { NotificationItem } from "@/lib/backend-types";
import { dateTime } from "@/lib/format";
import { invalidate, useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/page";
import { EmptyState } from "@/components/ui/panels";
import { LoadError, Loading } from "@/components/ui/state";
import { useToast } from "@/components/ui/toast";

/** Ke mana pemberitahuan mengarah. Konflik catatan -> halaman Catatan Penilaian. */
function linkFor(n: NotificationItem): string | null {
  if (n.kind.includes("trait") || n.kind.includes("conflict")) return "/dosen/catatan";
  if (n.kind.includes("complaint")) return "/dosen/keberatan";
  return null;
}

export default function NotifikasiPage() {
  const list = useApi<{ items: NotificationItem[]; unread: number }>("/notifications?limit=100");
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function markRead(n: NotificationItem) {
    if (n.read_at) return;
    try {
      await apiFetch(`/notifications/${n.id}/read`, { method: "POST" });
      invalidate("/notifications");
    } catch {
      /* tidak penting kalau gagal */
    }
  }

  async function readAll() {
    setBusy(true);
    try {
      await apiFetch("/notifications/read-all", { method: "POST" });
      invalidate("/notifications");
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container>
      <PageHeader
        crumbs={[{ href: "/dosen", label: "Beranda" }, { label: "Pemberitahuan" }]}
        title="Pemberitahuan"
        actions={
          (list.data?.unread ?? 0) > 0 && (
            <Button icon={CheckCheck} loading={busy} onClick={readAll}>
              Tandai semua sudah dibaca
            </Button>
          )
        }
      />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <LoadError title="Pemberitahuan gagal dimuat." message={list.error} onRetry={list.reload} />
      ) : (list.data?.items ?? []).length === 0 ? (
        <EmptyState icon={Bell} title="Belum ada pemberitahuan.">
          Pemberitahuan muncul kalau ada yang perlu keputusan Anda, misalnya catatan penilaian yang bertentangan.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface">
          {list.data!.items.map((n) => {
            const href = linkFor(n);
            const body = (
              <>
                <span className="flex items-start gap-3">
                  {!n.read_at && <span className="mt-2 h-3 w-3 shrink-0 rounded-full bg-accent" aria-label="Belum dibaca" />}
                  <span className="min-w-0 flex-1">
                    <span className={`block ${n.read_at ? "" : "font-bold"}`}>{n.title}</span>
                    {n.body && <span className="block text-text-muted">{n.body}</span>}
                    <span className="block text-small text-text-muted">{dateTime(n.created_at)}</span>
                  </span>
                </span>
              </>
            );
            return (
              <li key={n.id}>
                {href ? (
                  <Link href={href} onClick={() => markRead(n)} className="block px-4 py-4 hover:bg-primary-soft sm:px-5">
                    {body}
                  </Link>
                ) : (
                  <button type="button" onClick={() => markRead(n)} className="block w-full px-4 py-4 text-left hover:bg-primary-soft sm:px-5">
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
