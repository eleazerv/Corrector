"use client";
// state data dari backend per halaman (loading / error / data / reload).
// Pakai: const { data, loading, error, reload } = useApi<ListResponse<ClassItem>>("/classes");
// path = null -> tidak fetch (mis. menunggu id).

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { apiFetch, errorMessage } from "./api";
import { getSession, subscribeSession } from "./session";

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (updater: T | null | ((prev: T | null) => T | null)) => void;
}

// Invalidasi: setelah POST/PATCH, panggil invalidate("/classes") supaya semua useApi yang
// path-nya diawali "/classes" memuat ulang (mis. tabel kelas di dashboard & halaman Kelas).
const invalidators = new Set<(prefix: string) => void>();

export function invalidate(prefix: string): void {
  invalidators.forEach((fn) => fn(prefix));
}

interface Result<T> {
  key: string | null; // path#tick yang menghasilkan hasil ini
  path: string | null;
  data: T | null;
  error: string | null;
}

export function useApi<T>(path: string | null): ApiState<T> {
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState<Result<T>>({ key: null, path: null, data: null, error: null });
  const key = path ? `${path}#${tick}` : null;

  useEffect(() => {
    if (!path || !key) return;
    let cancelled = false;
    apiFetch<T>(path)
      .then((data) => !cancelled && setRes({ key, path, data, error: null }))
      .catch((e) => !cancelled && setRes((r) => ({ key, path, data: r.path === path ? r.data : null, error: errorMessage(e) })));
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!path) return;
    const fn = (prefix: string) => {
      if (path.startsWith(prefix)) setTick((t) => t + 1);
    };
    invalidators.add(fn);
    return () => {
      invalidators.delete(fn);
    };
  }, [path]);

  const setData = useCallback(
    (updater: T | null | ((prev: T | null) => T | null)) =>
      setRes((r) => ({ ...r, data: typeof updater === "function" ? (updater as (p: T | null) => T | null)(r.data) : updater })),
    [],
  );

  // data lama tetap ditampilkan selama reload path yang sama (tidak berkedip); path lain -> null
  const samePath = res.path === path;
  return {
    data: samePath ? res.data : null,
    loading: key !== null && res.key !== key,
    error: samePath && res.key === key ? res.error : null,
    reload,
    setData,
  };
}

/** Sesi login reaktif (komponen ikut render ulang saat login/logout/refresh). */
export function useSession() {
  return useSyncExternalStore(subscribeSession, getSession, () => null);
}

const noop = () => () => {};
/** true setelah komponen tampil di browser (false saat render server). */
export function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}
