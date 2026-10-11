"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { homeFor, useAuth } from "@/lib/auth";
import { Button } from "@/components/kit/button";
import { Loading, Notice } from "@/components/kit/status";
import { TopBar } from "./top-bar";

/** Client-side guard: sends signed-out users to /masuk and users with another role to their home. */
export function RoleGate({ role, children }: { role: "teacher" | "student"; children: ReactNode }) {
  const { state, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const actual = state.status === "signed_in" ? state.session.role : null;

  useEffect(() => {
    if (state.status === "signed_out") router.replace(`/masuk?next=${encodeURIComponent(path)}`);
    else if (actual && actual !== role && actual !== "school_admin") router.replace(homeFor(actual));
  }, [state.status, actual, role, router, path]);

  if (actual === "school_admin") {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <Notice
          title="Peran admin sekolah belum punya tampilan"
          action={
            <Button
              onClick={async () => {
                await signOut();
                router.replace("/masuk");
              }}
            >
              Keluar
            </Button>
          }
        >
          Akun ini terdaftar sebagai admin sekolah. Aplikasi ini baru menyediakan tampilan untuk dosen dan mahasiswa.
        </Notice>
      </main>
    );
  }

  if (actual !== role) {
    return (
      <main className="mx-auto max-w-xl px-4">
        <Loading what="akun" />
      </main>
    );
  }

  return (
    <>
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Lewati ke konten
      </a>
      <TopBar role={role} />
      <div id="konten">{children}</div>
    </>
  );
}
