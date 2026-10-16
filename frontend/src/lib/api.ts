// apiFetch sekarang mengirim token, prefix /api/v1, refresh sekali saat 401,
// dan melempar ApiError berisi pesan dari backend. Signature lama apiFetch<T>(path, init) tetap.
import { getAccessToken, refreshSession } from "./auth";
import type { ApiErrorBody } from "./backend-types";
import { setSession } from "./session";

// base tanpa "/" di akhir dan tanpa "/api/v1" (kalau .env.local terlanjur menulisnya, dibuang di sini)
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "").replace(/\/api\/v1$/, "");
const API_PREFIX = "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// dipakai juga untuk EventSource (SSE) yang tidak lewat apiFetch
export function apiUrl(path: string) {
  return url(path);
}

function url(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_URL}${path.startsWith(API_PREFIX) ? "" : API_PREFIX}${path}`;
}

async function send(path: string, init: RequestInit | undefined, token: string | null) {
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  return fetch(url(path), {
    ...init,
    headers: {
      ...(isForm || !init?.body ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await send(path, init, await getAccessToken());
  if (res.status === 401) {
    const fresh = await refreshSession();
    if (fresh) res = await send(path, init, fresh);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
    if (res.status === 401) setSession(null);
    throw new ApiError(
      res.status,
      body.error?.code ?? "HTTP_ERROR",
      body.error?.message ?? `Permintaan gagal (${res.status}).`,
      body.error?.details,
    );
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

/** Pesan error yang aman ditampilkan ke user. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof TypeError) return "Tidak bisa terhubung ke server. Pastikan backend berjalan.";
  return e instanceof Error ? e.message : "Terjadi kesalahan.";
}
