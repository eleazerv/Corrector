"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, Menu } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { MODE } from "@/lib/config";
import { api } from "@/lib/data";
import { resetDemo } from "@/lib/api/mock/server";
import { initials } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { Dialog } from "@/components/kit/dialog";
import { Icon } from "@/components/kit/icon";

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
  also?: string[];
  count?: number;
}

const ROLE_LABEL = { teacher: "Dosen", student: "Mahasiswa", school_admin: "Admin sekolah" } as const;

function useNav(role: "teacher" | "student"): NavItem[] {
  const complaints = useResource(role === "teacher" ? "complaints:pending" : null, () => api.listComplaints("pending"));
  const fresh = complaints.data?.pending ?? 0;
  if (role === "student") {
    return [
      { href: "/mahasiswa", label: "Nilai saya", also: ["/mahasiswa/nilai"] },
      { href: "/mahasiswa/keberatan", label: "Keberatan saya" },
    ];
  }
  return [
    { href: "/dosen", label: "Kelas & ujian", exact: true, also: ["/dosen/kelas", "/dosen/ujian"] },
    { href: "/dosen/keberatan", label: "Keberatan", count: fresh },
    { href: "/dosen/catatan", label: "Catatan penilaian" },
  ];
}

function isActive(path: string, item: NavItem) {
  if (item.exact ? path === item.href : path.startsWith(item.href)) return true;
  return (item.also ?? []).some((p) => path.startsWith(p));
}

function CountBadge({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="num ml-1.5 rounded-sm bg-attention-soft px-1.5 text-[13px] font-semibold text-attention">
      {n}
      <span className="sr-only"> baru</span>
    </span>
  );
}

function DemoStrip() {
  return (
    <div className="border-b border-rule bg-sunken">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-sm sm:px-6">
        <span>
          <strong className="font-semibold">Mode demo.</strong> Semua data di sini contoh, tidak tersambung ke backend.
        </span>
        <button
          type="button"
          className="min-h-11 underline decoration-rule-strong underline-offset-4 hover:decoration-ink md:min-h-0"
          onClick={() => {
            resetDemo();
            window.location.reload();
          }}
        >
          Kembalikan data contoh
        </button>
      </div>
    </div>
  );
}

function UserMenu({ name, roleLabel, onSignOut }: { name: string; roleLabel: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-2 rounded-md px-1.5 hover:bg-sunken"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-rule-strong bg-surface text-sm font-semibold"
        >
          {initials(name)}
        </span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-sm font-medium">{name}</span>
          <span className="block text-[13px] text-pencil">{roleLabel}</span>
        </span>
        <span className="sr-only lg:hidden">Akun {name}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-60 rounded-md border border-rule bg-surface p-1 shadow-[0_12px_32px_-12px_rgb(28_26_23/0.35)]">
          <div className="border-b border-rule px-3 py-2">
            <p className="font-medium">{name}</p>
            <p className="text-sm text-pencil">{roleLabel}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-sm px-3 text-left hover:bg-sunken"
          >
            <Icon icon={LogOut} />
            Keluar
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar({ role }: { role: "teacher" | "student" }) {
  const { state, signOut } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const nav = useNav(role);
  const [menu, setMenu] = useState(false);
  const home = role === "teacher" ? "/dosen" : "/mahasiswa";
  const session = state.status === "signed_in" ? state.session : null;
  const headerRef = useRef<HTMLElement>(null);

  // Sticky panes below the bar (review workspace) read its height from --chrome-h.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--chrome-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const out = async () => {
    setMenu(false);
    await signOut();
    router.replace("/masuk");
  };

  return (
    <header ref={headerRef} className="sticky top-0 z-30 bg-paper">
      {MODE === "demo" && <DemoStrip />}
      <div className="border-b border-rule">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-4 sm:px-6">
          <Link href={home} className="text-xl font-bold tracking-tight">
            Corrector
          </Link>

          <nav aria-label="Navigasi utama" className="hidden flex-1 md:block">
            <ul className="flex items-center gap-1">
              {nav.map((item) => {
                const active = isActive(path, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-14 items-center border-b-2 px-3 ${
                        active ? "border-ink font-medium text-ink" : "border-transparent text-pencil hover:text-ink"
                      }`}
                    >
                      {item.label}
                      <CountBadge n={item.count} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-1">
            {session && (
              <div className="hidden md:block">
                <UserMenu name={session.name} roleLabel={ROLE_LABEL[session.role]} onSignOut={out} />
              </div>
            )}
            <button
              type="button"
              onClick={() => setMenu(true)}
              className="flex min-h-11 items-center gap-2 rounded-md border border-rule-strong px-3 md:hidden"
            >
              <Icon icon={Menu} size={18} />
              Menu
            </button>
          </div>
        </div>
      </div>

      <Dialog open={menu} onClose={() => setMenu(false)} title="Menu">
        <nav aria-label="Navigasi utama">
          <ul className="-mx-2">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMenu(false)}
                  aria-current={isActive(path, item) ? "page" : undefined}
                  className="flex min-h-12 items-center rounded-md px-2 text-lg aria-[current=page]:font-semibold hover:bg-sunken"
                >
                  {item.label}
                  <CountBadge n={item.count} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {session && (
          <div className="mt-4 border-t border-rule pt-4">
            <p className="font-medium">{session.name}</p>
            <p className="text-sm text-pencil">{ROLE_LABEL[session.role]}</p>
            <button
              type="button"
              onClick={out}
              className="mt-2 flex min-h-11 items-center gap-2 underline decoration-rule-strong underline-offset-4"
            >
              <Icon icon={LogOut} />
              Keluar
            </button>
          </div>
        )}
      </Dialog>
    </header>
  );
}
