// login demo 1 klik ke Supabase Auth (REST, tanpa library tambahan).
// Tombol "Masuk sebagai Dosen/Mahasiswa" memanggil loginAs(); akun demo diambil dari env.

import type { Me } from "./backend-types";
import { getSession, setSession, type Session } from "./session";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export type DemoRole = "dosen" | "mahasiswa";

const DEMO_ACCOUNTS: Record<DemoRole, { email: string; role: Me["role"] }> = {
  dosen: { email: process.env.NEXT_PUBLIC_DEMO_DOSEN_EMAIL ?? "dosen01@und.joints.test", role: "teacher" },
  mahasiswa: { email: process.env.NEXT_PUBLIC_DEMO_MAHASISWA_EMAIL ?? "mhs001@und.joints.test", role: "student" },
};
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "Joints123!";
const REFRESH_MARGIN_MS = 60_000;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function tokenRequest(grant: "password" | "refresh_token", body: object): Promise<TokenResponse> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error_description ?? detail.msg ?? `Login gagal (${res.status}).`);
  }
  return res.json();
}

function toSession(t: TokenResponse, me: Me | null): Session {
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + t.expires_in * 1000,
    me,
  };
}

/** Login akun demo, lalu ambil profil dari backend (/auth/me). */
export async function loginAs(role: DemoRole): Promise<Me> {
  const account = DEMO_ACCOUNTS[role];
  const token = await tokenRequest("password", { email: account.email, password: DEMO_PASSWORD });
  setSession(toSession(token, null));
  // import dinamis supaya tidak ada import melingkar auth <-> api
  const { apiFetch } = await import("./api");
  const me = await apiFetch<Me>("/auth/me");
  if (me.role !== account.role) {
    setSession(null);
    throw new Error(`Akun demo ${account.email} bukan ${role}.`);
  }
  setSession({ ...getSession()!, me });
  return me;
}

export function logout(): void {
  setSession(null);
}

let refreshing: Promise<string | null> | null = null;

/** Tukar refresh token. Dipakai bersama supaya request paralel tidak refresh berkali-kali. */
export function refreshSession(): Promise<string | null> {
  if (refreshing) return refreshing;
  const s = getSession();
  if (!s) return Promise.resolve(null);
  refreshing = tokenRequest("refresh_token", { refresh_token: s.refreshToken })
    .then((t) => {
      setSession(toSession(t, getSession()?.me ?? s.me));
      return t.access_token;
    })
    .catch(() => {
      setSession(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Access token yang masih berlaku (refresh otomatis 1 menit sebelum kedaluwarsa). */
export async function getAccessToken(): Promise<string | null> {
  const s = getSession();
  if (!s) return null;
  if (s.expiresAt - Date.now() > REFRESH_MARGIN_MS) return s.accessToken;
  return refreshSession();
}
