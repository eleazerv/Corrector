"use client";
//  progres 1 ujian (GET /class-tests/{id}/progress), otomatis diperbarui
// tiap 5 detik selama masih ada lembar yang sedang dibaca/dinilai AI.
import { useEffect } from "react";
import type { Progress } from "./backend-types";
import { BUSY_STATUSES } from "./format";
import { useApi } from "./use-api";

const POLL_MS = 5000;

export function useProgress(classTestId: string) {
  const state = useApi<Progress>(`/class-tests/${classTestId}/progress`);
  const busy = (state.data?.items ?? []).some((i) => BUSY_STATUSES.includes(i.status));
  const { reload } = state;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(reload, POLL_MS);
    return () => clearInterval(t);
  }, [busy, reload]);
  return { ...state, busy };
}
