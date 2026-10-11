"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api/index";
import { setTokenGetter } from "./api/http";
import type { Role } from "./api/types";
import { MODE } from "./config";
import { supabase } from "./supabase";

export interface Session {
  role: Role;
  name: string;
  email: string | null;
}

type AuthState =
  | { status: "loading" }
  | { status: "signed_out"; problem?: string }
  | { status: "signed_in"; session: Session };

interface AuthApi {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signInDemo: (role: Role) => Promise<void>;
  signOut: () => Promise<void>;
}

const DEMO_KEY = "corrector-demo-session";
const AuthContext = createContext<AuthApi | null>(null);

/**
 * Same priority as RESOLVE_ROLE_SQL in backend/core/deps.py. The backend has no /me endpoint
 * yet, so this reads the profile tables through Supabase (RLS: a user can read their own row).
 */
async function resolveProfile(userId: string, email: string | null): Promise<Session> {
  const sb = supabase()!;
  const admin = await sb.from("school_admins").select("id").eq("user_id", userId).eq("is_active", true).maybeSingle();
  if (admin.data) return { role: "school_admin", name: email ?? "Admin sekolah", email };
  const teacher = await sb.from("teachers").select("name").eq("user_id", userId).maybeSingle();
  if (teacher.data) return { role: "teacher", name: teacher.data.name ?? email ?? "Dosen", email };
  const student = await sb.from("students").select("name").eq("user_id", userId).maybeSingle();
  if (student.data) return { role: "student", name: student.data.name ?? email ?? "Mahasiswa", email };
  const failed = admin.error ?? teacher.error ?? student.error;
  throw new Error(
    failed
      ? `Profil akun tidak bisa dibaca (${failed.message}). Periksa kebijakan RLS tabel teachers dan students.`
      : "Akun ini belum diaktifkan sebagai dosen atau mahasiswa. Hubungi admin sekolah.",
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const sb = supabase();

    if (!sb) {
      const restore = async () => {
        let role: Role | null = null;
        try {
          role = sessionStorage.getItem(DEMO_KEY) as Role | null;
        } catch {
          role = null;
        }
        if (role !== "teacher" && role !== "student") {
          if (!cancelled) setState({ status: "signed_out" });
          return;
        }
        const me = await api.demoMe(role);
        if (!cancelled) setState({ status: "signed_in", session: { role: me.role, name: me.name, email: me.email } });
      };
      void restore();
      return () => {
        cancelled = true;
      };
    }

    setTokenGetter(async () => (await sb.auth.getSession()).data.session?.access_token ?? null);

    const apply = async (user: { id: string; email?: string } | null) => {
      if (!user) {
        if (!cancelled) setState({ status: "signed_out" });
        return;
      }
      try {
        const session = await resolveProfile(user.id, user.email ?? null);
        if (!cancelled) setState({ status: "signed_in", session });
      } catch (err) {
        if (!cancelled) setState({ status: "signed_out", problem: err instanceof Error ? err.message : String(err) });
      }
    };

    void sb.auth.getSession().then(({ data }) => apply(data.session?.user ?? null));
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void apply(session?.user ?? null);
      }
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = supabase();
    if (!sb) throw new Error("Login Supabase belum dikonfigurasi.");
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(
        error.message === "Invalid login credentials" ? "Email atau kata sandi salah." : `Gagal masuk: ${error.message}`,
      );
    }
  }, []);

  const signInDemo = useCallback(async (role: Role) => {
    const me = await api.demoMe(role);
    try {
      sessionStorage.setItem(DEMO_KEY, role);
    } catch {
      // the session still works for this page view
    }
    setState({ status: "signed_in", session: { role: me.role, name: me.name, email: me.email } });
  }, []);

  const signOut = useCallback(async () => {
    const sb = supabase();
    if (sb) await sb.auth.signOut();
    try {
      sessionStorage.removeItem(DEMO_KEY);
    } catch {
      // nothing stored
    }
    setState({ status: "signed_out" });
  }, []);

  const value = useMemo(() => ({ state, signIn, signInDemo, signOut }), [state, signIn, signInDemo, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function homeFor(role: Role) {
  return role === "student" ? "/mahasiswa" : "/dosen";
}

export { MODE };
