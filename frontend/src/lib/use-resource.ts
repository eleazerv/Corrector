"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type StreamState } from "./api/index";
import type { ClassTestEvent } from "./api/types";

/*
 * Small fetch-and-cache hook. Data is keyed by a string such as "class-test:<id>". After a
 * mutation, call invalidate("class-test:<id>") and every mounted view of that data refetches.
 * Cached data stays on screen while a refetch runs, so returning to a page never flashes.
 */

const cache = new Map<string, unknown>();
const listeners = new Set<(prefix: string) => void>();

export function invalidate(...prefixes: string[]) {
  for (const prefix of prefixes) {
    for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
    listeners.forEach((fn) => fn(prefix));
  }
}

interface Result<T> {
  key: string | null;
  data?: T;
  error?: unknown;
}

export function useResource<T>(key: string | null, fetcher: () => Promise<T>) {
  const [result, setResult] = useState<Result<T>>(() => ({ key, data: key ? (cache.get(key) as T) : undefined }));
  const [version, setVersion] = useState(0);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetcherRef.current().then(
      (data) => {
        if (cancelled) return;
        cache.set(key, data);
        setResult({ key, data });
      },
      (error) => {
        if (!cancelled) setResult((r) => ({ key, data: r.key === key ? r.data : undefined, error }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, version]);

  useEffect(() => {
    if (!key) return;
    const onInvalidate = (prefix: string) => {
      if (key.startsWith(prefix)) setVersion((v) => v + 1);
    };
    listeners.add(onInvalidate);
    return () => {
      listeners.delete(onInvalidate);
    };
  }, [key]);

  const reload = useCallback(() => {
    setResult((r) => ({ key: r.key, data: r.data }));
    setVersion((v) => v + 1);
  }, []);

  const mutate = useCallback(
    (update: (prev: T | undefined) => T) => {
      setResult((r) => {
        const data = update(r.key === key ? r.data : undefined);
        if (key) cache.set(key, data);
        return { key, data };
      });
    },
    [key],
  );

  const current: Result<T> = result.key === key ? result : { key, data: key ? (cache.get(key) as T) : undefined };
  return {
    data: current.data,
    error: current.data === undefined ? current.error : undefined,
    /** A refetch failed while older data is still shown. */
    staleError: current.data !== undefined ? current.error : undefined,
    loading: key !== null && current.data === undefined && current.error === undefined,
    reload,
    mutate,
  };
}

/** Subscribes to a class test's event stream for as long as the component is mounted. */
export function useClassTestEvents(classTestId: string | null, onEvent: (e: ClassTestEvent) => void) {
  const [stream, setStream] = useState<StreamState>("connecting");
  const handler = useRef(onEvent);

  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    if (!classTestId) return;
    return api.subscribe(
      classTestId,
      (e) => handler.current(e),
      (s) => setStream(s),
    );
  }, [classTestId]);

  return stream;
}
