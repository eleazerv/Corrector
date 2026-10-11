export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

/** Why the Supabase settings can't be used, or null when they are fine (or deliberately empty). */
function supabaseProblem(): string | null {
  if (!SUPABASE_URL && !SUPABASE_ANON_KEY) return null;
  if (!SUPABASE_URL) return "NEXT_PUBLIC_SUPABASE_URL kosong, padahal NEXT_PUBLIC_SUPABASE_ANON_KEY sudah diisi.";
  if (!SUPABASE_ANON_KEY) return "NEXT_PUBLIC_SUPABASE_ANON_KEY kosong, padahal NEXT_PUBLIC_SUPABASE_URL sudah diisi.";
  try {
    const u = new URL(SUPABASE_URL);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
  } catch {
    return `NEXT_PUBLIC_SUPABASE_URL bukan URL yang valid ("${SUPABASE_URL}"). Contoh yang benar: https://abcdefgh.supabase.co`;
  }
  if (SUPABASE_ANON_KEY.startsWith("<")) return "NEXT_PUBLIC_SUPABASE_ANON_KEY masih berisi teks contoh, belum diganti kunci asli.";
  return null;
}

export const CONFIG_PROBLEM = supabaseProblem();

/**
 * "live": Supabase login and real calls for every endpoint the backend has.
 * "demo": no usable Supabase settings, everything runs on the in-browser mock server.
 */
export const MODE: "live" | "demo" = SUPABASE_URL && SUPABASE_ANON_KEY && !CONFIG_PROBLEM ? "live" : "demo";
