"use client";
// Bahasa dibuat sederhana: trait = "kebiasaan menilai Anda" yang dipelajari AI dari nilai yang Anda ubah.

import { useState, type FormEvent } from "react";
import { Copy, NotebookPen, Pencil, Plus, Scale } from "lucide-react";
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
import { Tabs, panelId, tabId } from "@/components/ui/tabs"; 
import { useToast } from "@/components/ui/toast";

const DIRECTION = { lenient: "Lebih longgar", stricter: "Lebih ketat" } as const;

export default function CatatanPage() {
  const subjects = useApi<ListResponse<Subject>>("/subjects");
  const [subjectId, setSubjectId] = useState("");
  const traits = useApi<{ items: Trait[] }>(`/traits?include_inactive=true${subjectId ? `&subject_id=${subjectId}` : ""}`);
  const conflicts = useApi<{ items: TraitConflict[] }>("/traits/conflicts?status=pending");
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"all" | "active" | "inactive">("all");
  const [stay, setStay] = useState<Set<string>>(new Set());
  const all = traits.data?.items ?? [];
  const activeCount = all.filter((t) => t.is_active).length;
  const shown = all.filter(
    (t) => tab === "all" || stay.has(t.id) || (tab === "active" ? t.is_active : !t.is_active),
  );
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
      ) : all.length === 0 ? (
        <EmptyState icon={NotebookPen} title="Belum ada catatan penilaian.">
          Catatan muncul setelah Anda mengubah nilai dari AI di halaman Periksa Nilai, atau Anda bisa menulisnya sendiri.
        </EmptyState>
      ) : (
        <>
          <Tabs
            group="catatan"
            label="Saring catatan"
            value={tab}
            onChange={(id) => {
              setTab(id as typeof tab);
              setStay(new Set());
            }}
            tabs={[
              { id: "all", label: "Semua", count: all.length },
              { id: "active", label: "Dipakai AI", count: activeCount },
              { id: "inactive", label: "Tidak dipakai", count: all.length - activeCount },
            ]}
          />
          <div role="tabpanel" id={panelId("catatan", tab)} aria-labelledby={tabId("catatan", tab)} className="pt-4">
            {shown.length === 0 ? (
              <p className="py-8 text-center text-text-muted">
                {tab === "active" ? "Belum ada catatan yang dipakai AI." : "Semua catatan sedang dipakai AI."}
              </p>
            ) : (
              <ul className="space-y-3">
                {shown.map((t) => (
                  <TraitCard
                    key={t.id}
                    t={t}
                    subject={subjectName(t.subject_id)}
                    onChanged={(patch) => {
                      if (tab !== "all") setStay((prev) => new Set(prev).add(t.id));
                      traits.setData((prev) => prev && { items: prev.items.map((x) => (x.id === t.id ? { ...x, ...patch } : x)) });
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
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
          {t.direction && <Badge tone={t.direction === "lenient" ? "success" : "warning"}>{DIRECTION[t.direction]}</Badge>}
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

const CONFLICT_TEXT = {
  contradict: {
    title: "Dua catatan Anda bertentangan. Mana yang benar?",
    keep_old: ["Pakai yang lama", "Catatan lama tetap dipakai."],
    replace: ["Pakai yang baru", "Catatan baru dipakai, yang lama dimatikan."],
    keep_both: ["Keduanya benar (beda situasi)", "Keduanya dipakai."],
  },
  duplicate: {
    title: "Catatan baru Anda mirip dengan catatan yang sudah ada.",
    keep_old: ["Gabung (pakai yang lama)", "Digabung. Catatan lama tetap dipakai."],
    replace: ["Pakai kalimat yang baru", "Kalimat baru dipakai, yang lama dimatikan."],
    keep_both: ["Biarkan keduanya", "Keduanya tetap dipakai."],
  },
} as const;

function ConflictCard({ c, onDone }: { c: TraitConflict; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.old_canonical_text);
  const isDup = c.kind === "duplicate";
  const t = CONFLICT_TEXT[isDup ? "duplicate" : "contradict"];

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

  // duplikat: ubah catatan lama, lalu gabung (catatan baru dimatikan)
  async function editOldAndMerge() {
    if (text.trim().length < 10) {
      toast({ tone: "error", text: "Tulis catatan minimal 10 huruf." });
      return;
    }
    setBusy("edit");
    try {
      if (text.trim() !== c.old_canonical_text) {
        await apiFetch(`/traits/${c.old_id}`, { method: "PATCH", body: JSON.stringify({ canonical_text: text.trim() }) });
      }
      await apiFetch(`/traits/conflicts/${c.id}/resolve`, { method: "POST", body: JSON.stringify({ action: "keep_old" }) });
      toast({ tone: "success", text: "Catatan lama diperbarui dan digabung." });
      onDone();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  const actions = (["keep_old", "replace", "keep_both"] as const).map((a) => (
    <Button
      key={a}
      variant={a === (isDup ? "keep_old" : "replace") ? "primary" : "secondary"}
      loading={busy === a}
      disabled={busy !== null}
      onClick={() => resolve(a, t[a][1])}
    >
      {t[a][0]}
    </Button>
  ));

  return (
    <article className={`rounded-md border-2 bg-surface p-4 sm:p-5 ${isDup ? "border-border-strong" : "border-warning"}`}>
      <p className="flex items-center gap-2 font-semibold">
        {isDup ? <Copy size={20} aria-hidden="true" /> : <Scale size={20} aria-hidden="true" />} {t.title}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-md bg-bg p-3">
          <p className="text-small font-semibold text-text-muted">Catatan lama</p>
          {editing ? (
            <>
              <label htmlFor={`edit-old-${c.id}`} className="sr-only">
                Ubah catatan lama
              </label>
              <textarea
                id={`edit-old-${c.id}`}
                rows={3}
                className={`${textareaClass} mt-1`}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </>
          ) : (
            <p className="mt-1">{c.old_canonical_text}</p>
          )}
        </div>
        <div className="rounded-md bg-bg p-3">
          <p className="text-small font-semibold text-text-muted">
            {c.override_id ? "Catatan baru (dari perubahan nilai terakhir)" : "Catatan baru (yang baru Anda tulis)"}
          </p>
          <p className="mt-1">{c.new_canonical_text}</p>
        </div>
      </div>
      {isDup && !editing && (
        <p className="mt-3 text-small text-text-muted">
          Supaya catatan tidak dobel, sebaiknya gabung saja. Kalau ada yang ingin ditambahkan, ubah catatan lama.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button variant="primary" loading={busy === "edit"} disabled={busy !== null} onClick={editOldAndMerge}>
              Simpan & gabung
            </Button>
            <Button
              disabled={busy !== null}
              onClick={() => {
                setEditing(false);
                setText(c.old_canonical_text);
              }}
            >
              Batal
            </Button>
          </>
        ) : (
          <>
            {actions}
            {isDup && (
              <Button icon={Pencil} disabled={busy !== null} onClick={() => setEditing(true)}>
                Ubah catatan lama
              </Button>
            )}
          </>
        )}
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
  const [form, setForm] = useState({ subject_id: "", canonical_text: "" }); 
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
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setServerError(null);
    try {
      await apiFetch("/traits", {
        method: "POST",
        body: JSON.stringify({ subject_id: form.subject_id, canonical_text: form.canonical_text.trim() }),
      });
      toast({ tone: "success", text: "Catatan tersimpan. Kalau mirip atau bertentangan dengan catatan lain, Anda akan diberi tahu." }); 
      setForm({ subject_id: "", canonical_text: "" }); 
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
          help={
            <>
              <span className="block">
                Tulis <b>kapan berlaku</b> dan <b>cara menilainya</b>: beri penuh, setengah, atau tidak diberi.
              </span>
              <span className="block">Tidak perlu angka poin, karena poin mengikuti rubrik tiap soal.</span>
              <span className="mt-2 block rounded-md border-l-4 border-primary bg-primary-soft px-3 py-2 text-text">
                <span className="block font-semibold">Contoh:</span>
                <span className="block italic">
                  &ldquo;Kalau salah hitung di awal terbawa ke langkah berikutnya, langkah berikutnya tetap diberi penuh
                  selama caranya benar.&rdquo;
                </span>
              </span>
            </>
          }
        >
          <textarea id="tr-text" rows={4} className={textareaClass} value={form.canonical_text} onChange={set("canonical_text")} />
        </Field>
      </form>
    </Modal>
  );
}
