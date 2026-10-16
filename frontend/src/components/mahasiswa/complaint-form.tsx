"use client";
// ajukan keberatan (POST /me/tests/{id}/complaints). Satu keberatan menunggu per soal.
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import type { MyTestDetail } from "@/lib/backend-types";
import { score } from "@/lib/format";
import { invalidate, useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Field, inputClass, textareaClass } from "@/components/ui/form";
import { Banner } from "@/components/ui/panels";
import { LoadError, Loading } from "@/components/ui/state";
import { useToast } from "@/components/ui/toast";

export function ComplaintForm({ examId }: { examId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const detail = useApi<MyTestDetail>(`/me/tests/${examId}`);
  const [answerId, setAnswerId] = useState(params.get("soal") ?? "");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (detail.loading && !detail.data) return <Loading />;
  if (detail.error || !detail.data) return <LoadError title="Data gagal dimuat." message={detail.error ?? ""} onRetry={detail.reload} />;
  const d = detail.data;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (text.trim().length < 10) {
      setError("Jelaskan alasan keberatan minimal 10 huruf.");
      return;
    }
    setError(null);
    setSaving(true);
    setServerError(null);
    try {
      await apiFetch(`/me/tests/${examId}/complaints`, {
        method: "POST",
        body: JSON.stringify({ test_answer_id: answerId || null, complaint: text.trim() }),
      });
      invalidate("/me");
      toast({ tone: "success", text: "Keberatan terkirim. Dosen akan memberi tanggapan." });
      router.push("/mahasiswa/keberatan");
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="doc-rule mb-6 pb-4 text-h1">Ajukan keberatan nilai</h1>
      <p className="mb-6 text-text-muted">
        {d.test_name} • nilai Anda {score(d.total_grade, d.max_score)}
      </p>
      <form onSubmit={submit} noValidate className="space-y-5 rounded-md border border-border bg-surface p-4 sm:p-6">
        {serverError && (
          <Banner tone="danger" title="Keberatan belum terkirim.">
            {serverError}
          </Banner>
        )}
        <Field id="kb-soal" label="Untuk soal">
          <select id="kb-soal" className={inputClass} value={answerId} onChange={(e) => setAnswerId(e.target.value)}>
            <option value="">Seluruh ujian</option>
            {d.answers
              .filter((a) => a.test_answer_id)
              .map((a) => (
                <option key={a.test_answer_id!} value={a.test_answer_id!}>
                  Soal {a.number} ({score(a.grade, a.max_points)})
                </option>
              ))}
          </select>
        </Field>
        <Field
          id="kb-text"
          label="Alasan keberatan"
          required
          error={error}
          help="Jelaskan bagian mana yang menurut Anda kurang tepat dinilai, dan mengapa."
        >
          <textarea id="kb-text" rows={6} className={textareaClass} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button onClick={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" icon={Send} loading={saving} loadingText="Mengirim…">
            Kirim keberatan
          </Button>
        </div>
      </form>
    </div>
  );
}
