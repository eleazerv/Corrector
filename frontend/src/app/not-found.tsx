import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-3xl">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-pencil">Alamat ini tidak ada. Periksa tautannya, atau kembali ke halaman awal.</p>
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center underline decoration-rule-strong underline-offset-4">
        Ke halaman awal
      </Link>
    </main>
  );
}
