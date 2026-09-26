"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useData } from "@/lib/store";
import { SampleNotice } from "@/components/ui/panels";
import { TopBar } from "./top-bar";

export function StudentShell({ children }: { children: ReactNode }) {
  const { data } = useData();
  const path = usePathname();
  const me = data.students.find((s) => s.id === data.currentStudentId);

  const links = [
    { href: "/mahasiswa", label: "Nilai Saya", active: path === "/mahasiswa" || path.startsWith("/mahasiswa/nilai") },
    { href: "/mahasiswa/keberatan", label: "Keberatan Saya", active: path.startsWith("/mahasiswa/keberatan") },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar home="/mahasiswa" userName={me ? `${me.name} (${me.nim})` : ""} role="Mahasiswa">
        <nav aria-label="Menu mahasiswa" className="flex w-full gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={l.active ? "page" : undefined}
              className={`inline-flex min-h-11 flex-1 items-center justify-center border-b-[3px] px-3 font-semibold sm:flex-none ${
                l.active ? "border-white" : "border-transparent text-white/85 hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </TopBar>
      <SampleNotice />
      <main id="konten" className="mx-auto w-full max-w-[880px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
        {children}
      </main>
    </div>
  );
}
