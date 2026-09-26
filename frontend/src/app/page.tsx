import Link from "next/link";

const ROLES = [
  {
    href: "/dosen",
    title: "Masuk sebagai Dosen",
    body: "Siapkan rubrik, unggah jawaban, tinjau saran AI, lalu publikasikan nilai.",
  },
  {
    href: "/mahasiswa",
    title: "Masuk sebagai Mahasiswa",
    body: "Lihat nilai yang sudah dipublikasikan beserta umpan balik, dan ajukan keberatan nilai.",
  },
];

export default function Home() {
  return (
    <main id="konten" className="mx-auto flex min-h-dvh max-w-[880px] flex-col justify-center px-4 py-12 sm:px-8">
      <header className="doc-rule pb-5">
        <p className="font-heading text-h2 text-primary">Corrector</p>
        <h1 className="mt-4 text-h1 md:text-display">Penilaian ujian: AI menyarankan, dosen memutuskan.</h1>
        <p className="mt-3 max-w-[68ch] text-text-muted">
          Prototipe ini belum memakai akun. Pilih peran untuk melihat tampilan masing-masing; semua data di dalamnya adalah
          data contoh.
        </p>
      </header>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {ROLES.map((r) => (
          <li key={r.href}>
            <Link
              href={r.href}
              className="block h-full rounded-md border border-border bg-surface p-5 hover:border-primary hover:bg-primary-soft"
            >
              <span className="text-h3 font-bold text-primary">{r.title}</span>
              <span className="mt-1 block text-text-muted">{r.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
