"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, LayoutDashboard, Menu, MessageSquareWarning, NotebookPen, X, type LucideIcon } from "lucide-react";
import { useData } from "@/lib/store";
import { Icon } from "@/components/ui/icon";
import { SampleNotice } from "@/components/ui/panels";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  match?: string[];
  count?: number;
}

export function Wordmark({ href }: { href: string }) {
  return (
    <Link href={href} className="block rounded-md px-2 py-1">
      <span className="block text-h2 font-semibold tracking-tight">Corrector</span>
      <span className="block text-small text-text-muted">[Nama Institusi]</span>
    </Link>
  );
}

export function UserBlock({ name, role }: { name: string; role: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-small font-medium text-white"
      >
        {initials}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-small font-medium">{name}</span>
        <span className="block text-small text-text-muted">
          {role} •{" "}
          <Link
            href="/"
            className="inline-flex min-h-11 items-center underline decoration-border-strong underline-offset-4 hover:text-text md:min-h-0"
          >
            Ganti peran
          </Link>
        </span>
      </span>
    </div>
  );
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <ul className="space-y-0.5">
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
              className={`flex min-h-11 items-center gap-3 rounded-md px-2.5 md:min-h-9 ${
                active
                  ? "bg-surface font-medium text-text shadow-sm ring-1 ring-border"
                  : "text-text-muted hover:bg-surface/60 hover:text-text"
              }`}
            >
              <Icon icon={item.icon} size={18} />
              <span className="flex-1">{item.label}</span>
              {item.count ? (
                <span className="tabular rounded-sm bg-primary px-1.5 text-small font-medium text-white">
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
  const { data } = useData();
  const [drawer, setDrawer] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const newComplaints = data.complaints.filter((c) => c.status === "baru").length;

  const items: NavItem[] = [
    { href: "/dosen", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/dosen/kelas", label: "Kelas & Ujian", icon: BookOpen, match: ["/dosen/ujian"] },
    { href: "/dosen/keberatan", label: "Keberatan Nilai", icon: MessageSquareWarning, count: newComplaints },
    { href: "/dosen/catatan", label: "Catatan Penilaian", icon: NotebookPen },
  ];

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (drawer && !d.open) d.showModal();
    if (!drawer && d.open) d.close();
  }, [drawer]);

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col gap-6">
      <Wordmark href="/dosen" />
      <nav aria-label="Menu utama" className="flex-1">
        <NavList items={items} onNavigate={onNavigate} />
      </nav>
      <UserBlock name={data.lecturer.name} role="Dosen" />
    </div>
  );

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-md"
      >
        Lewati ke konten
      </a>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-border bg-sidebar p-3 lg:block">
        {sidebar()}
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-surface px-2 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label="Buka menu"
          aria-expanded={drawer}
          className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-bg"
        >
          <Icon icon={Menu} />
        </button>
        <Link href="/dosen" className="text-h2 font-semibold tracking-tight">
          Corrector
        </Link>
      </header>

      <div className="min-w-0 flex-1">
        <SampleNotice />
        <main id="konten" className="px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>

      <dialog
        ref={dialog}
        onClose={() => setDrawer(false)}
        aria-label="Menu utama"
        className="m-0 h-dvh max-h-dvh w-72 max-w-[85vw] border-r border-border bg-sidebar p-3 text-text"
      >
        <button
          type="button"
          onClick={() => setDrawer(false)}
          aria-label="Tutup menu"
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-md hover:bg-surface"
        >
          <Icon icon={X} />
        </button>
        {sidebar(() => setDrawer(false))}
      </dialog>
    </div>
  );
}
