"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="konten" className="mx-auto max-w-[680px] px-4 py-16 sm:px-8">
      <h1 className="text-h1">Halaman gagal dimuat</h1>
      <p className="mt-2 text-text-muted">
        Terjadi kesalahan saat menampilkan halaman ini. Data Anda tidak berubah. Coba muat ulang; jika tetap gagal, kembali
        ke Dashboard.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="primary" onClick={reset}>
          Coba lagi
        </Button>
        <Link href="/" className="inline-flex min-h-11 items-center px-2 font-semibold text-primary underline underline-offset-4">
          Kembali ke halaman awal
        </Link>
      </div>
    </main>
  );
}
