"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState, type FormEvent } from "react";
import { homeFor, useAuth } from "@/lib/auth";
import { CONFIG_PROBLEM, MODE } from "@/lib/config";
import type { Role } from "@/lib/data";
import { Button } from "@/components/kit/button";
import { Field, FieldError, inputClass } from "@/components/kit/field";
import { Notice } from "@/components/kit/status";

function safeNext(next: string | undefined, role: Role) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return homeFor(role);
  return next.startsWith(homeFor(role)) ? next : homeFor(role);
}

function LiveForm() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Isi email dan kata sandi.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field id="email" label="Email">
        <input
          id="email"
          type="email"
          autoComplete="email"
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nama@kampus.ac.id"
        />
      </Field>
      <Field id="password" label="Kata sandi">
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <FieldError message={error} />
      <Button type="submit" variant="primary" busy={busy} className="w-full">
        {busy ? "Memeriksa akun..." : "Masuk"}
      </Button>
      <p className="text-sm text-pencil">Akun dibuat oleh admin sekolah. Lupa kata sandi? Hubungi admin sekolah Anda.</p>
    </form>
  );
}

function DemoForm() {
  const { signInDemo } = useAuth();
  const [busy, setBusy] = useState<Role | null>(null);
  const go = async (role: Role) => {
    setBusy(role);
    await signInDemo(role);
  };
  return (
    <div className="space-y-3">
      {CONFIG_PROBLEM ? (
        <Notice tone="attention" title="Pengaturan Supabase di .env.local belum benar">
          <p>{CONFIG_PROBLEM}</p>
          <p className="mt-1">Sampai diperbaiki, aplikasi berjalan dengan data contoh di browser ini.</p>
        </Notice>
      ) : (
        <Notice title="Login belum dikonfigurasi">
          <p>
            <code className="font-mono text-sm">NEXT_PUBLIC_SUPABASE_URL</code> dan{" "}
            <code className="font-mono text-sm">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> belum diisi, jadi aplikasi berjalan
            dengan data contoh di browser ini.
          </p>
        </Notice>
      )}
      <Button variant="primary" className="w-full" busy={busy === "teacher"} onClick={() => go("teacher")}>
        Coba sebagai dosen
      </Button>
      <Button className="w-full" busy={busy === "student"} onClick={() => go("student")}>
        Coba sebagai mahasiswa
      </Button>
    </div>
  );
}

export default function LoginPage(props: PageProps<"/masuk">) {
  const { next } = use(props.searchParams);
  const { state } = useAuth();
  const router = useRouter();
  const target = typeof next === "string" ? next : undefined;

  useEffect(() => {
    if (state.status === "signed_in") router.replace(safeNext(target, state.session.role));
  }, [state, router, target]);

  const problem = state.status === "signed_out" ? state.problem : undefined;

  return (
    <main className="mx-auto grid min-h-dvh max-w-5xl content-center gap-12 px-4 py-12 sm:px-6 md:grid-cols-[1.1fr_1fr] md:gap-16">
      <section aria-labelledby="judul">
        <p className="text-2xl font-bold tracking-tight">Corrector</p>
        <h1 id="judul" className="mt-8 text-[34px] leading-[1.15] sm:text-[42px]">
          AI menulis dengan pensil.
          <br />
          <span className="text-pen">Dosen memutuskan dengan pena.</span>
        </h1>
        <p className="mt-4 max-w-[48ch] text-pencil">
          Jawaban difoto, dibaca, lalu dinilai AI per kriteria rubrik. Setiap saran bisa Anda setujui atau ubah, dan hanya
          keputusan Anda yang sampai ke mahasiswa.
        </p>
      </section>

      <section aria-labelledby="masuk" className="self-center">
        <div className="rounded-lg border border-rule bg-surface p-6">
          <h2 id="masuk" className="mb-5 text-2xl">
            Masuk
          </h2>
          {problem && (
            <div className="mb-4">
              <Notice tone="attention" title="Akun belum bisa dipakai">
                {problem}
              </Notice>
            </div>
          )}
          {state.status === "loading" ? (
            <p className="text-pencil" role="status">
              Memeriksa sesi...
            </p>
          ) : MODE === "live" ? (
            <LiveForm />
          ) : (
            <DemoForm />
          )}
        </div>
      </section>
    </main>
  );
}
