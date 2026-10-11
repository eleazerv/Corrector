"use client";

import { useState, type FormEvent } from "react";
import { ChevronRight } from "lucide-react";
import { api, errorMessage, type TeacherTrait } from "@/lib/data";
import { formatDate, formatNumber } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { Page, PageHead } from "@/components/app/page";
import { Button } from "@/components/kit/button";
import { Field, Switch, describedBy, textareaClass } from "@/components/kit/field";
import { Icon } from "@/components/kit/icon";
import { Empty, ErrorState, Loading, MockNotice } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";

const DIRECTION = { lenient: "Lebih longgar", stricter: "Lebih ketat" } as const;
const SOURCE = { learned: "Dipelajari dari perubahan nilai", manual: "Ditulis sendiri" } as const;
const MIN_TEXT = 10;

/** The overrides a note was learned from, loaded when the lecturer opens it. */
function Evidence({ id }: { id: string }) {
  const res = useResource(`trait-evidence:${id}`, () => api.traitEvidences(id));
  if (res.loading) return <Loading what="dasar catatan" />;
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  const items = res.data?.items ?? [];
  if (items.length === 0) return <p className="text-sm text-pencil">Catatan ini ditulis langsung, tidak berasal dari perubahan nilai.</p>;
  return (
    <ul className="space-y-3">
      {items.map((e) => (
        <li key={e.override_id} className="text-sm">
          <p className="num">
            <span className="font-medium">
              {e.test_name}, soal {e.question_number}
            </span>
            <span className="text-pencil">
              {" "}
              · {formatNumber(e.old_grade)} menjadi {formatNumber(e.new_grade)} · {formatDate(e.created_at)}
              {e.relation === "contradict" ? " · bertentangan dengan catatan ini" : ""}
            </span>
          </p>
          <p className="mt-0.5">{e.reason}</p>
        </li>
      ))}
    </ul>
  );
}

function EditForm({ t, onSaved, onCancel }: { t: TeacherTrait; onSaved: (t: TeacherTrait) => void; onCancel: () => void }) {
  const [text, setText] = useState(t.canonical_text);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = `tr-edit-${t.id}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (text.trim().length < MIN_TEXT) {
      setError(`Tulis minimal ${MIN_TEXT} karakter.`);
      return;
    }
    if (text.trim() === t.canonical_text) {
      onCancel();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.patchTrait(t.id, { canonical_text: text.trim() }));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <Field
        id={id}
        label="Kalimat catatan"
        hint="Boleh diperjelas atau dipersingkat. Kalau maknanya berbalik, matikan catatan ini dan biarkan AI belajar yang baru."
        error={error}
      >
        <textarea
          id={id}
          rows={3}
          className={textareaClass}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={describedBy(id, true, error)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" compact busy={busy}>
          {busy ? "Memeriksa..." : "Simpan"}
        </Button>
        <Button compact onClick={onCancel}>
          Batal
        </Button>
      </div>
    </form>
  );
}

function TraitRow({ t, onToggle, onSaved }: { t: TeacherTrait; onToggle: (v: boolean) => void; onSaved: (t: TeacherTrait) => void }) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <li className={`px-5 py-4 ${t.is_active ? "" : "bg-sunken/60"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {editing ? (
            <EditForm
              t={t}
              onCancel={() => setEditing(false)}
              onSaved={(next) => {
                setEditing(false);
                onSaved(next);
              }}
            />
          ) : (
            <p className="text-[16px] leading-snug font-medium">{t.canonical_text}</p>
          )}
          <p className="mt-1 text-sm text-pencil">
            {[DIRECTION[t.direction], t.category, SOURCE[t.source]].filter(Boolean).join(" · ")}
          </p>
          <p className="text-sm text-pencil">
            Berlaku bila: {t.condition}.
            {t.source === "learned" && ` Didukung ${t.evidence_count} perubahan nilai`}
            {t.source === "learned" && t.last_seen ? `, terakhir ${formatDate(t.last_seen)}.` : t.source === "learned" ? "." : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4">
            {!editing && (
              <Button compact variant="quiet" onClick={() => setEditing(true)}>
                Ubah kalimat
              </Button>
            )}
            {t.source === "learned" && (
              <Button compact variant="quiet" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                <Icon icon={ChevronRight} size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} />
                Dasar catatan
              </Button>
            )}
          </div>
          {open && (
            <div className="mt-3 rounded-md border border-rule bg-surface px-4 py-3">
              <Evidence id={t.id} />
            </div>
          )}
        </div>
        <div className="w-44 shrink-0">
          <Switch id={`tr-${t.id}`} label={t.is_active ? "Dipakai AI" : "Tidak dipakai"} checked={t.is_active} onChange={onToggle} />
        </div>
      </div>
    </li>
  );
}

export function MemoryPage() {
  const res = useResource("traits", () => api.listTraits());
  const toast = useToast();
  const replace = (next: TeacherTrait) =>
    res.mutate((prev) => ({ items: (prev?.items ?? []).map((x) => (x.id === next.id ? next : x)) }));

  const toggle = async (t: TeacherTrait, active: boolean) => {
    replace({ ...t, is_active: active });
    try {
      replace(await api.patchTrait(t.id, { is_active: active }));
      toast(active ? "Catatan dipakai lagi oleh AI." : "Catatan tidak lagi dipakai AI.");
    } catch (err) {
      replace(t);
      toast(errorMessage(err), "attention");
    }
  };

  const traits = res.data?.items ?? [];
  const active = traits.filter((t) => t.is_active).length;

  return (
    <Page>
      <PageHead
        title="Catatan penilaian"
        meta="AI menulis catatan dari alasan Anda saat mengubah nilai, lalu membacanya sebagai rujukan saat menilai jawaban yang mirip. Rubrik tidak pernah diubah olehnya."
      />
      <div className="mb-4">
        <MockNotice endpoint="listTraits" />
      </div>
      {res.loading ? (
        <Loading what="catatan" />
      ) : res.error ? (
        <ErrorState error={res.error} onRetry={res.reload} />
      ) : traits.length === 0 ? (
        <Empty title="Belum ada catatan">Catatan muncul setelah Anda mengubah nilai di layar pemeriksaan dan menulis alasannya.</Empty>
      ) : (
        <>
          <p className="mb-3 text-pencil">
            {active} dari {traits.length} catatan sedang dipakai AI.
          </p>
          <ul className="divide-y divide-rule rounded-md border border-rule bg-surface">
            {traits.map((t) => (
              <TraitRow
                key={t.id}
                t={t}
                onToggle={(v) => toggle(t, v)}
                onSaved={(next) => {
                  replace(next);
                  toast("Kalimat catatan disimpan.");
                }}
              />
            ))}
          </ul>
        </>
      )}
    </Page>
  );
}
