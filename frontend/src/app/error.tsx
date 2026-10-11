"use client";

import Link from "next/link";
import { Button } from "@/components/kit/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-3xl">Halaman ini gagal ditampilkan</h1>
      <p className="mt-2 text-pencil">
        Ada kesalahan di tampilan, bukan di data Anda. Nilai dan rubrik tidak berubah. Muat ulang halaman, atau kembali ke
        halaman awal.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={reset}>
          Muat ulang halaman
        </Button>
        <Link href="/" className="inline-flex min-h-11 items-center underline decoration-rule-strong underline-offset-4">
          Ke halaman awal
        </Link>
      </div>
    </main>
  );
}
