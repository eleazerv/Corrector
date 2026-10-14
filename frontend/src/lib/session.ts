// Penyimpanan sesi login (token Supabase + profil dari /auth/me).
// Disimpan di modul (bukan React state) supaya apiFetch, yang bukan hook, bisa membaca token.
// localStorage hanya untuk kenyamanan: kalau kosong/diblokir, user cukup klik peran lagi.

import type { Me } from "./backend-types";

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** epoch ms saat access token kedaluwarsa */
  expiresAt: number;
  me: Me | null;
}

const KEY = "joints.session";
let current: Session | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function load(): Session | null {
  if (loaded) return current;
  loaded = true;
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
    current = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    current = null;
  }
  return current;
}

export function getSession(): Session | null {
  return load();
}

export function setSession(next: Session | null): void {
  current = next;
  loaded = true;
  try {
    if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage diblokir: sesi tetap hidup di memori sampai reload */
  }
  listeners.forEach((l) => l());
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
