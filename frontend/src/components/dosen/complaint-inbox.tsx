"use client";
// Kotak masuk keberatan nilai dari backend (GET /complaints, POST /complaints/{id}/resolve).
// Satu keberatan dibuka penuh: isi keberatan, ringkasan & saran AI, lalu dua pilihan: Terima atau Tolak.

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Check, ExternalLink, Inbox, X } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import type { ComplaintStatus, TeacherComplaint } from "@/lib/backend-types";
import { dateTime, num, score } from "@/lib/format";
import { invalidate, useApi } from "@/lib/use-api";
import { ComplaintBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, inputClass, textareaClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Container, PageHeader } from "@/components/ui/page";
import { Banner, EmptyState, InternalPanel } from "@/components/ui/panels";
import { LoadError, Loading } from "@/components/ui/state";
import { Tabs, panelId, tabId } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

export function ComplaintInbox() {
  const [status, setStatus] = useState<ComplaintStatus>("pending");
  const list = useApi<{ items: TeacherComplaint[]; pending: number }>(`/complaints?status=${status}`);
  const [openId, setOpenId] = useState<string | null>(null);
  const items = list.data?.items ?? [];
  const open = items.find((c) => c.id === openId) ?? items[0] ?? null;

  return (
    <Container>
      <PageHeader crumbs={[{ href: "/dosen", label: "Beranda" }, { label: "Keberatan Nilai" }]} title="Keberatan Nilai" />
      <Tabs
        group="keberatan"
        label="Status keberatan"
        value={status}
        onChange={(v) => {
          setStatus(v as ComplaintStatus);
          setOpenId(null);
        }}
        tabs={[
          { id: "pending", label: "Menunggu keputusan" },
          { id: "accepted", label: "Diterima" },
          { id: "rejected", label: "Ditolak" },
        ]}
      />
      <div id={panelId("keberatan", status)} role="tabpanel" aria-labelledby={tabId("keberatan", status)} className="pt-6">
        {list.loading && !list.data ? (
          <Loading text="Memuat keberatan…" />
        ) : list.error ? (
          <LoadError title="Keberatan gagal dimuat." message={list.error} onRetry={list.reload} />
        ) : items.length === 0 ? (
          <EmptyState icon={Inbox} title={status === "pending" ? "Tidak ada keberatan yang menunggu." : "Belum ada."}>
            Keberatan dari mahasiswa muncul di sini setelah nilai diumumkan.
          </EmptyState>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <ul className="self-start divide-y divide-border rounded-md border border-border bg-surface">
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(c.id)}
                    aria-current={open?.id === c.id ? "true" : undefined}
                    className={`w-full px-4 py-3 text-left ${open?.id === c.id ? "bg-primary-soft" : "hover:bg-bg"}`}
                  >
                    <span className="block font-semibold">{c.student_name}</span>
                    <span className="block text-small text-text-muted">
                      {c.test_name}
                      {c.question_number ? ` • Soal ${c.question_number}` : " • Seluruh ujian"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {open && <ComplaintDetail key={open.id} c={open} onDone={() => { list.reload(); invalidate("/complaints"); setOpenId(null); }} />}
          </div>
        )}
      </div>
    </Container>
  );
}

function ComplaintDetail({ c, onDone }: { c: TeacherComplaint; onDone: () => void }) {
  const toast = useToast();
  const [decision, setDecision] = useState<"accepted" | "rejected" | null>(null);
  const [newGrade, setNewGrade] = useState("");
  const [response, setResponse] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const g = newGrade.trim() === "" ? null : Number(newGrade.replace(",", "."));
    if (decision === "accepted" && g !== null && (Number.isNaN(g) || g < 0 || (c.max_points !== null && g > c.max_points)))
      errs.grade = `Isi angka antara 0 dan ${num(c.max_points)}, atau kosongkan kalau nilai tidak berubah.`;
    if (response.trim().length < 3) errs.response = "Tulis tanggapan untuk mahasiswa.";
    setErrors(errs);
    if (Object.keys(errs).length || !decision) return;
    setSaving(true);
    setServerError(null);
    try {
      await apiFetch(`/complaints/${c.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ status: decision, teacher_response: response.trim(), new_grade: decision === "accepted" ? g : null }),
      });
      toast({ tone: "success", text: decision === "accepted" ? "Keberatan diterima." : "Keberatan ditolak." });
      onDone();
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="space-y-5 rounded-md border border-border bg-surface p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h2">{c.student_name}</h2>
          <p className="text-text-muted">
            NIM {c.nim} • {c.test_name}
            {c.question_number ? ` • Soal ${c.question_number}` : ""}
          </p>
        </div>
        <ComplaintBadge status={c.status} />
      </header>

      {c.question_number !== null && (
        <p>
          Nilai saat ini: <b className="tabular">{score(c.current_grade, c.max_points)}</b>
        </p>
      )}

      <section>
        <h3 className="mb-1 font-semibold">Isi keberatan mahasiswa</h3>
        <p className="whitespace-pre-wrap rounded-md bg-bg px-4 py-3">{c.complaint}</p>
      </section>

      {(c.ai_summary || c.ai_recommendation) && (
        <InternalPanel title="Bantuan dari AI">
          {c.ai_summary && (
            <p>
              <b>Ringkasan:</b> {c.ai_summary}
            </p>
          )}
          {c.ai_recommendation && (
            <p className="mt-2">
              <b>Saran:</b> {c.ai_recommendation}
            </p>
          )}
        </InternalPanel>
      )}

      <Link
        href={`/dosen/ujian/${c.class_test_id}/review?lembar=${c.student_test_id}`}
        className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline underline-offset-4"
      >
        Lihat lembar jawabannya <Icon icon={ExternalLink} size={16} />
      </Link>

      {c.status !== "pending" ? (
        <Banner tone={c.status === "accepted" ? "success" : "info"} title={`Sudah diputuskan ${c.resolved_at ? dateTime(c.resolved_at) : ""}`}>
          Tanggapan Anda: {c.teacher_response}
        </Banner>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4 border-t border-border pt-5">
          {serverError && (
            <Banner tone="danger" title="Keputusan belum tersimpan.">
              {serverError}
            </Banner>
          )}
          <fieldset>
            <legend className="mb-2 font-semibold">Keputusan Anda</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant={decision === "accepted" ? "primary" : "secondary"} icon={Check} onClick={() => setDecision("accepted")} aria-pressed={decision === "accepted"}>
                Terima keberatan
              </Button>
              <Button variant={decision === "rejected" ? "danger" : "secondary"} icon={X} onClick={() => setDecision("rejected")} aria-pressed={decision === "rejected"}>
                Tolak keberatan
              </Button>
            </div>
          </fieldset>
          {decision === "accepted" && c.question_number !== null && (
            <div className="max-w-[240px]">
              <Field id="kb-grade" label={`Nilai baru soal ini (0 – ${num(c.max_points)})`} error={errors.grade} help="Kosongkan kalau nilainya tidak berubah.">
                <input id="kb-grade" inputMode="decimal" className={inputClass} value={newGrade} onChange={(e) => setNewGrade(e.target.value)} />
              </Field>
            </div>
          )}
          {decision && (
            <>
              <Field id="kb-resp" label="Tanggapan untuk mahasiswa" required error={errors.response} help="Mahasiswa akan membaca tanggapan ini.">
                <textarea id="kb-resp" rows={3} className={textareaClass} value={response} onChange={(e) => setResponse(e.target.value)} />
              </Field>
              <div className="flex justify-end">
                <Button type="submit" variant="primary" loading={saving} loadingText="Menyimpan…">
                  Simpan keputusan
                </Button>
              </div>
            </>
          )}
        </form>
      )}
    </article>
  );
}
