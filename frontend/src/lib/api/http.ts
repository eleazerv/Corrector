import { API_URL } from "@/lib/config";
import { ApiError } from "./errors";

type TokenGetter = () => Promise<string | null>;

let getToken: TokenGetter = async () => null;

/** The auth provider registers how to read the current Supabase access token. */
export function setTokenGetter(fn: TokenGetter) {
  getToken = fn;
}

export async function currentToken() {
  return getToken();
}

async function parseError(res: Response): Promise<ApiError> {
  const requestId = res.headers.get("X-Request-Id");
  try {
    const body = await res.json();
    const e = body?.error;
    if (e && typeof e.message === "string") {
      return new ApiError(res.status, e.code ?? "ERROR", e.message, e.details, requestId);
    }
    // FastAPI's own shape: {"detail": ...}
    if (body?.detail) return new ApiError(res.status, "ERROR", String(body.detail), body.detail, requestId);
  } catch {
    // body was not JSON
  }
  return new ApiError(res.status, "HTTP_ERROR", res.statusText, undefined, requestId);
}

type Query = Record<string, string | number | boolean | null | undefined>;

/** "/x" + {a: 1, b: null} -> "/x?a=1". Null and undefined are left out. */
export function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== null && v !== undefined) qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

async function send(method: string, path: string, body?: BodyInit | object): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body; // the browser sets the multipart boundary
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, "NETWORK", "Server tidak bisa dihubungi.");
  }
  if (!res.ok) throw await parseError(res);
  return res;
}

export async function request<T>(method: string, path: string, body?: BodyInit | object): Promise<T> {
  const res = await send(method, path, body);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** For file responses (CSV export). The filename comes from Content-Disposition when present. */
export async function requestFile(path: string, fallbackName: string): Promise<{ blob: Blob; filename: string }> {
  const res = await send("GET", path);
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? fallbackName;
  return { blob: await res.blob(), filename: name };
}
