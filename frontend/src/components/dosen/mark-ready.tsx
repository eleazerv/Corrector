"use client";
// Tombol "Soal sudah lengkap" -> PATCH /tests/{id} status 'ready'.
// Backend hanya mengizinkan upload lembar jawaban kalau ujian sudah 'ready' (minimal 1 soal, poin kriteria valid).

import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import { invalidate } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/panels";
import { useToast } from "@/components/ui/toast";
import { useExam } from "./exam-frame";

export function useMarkReady() {
  const { test, reload } = useExam();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markReady(onDone?: () => void) {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/tests/${test.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: test.name, max_score: test.max_score, test_type: test.test_type, status: "ready" }),
      });
      toast({ tone: "success", text: "Soal ditandai lengkap. Sekarang Anda bisa mengunggah lembar jawaban." });
      invalidate("/tests");
      reload();
      onDone?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  return { ready: test.status === "ready", markReady, saving, error };
}

/** Banner di halaman soal: draft -> ajakan tandai lengkap; ready -> konfirmasi. */
export function ReadyBanner({ onDone }: { onDone?: () => void }) {
  const { test } = useExam();
  const { ready, markReady, saving, error } = useMarkReady();
  if (test.questions.length === 0) return null;
  if (ready)
    return (
      <Banner tone="success" title="Soal sudah lengkap.">
        Masih bisa diubah sampai lembar jawaban pertama diunggah.
      </Banner>
    );
  return (
    <>
      <Banner
        tone="info"
        title="Sudah selesai menulis semua soal?"
        action={
          <Button variant="primary" icon={CircleCheck} loading={saving} loadingText="Menyimpan…" onClick={() => markReady(onDone)}>
            Soal sudah lengkap
          </Button>
        }
      >
        Klik tombol ini supaya lembar jawaban mahasiswa bisa mulai diunggah.
      </Banner>
      {error && (
        <Banner tone="danger" title="Belum bisa ditandai lengkap.">
          {error}
        </Banner>
      )}
    </>
  );
}
