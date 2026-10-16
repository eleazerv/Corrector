import { RolePicker } from "@/components/auth/role-picker";

export default function Home() {
  return (
    <main id="konten" className="mx-auto flex min-h-dvh max-w-[880px] flex-col justify-center px-4 py-12 sm:px-8">
      <header className="doc-rule pb-5">
        <p className="font-heading text-h2 text-primary">Corrector</p>
        <h1 className="mt-4 text-h1 md:text-display">Penilaian ujian: AI menyarankan, dosen memutuskan.</h1>
        <p className="mt-3 max-w-[68ch] text-text-muted">
          Pilih peran untuk masuk otomatis dengan akun demo. Data diambil dari server; halaman yang belum tersambung masih
          memakai data contoh.
        </p>
      </header>
      <RolePicker />
    </main>
  );
}
