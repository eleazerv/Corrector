import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MODE, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

let client: SupabaseClient | null = null;

/**
 * Browser Supabase client. Null in demo mode. Used for login, and for the class, exam and rubric
 * tables that the FastAPI backend does not serve yet (see lib/api/db.ts). Row-level security
 * in the database decides what the signed-in user may read and write.
 */
export function supabase(): SupabaseClient | null {
  if (MODE !== "live") return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
