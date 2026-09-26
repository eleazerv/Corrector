import Link from "next/link";

export default function NotFound() {
  return (
    <main id="konten" className="mx-auto max-w-[680px] px-4 py-16 sm:px-8">
      <h1 className="text-h1">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-text-muted">Alamat yang Anda buka tidak ada. Periksa tautannya, atau kembali ke halaman awal.</p>
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">
        Kembali ke halaman awal
      </Link>
    </main>
  );
}
