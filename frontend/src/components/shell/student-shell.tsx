"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useData } from "@/lib/store";
import { SampleNotice } from "@/components/ui/panels";

export function StudentShell({ children }: { children: ReactNode }) {
  const { data } = useData();
  const path = usePathname();
  const me = data.students.find((s) => s.id === data.currentStudentId);

  const links = [
    { href: "/mahasiswa", label: "Nilai Saya", active: path === "/mahasiswa" || path.startsWith("/mahasiswa/nilai") },
    { href: "/mahasiswa/keberatan", label: "Keberatan Saya", active: path.startsWith("/mahasiswa/keberatan") },
  ];

  const nav = (
    <nav aria-label="Menu mahasiswa" className="flex gap-1">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.active ? "page" : undefined}
          className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-3 font-medium sm:min-h-9 sm:flex-none ${
            l.active ? "bg-primary-soft text-text" : "text-text-muted hover:text-text"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <a
          href="#konten"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-md"
        >
          Lewati ke konten
        </a>
        <div className="mx-auto flex h-14 max-w-[880px] items-center gap-4 px-4 sm:px-8">
          <Link href="/mahasiswa" className="text-h2 font-semibold tracking-tight">
            Corrector
          </Link>
          <div className="hidden sm:block">{nav}</div>
          <div className="ml-auto flex items-center gap-3">
            {me && (
              <span className="hidden text-right text-small leading-tight md:block">
                <span className="block font-medium">{me.name}</span>
                <span className="tabular text-text-muted">{me.nim}</span>
              </span>
            )}
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-small font-medium shadow-sm hover:bg-zebra sm:min-h-9"
            >
              Ganti peran
            </Link>
          </div>
        </div>
        <div className="border-t border-border px-2 py-1 sm:hidden">{nav}</div>
      </header>
      <SampleNotice />
      <main id="konten" className="mx-auto w-full max-w-[880px] flex-1 px-4 py-6 sm:px-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}
