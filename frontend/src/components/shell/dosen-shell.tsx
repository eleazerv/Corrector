"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, BookOpen, LayoutDashboard, Menu, MessageSquareWarning, NotebookPen, X, type LucideIcon } from "lucide-react";
//  menu memakai hitungan dari backend (keberatan menunggu, pemberitahuan belum dibaca)
import type { NotificationItem, TeacherComplaint } from "@/lib/backend-types";
import { useApi, useSession } from "@/lib/use-api";
import { Icon } from "@/components/ui/icon";
import { TopBar } from "./top-bar";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  match?: string[];
  count?: number;
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = item.exact
          ? path === item.href
          : [item.href, ...(item.match ?? [])].some((p) => path.startsWith(p));
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-md px-3 ${
                active ? "bg-primary-soft font-semibold text-primary" : "text-text hover:bg-bg"
              }`}
            >
              <Icon icon={item.icon} />
              <span className="flex-1">{item.label}</span>
              {item.count ? (
                <span className="tabular rounded-sm bg-info-soft px-1.5 text-small font-semibold text-info">
                  {item.count}
                  <span className="sr-only"> baru</span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function DosenShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const [drawer, setDrawer] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const complaints = useApi<{ items: TeacherComplaint[]; pending: number }>("/complaints?status=pending&limit=50");
  const notifications = useApi<{ items: NotificationItem[]; unread: number }>("/notifications?unread_only=true&limit=1");
  const newComplaints = complaints.data?.pending ?? 0;

  const items: NavItem[] = [
    { href: "/dosen", label: "Beranda", icon: LayoutDashboard, exact: true },
    { href: "/dosen/kelas", label: "Kelas", icon: BookOpen, match: ["/dosen/ujian"] },
    { href: "/dosen/keberatan", label: "Keberatan Nilai", icon: MessageSquareWarning, count: newComplaints },
    { href: "/dosen/catatan", label: "Catatan Penilaian", icon: NotebookPen },
    { href: "/dosen/notifikasi", label: "Pemberitahuan", icon: Bell, count: notifications.data?.unread ?? 0 },
  ];

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (drawer && !d.open) d.showModal();
    if (!drawer && d.open) d.close();
  }, [drawer]);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        home="/dosen"
        userName={session?.me?.name ?? ""}
        role="Dosen"
        leading={
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Buka menu"
            aria-expanded={drawer}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-md hover:bg-white/10 lg:hidden"
          >
            <Icon icon={Menu} />
          </button>
        }
      />
      <div className="flex flex-1">
        <nav aria-label="Menu utama" className="hidden w-60 shrink-0 border-r border-border bg-surface p-4 lg:block">
          <NavList items={items} />
        </nav>
        <main id="konten" className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>

      <dialog
        ref={dialog}
        onClose={() => setDrawer(false)}
        aria-label="Menu utama"
        className="m-0 h-dvh max-h-dvh w-72 max-w-[85vw] border-r border-border bg-surface p-4 text-text"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="font-heading text-h3">Menu</span>
          <button
            type="button"
            onClick={() => setDrawer(false)}
            aria-label="Tutup menu"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-md hover:bg-bg"
          >
            <Icon icon={X} />
          </button>
        </div>
        <NavList items={items} onNavigate={() => setDrawer(false)} />
      </dialog>
    </div>
  );
}
