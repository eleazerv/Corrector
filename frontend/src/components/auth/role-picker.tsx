"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { loginAs, type DemoRole } from "@/lib/auth";
import { errorMessage } from "@/lib/api";
import { Icon } from "@/components/ui/icon";
import { Banner } from "@/components/ui/panels";

const ROLES: { role: DemoRole; href: string; title: string; body: string }[] = [
  {
    role: "dosen",
    href: "/dosen",
    title: "Masuk sebagai Dosen",
    body: "Siapkan rubrik, unggah jawaban, tinjau saran AI, lalu publikasikan nilai.",
  },
  {
    role: "mahasiswa",
    href: "/mahasiswa",
    title: "Masuk sebagai Mahasiswa",
    body: "Lihat nilai yang sudah dipublikasikan beserta umpan balik, dan ajukan keberatan nilai.",
  },
];

export function RolePicker() {
  const router = useRouter();
  const [busy, setBusy] = useState<DemoRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enter(role: DemoRole, href: string) {
    setBusy(role);
    setError(null);
    try {
      await loginAs(role);
      router.push(href);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  return (
    <div className="mt-8 space-y-4">
      {error && (
        <Banner tone="danger" title="Gagal masuk.">
          {error}
        </Banner>
      )}
      <ul className="grid gap-4 sm:grid-cols-2">
        {ROLES.map((r) => (
          <li key={r.role}>
            <button
              type="button"
              onClick={() => enter(r.role, r.href)}
              disabled={busy !== null}
              aria-busy={busy === r.role || undefined}
              className="block h-full w-full rounded-md border border-border bg-surface p-5 text-left hover:border-primary hover:bg-primary-soft disabled:cursor-wait disabled:opacity-70"
            >
              <span className="flex items-center gap-2 text-h3 font-bold text-primary">
                {busy === r.role && <Icon icon={LoaderCircle} className="animate-spin" />}
                {r.title}
              </span>
              <span className="mt-1 block text-text-muted">{r.body}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
