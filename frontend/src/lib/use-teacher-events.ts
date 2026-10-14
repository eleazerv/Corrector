"use client";
// SSE notifikasi dosen (GET /notifications/events).
// Worker mengirim "colekan" lewat Redis; di sini cukup memuat ulang data terkait (invalidate).
// EventSource tidak bisa kirim header -> token lewat query ?access_token=. Token hanya dicek saat
// tersambung; kalau putus, sambung ulang dengan token terbaru (getAccessToken refresh otomatis).

import { useEffect, useRef } from "react";
import { apiUrl } from "./api";
import { getAccessToken } from "./auth";
import { invalidate } from "./use-api";

export interface TeacherEvent {
  event: "notification" | "traits_changed" | string;
  kind?: string;
  title?: string;
  conflict_id?: string;
  trait_id?: string;
}

export function useTeacherEvents(enabled: boolean, onEvent?: (e: TeacherEvent) => void) {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let failures = 0;

    async function connect() {
      const token = await getAccessToken();
      if (stopped || !token) return;
      es = new EventSource(apiUrl(`/notifications/events?access_token=${encodeURIComponent(token)}`));
      es.onopen = () => {
        failures = 0;
      };
      es.onmessage = (m) => {
        let data: TeacherEvent;
        try {
          data = JSON.parse(m.data);
        } catch {
          return;
        }
        if (data.event === "notification") invalidate("/notifications");
        if (data.event === "notification" || data.event === "traits_changed") invalidate("/traits");
        handler.current?.(data);
      };
      es.onerror = () => {
        es?.close();
        if (stopped) return;
        failures += 1;
        timer = setTimeout(connect, Math.min(30_000, 3_000 * failures)); // 3s, 6s, ... maks 30s
      };
    }

    connect();
    return () => {
      stopped = true;
      es?.close();
      clearTimeout(timer);
    };
  }, [enabled]);
}
