"use client";
// Bahasa dibuat sederhana: trait = "kebiasaan menilai Anda" yang dipelajari AI dari nilai yang Anda ubah.

import { useState, type FormEvent } from "react";
import { NotebookPen, Pencil, Plus, Scale } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import type { ListResponse, Subject, Trait, TraitConflict, TraitEvidence } from "@/lib/backend-types";
import { date, num } from "@/lib/format";
import { invalidate, useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Toggle, inputClass, textareaClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Container, PageHeader } from "@/components/ui/page";
import { Banner, EmptyState } from "@/components/ui/panels";
import { LoadError, Loading } from "@/components/ui/state";
import { useToast } from "@/components/ui/toast";

const DIRECTION = { lenient: "Lebih longgar", stricter: "Lebih ketat" } as const;

export default function CatatanPage() {
  const subjects = useApi<ListResponse<Subject>>("/subjects");
  const [subjectId, setSubjectId] = useState("");
  const traits = useApi<{ items: Trait[] }>(`/traits?include_inactive=true${subjectId ? `&subject_id=${subjectId}` : ""}`);
  const conflicts = useApi<{ items: TraitConflict[] }>("/traits/conflicts?status=pending");
  const [creating, setCreating] = useState(false);
  const subjectName = (id: string) => subjects.data?.items.find((s) => s.id === id)?.name ?? "";

  return (
    <Container>
      <PageHeader
        crumbs={[{ href: "/dosen", label: "Beranda" }, { label: "Catatan Penilaian" }]}
        title="Catatan Penilaian"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            Tulis Catatan
          </Button>
        }
      />
      <div className="mb-6">
        <Banner tone="info">
          Setiap kali Anda mengubah nilai dari AI dan menulis alasannya, AI mencatat kebiasaan menilai Anda di sini. Catatan ini
          dipakai saat AI menilai ujian berikutnya di mata kuliah yang sama. Matikan catatan yang tidak sesuai.
        </Banner>
      </div>

      {(conflicts.data?.items ?? []).length > 0 && (
        <section aria-labelledby="konflik" className="mb-8 space-y-4">
          <h2 id="konflik" className="text-h2">
            Perlu keputusan Anda
          </h2>
          {conflicts.data!.items.map((c) => (
            <ConflictCard
              key={c.id}
              c={c}
              onDone={() => {
                conflicts.reload();
                traits.reload();
                invalidate("/notifications");
              }}
            />
          ))}
        </section>
      )}

      <div className="mb-4 max-w-sm">
        <Field id="filter-subject" label="Mata kuliah">
          <select id="filter-subject" className={inputClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Semua mata kuliah</option>
            {subjects.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {traits.loading && !traits.data ? (
        <Loading text="Memuat catatan…" />
      ) : traits.error ? (
        <LoadError title="Catatan gagal dimuat." message={traits.error} onRetry={traits.reload} />
      ) : (traits.data?.items ?? []).length === 0 ? (
        <EmptyState icon={NotebookPen} title="Belum ada catatan penilaian.">
          Catatan muncul setelah Anda mengubah nilai dari AI di halaman Periksa Nilai, atau Anda bisa menulisnya sendiri.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {traits.data!.items.map((t) => (
            <TraitCard
              key={t.id}
              t={t}
              subject={subjectName(t.subject_id)}
              onChanged={(patch) =>
                traits.setData((prev) => prev && { items: prev.items.map((x) => (x.id === t.id ? { ...x, ...patch } : x)) })
              }
            />
          ))}
        </ul>
      )}

      <CreateTraitModal
        open={creating}
        subjects={subjects.data?.items ?? []}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          traits.reload();
        }}
      />
    </Container>
  );
}

function TraitCard({ t, subject, onChanged }: { t: Trait; subject: string; onChanged: (patch: Partial<Trait>) => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(t.canonical_text);
  const [saving, setSaving] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const evidence = useApi<{ items: TraitEvidence[] }>(showEvidence ? `/traits/${t.id}/evidences` : null);

  async function patch(body: Partial<Trait>, ok: string) {
    setSaving(true);
    try {
      await apiFetch(`/traits/${t.id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast({ tone: "success", text: ok });
      setEditing(false);
      onChanged(body);
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <li
      className={`overflow-hidden rounded-md border bg-surface ${
        t.is_active ? "border-border" : "border-dashed border-border-strong bg-bg"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={t.direction === "lenient" ? "success" : "warning"}>{DIRECTION[t.direction] ?? t.direction}</Badge>
          <Badge tone="neutral">{t.source === "manual" ? "Ditulis sendiri" : "Dipelajari AI"}</Badge>
          {subject && <span className="text-small text-text-muted">{subject}</span>}
        </div>
        <Toggle
          checked={t.is_active}
          disabled={saving}
          label="Dipakai AI saat menilai"
          onText="Dipakai AI"
          offText="Tidak dipakai"
          onChange={(v) => patch({ is_active: v }, v ? "Catatan diaktifkan." : "Catatan dimatikan. AI tidak memakainya lagi.")}
        />
      </div>

      <div className="px-4 py-4 sm:px-5">
        {editing ? (
          <div className="space-y-2">
            <label htmlFor={`tr-${t.id}`} className="sr-only">
              Teks catatan
            </label>
            <textarea id={`tr-${t.id}`} rows={3} className={textareaClass} value={text} onChange={(e) => setText(e.target.value)} />
            <p className="text-small text-text-muted">Boleh diperjelas, tapi jangan dibalik maknanya.</p>
            <div className="flex gap-2">
              <Button variant="primary" compact loading={saving} onClick={() => patch({ canonical_text: text.trim() }, "Catatan diperbarui.")}>
                Simpan
              </Button>
              <Button
                compact
                onClick={() => {
                  setEditing(false);
                  setText(t.canonical_text);
                }}
              >
                Batal
              </Button>
            </div>
          </div>
        ) : (
          <p className={`text-h3 ${t.is_active ? "" : "text-text-muted"}`}>{t.canonical_text}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-bg px-4 py-1 sm:px-5">
        <p className="text-small text-text-muted">
          {t.source === "manual" ? "Ditulis sendiri" : `Dari ${num(t.evidence_count)} kali Anda mengubah nilai`} • terakhir{" "}
          {date(t.last_seen ?? t.updated_at)}
        </p>
        <div className="flex flex-wrap items-center">
          {t.source !== "manual" && (
            <Button compact variant="tertiary" onClick={() => setShowEvidence((v) => !v)}>
              {showEvidence ? "Sembunyikan asal-usul" : "Dari mana catatan ini?"}
            </Button>
          )}
          {!editing && (
            <Button compact variant="tertiary" icon={Pencil} onClick={() => setEditing(true)}>
              Ubah teks
            </Button>
          )}
        </div>
      </div>

      {showEvidence && (
        <div className="border-t border-border px-4 py-3 text-small sm:px-5">
          {evidence.loading ? (
            "Memuat…"
          ) : (evidence.data?.items ?? []).length === 0 ? (
            "Tidak ada data."
          ) : (
            <ul className="space-y-2">
              {evidence.data!.items.map((e) => (
                <li key={e.override_id}>
                  <b>
                    {e.test_name}, soal {e.question_number}
                  </b>{" "}
                  ({date(e.created_at)}): nilai {num(e.old_grade)} → {num(e.new_grade)}. Alasan Anda: &ldquo;{e.reason}&rdquo;
                  {e.relation === "contradict" && " (bertentangan)"}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function ConflictCard({ c, onDone }: { c: TraitConflict; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function resolve(action: "keep_old" | "replace" | "keep_both", msg: string) {
    setBusy(action);
    try {
      await apiFetch(`/traits/conflicts/${c.id}/resolve`, { method: "POST", body: JSON.stringify({ action }) });
      toast({ tone: "success", text: msg });
      onDone();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-md border-2 border-warning bg-surface p-4 sm:p-5">
      <p className="flex items-center gap-2 font-semibold">
        <Scale size={20} aria-hidden="true" /> Dua catatan Anda bertentangan. Mana yang benar?
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-md bg-bg p-3">
          <p className="text-small font-semibold text-text-muted">Catatan lama</p>
          <p className="mt-1">{c.old_canonical_text}</p>
        </div>
        <div className="rounded-md bg-bg p-3">
          <p className="text-small font-semibold text-text-muted">Catatan baru (dari perubahan nilai terakhir)</p>
          <p className="mt-1">{c.new_canonical_text}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button loading={busy === "keep_old"} disabled={busy !== null} onClick={() => resolve("keep_old", "Catatan lama tetap dipakai.")}>
          Pakai yang lama
        </Button>
        <Button variant="primary" loading={busy === "replace"} disabled={busy !== null} onClick={() => resolve("replace", "Catatan baru dipakai, yang lama dimatikan.")}>
          Pakai yang baru
        </Button>
        <Button loading={busy === "keep_both"} disabled={busy !== null} onClick={() => resolve("keep_both", "Keduanya dipakai.")}>
          Keduanya benar (beda situasi)
        </Button>
      </div>
    </article>
  );
}

function CreateTraitModal({
  open,
  subjects,
  onClose,
  onSaved,
}: {
  open: boolean;
  subjects: Subject[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ subject_id: "", canonical_text: "", aspect: "", condition: "", direction: "lenient" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const toast = useToast();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.subject_id) errs.subject_id = "Pilih mata kuliah.";
    if (form.canonical_text.trim().length < 10) errs.canonical_text = "Tulis catatan minimal 10 huruf.";
    if (form.aspect.trim().length < 2) errs.aspect = "Isi bagian yang dinilai, misalnya: satuan.";
    if (form.condition.trim().length < 2) errs.condition = "Isi kapan catatan ini berlaku.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setServerError(null);
    try {
      await apiFetch("/traits", {
        method: "POST",
        body: JSON.stringify({
          subject_id: form.subject_id,
          canonical_text: form.canonical_text.trim(),
          aspect: form.aspect.trim(),
          condition: form.condition.trim(),
          direction: form.direction,
        }),
      });
      toast({ tone: "success", text: "Catatan tersimpan. AI memakainya mulai penilaian berikutnya." });
      setForm({ subject_id: "", canonical_text: "", aspect: "", condition: "", direction: "lenient" });
      onSaved();
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tulis catatan penilaian"
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button type="submit" form="form-trait" variant="primary" loading={saving} loadingText="Menyimpan…">
            Simpan catatan
          </Button>
        </>
      }
    >
      <form id="form-trait" onSubmit={submit} noValidate className="space-y-4">
        {serverError && (
          <Banner tone="danger" title="Catatan belum tersimpan.">
            {serverError}
          </Banner>
        )}
        <Field id="tr-subject" label="Mata kuliah" required error={errors.subject_id}>
          <select id="tr-subject" className={inputClass} value={form.subject_id} onChange={set("subject_id")}>
            <option value="">Pilih mata kuliah</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="tr-text"
          label="Catatan"
          required
          error={errors.canonical_text}
          help="Contoh: Kalau salah hitung di awal terbawa ke langkah berikutnya, langkah berikutnya tetap diberi poin penuh selama caranya benar."
        >
          <textarea id="tr-text" rows={3} className={textareaClass} value={form.canonical_text} onChange={set("canonical_text")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="tr-aspect" label="Bagian yang dinilai" required error={errors.aspect} help="Contoh: kesalahan terbawa">
            <input id="tr-aspect" className={inputClass} value={form.aspect} onChange={set("aspect")} />
          </Field>
          <Field id="tr-cond" label="Berlaku kapan" required error={errors.condition} help="Contoh: hasil akhir salah karena salah hitung awal">
            <input id="tr-cond" className={inputClass} value={form.condition} onChange={set("condition")} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 font-semibold">Dibanding kunci jawaban, Anda menilai…</legend>
          <div className="flex flex-wrap gap-4">
            {(["lenient", "stricter"] as const).map((d) => (
              <label key={d} className="flex min-h-11 cursor-pointer items-center gap-2">
                <input type="radio" name="direction" checked={form.direction === d} onChange={() => setForm((f) => ({ ...f, direction: d }))} className="h-5 w-5 accent-primary" />
                {DIRECTION[d]}
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
