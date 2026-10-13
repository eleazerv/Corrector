"use client";
// daftar & pembuatan kelas sekarang memakai backend (GET/POST /classes),
// bukan lagi data contoh di store. Kolom "Periode" diganti "Dosen" karena backend belum punya periode.

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { BookOpen, LoaderCircle, Plus, RotateCw } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import type { ClassItem, ListResponse } from "@/lib/backend-types";
import { invalidate, useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Field, describedBy, inputClass, textareaClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { Banner, EmptyState } from "@/components/ui/panels";
import { useToast } from "@/components/ui/toast";

export function ClassTable({ onCreate }: { onCreate: () => void }) {
  const { data, loading, error, reload } = useApi<ListResponse<ClassItem>>("/classes");

  if (loading && !data) {
    return (
      <p role="status" className="flex items-center gap-2 py-10 text-text-muted">
        <Icon icon={LoaderCircle} className="animate-spin" />
        Memuat kelas…
      </p>
    );
  }
  if (error) {
    return (
      <Banner
        tone="danger"
        title="Daftar kelas gagal dimuat."
        action={
          <Button icon={RotateCw} onClick={reload}>
            Coba lagi
          </Button>
        }
      >
        {error}
      </Banner>
    );
  }
  const classes = data?.items ?? [];
  if (classes.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Belum ada kelas."
        action={
          <Button variant="primary" icon={Plus} onClick={onCreate}>
            Buat Kelas
          </Button>
        }
      >
        Buat kelas pertama untuk menambahkan mahasiswa dan menyiapkan ujian.
      </EmptyState>
    );
  }
  return (
    <table className="sheet">
      <thead>
        <tr>
          <th scope="col">Kelas</th>
          <th scope="col">Kode</th>
          <th scope="col">Dosen</th>
          <th scope="col" className="num">
            Mahasiswa
          </th>
          <th scope="col" className="num">
            Ujian
          </th>
        </tr>
      </thead>
      <tbody>
        {classes.map((c) => (
          <tr key={c.id}>
            <td data-label="Kelas">
              <Link href={`/dosen/kelas/${c.id}`} className="font-semibold text-primary underline-offset-4 hover:underline">
                {c.name}
              </Link>
            </td>
            <td data-label="Kode">{c.code}</td>
            <td data-label="Dosen">{c.teacher_name ?? "-"}</td>
            <td data-label="Mahasiswa" className="num">
              {c.student_count}
            </td>
            <td data-label="Ujian" className="num">
              {c.test_count}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CreateClassModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", code: "", description: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function close() {
    setForm({ name: "", code: "", description: "" });
    setErrors({});
    setServerError(null);
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Isi nama kelas, misalnya nama mata kuliah.";
    if (!form.code.trim()) errs.code = "Isi kode kelas, misalnya MP-201-A.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    setServerError(null);
    try {
      await apiFetch<ClassItem>("/classes", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim(),
          description: form.description.trim() || null,
        }),
      });
      invalidate("/classes");
      toast({ tone: "success", text: `Kelas ${form.name.trim()} dibuat.` });
      close();
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Buat kelas baru">
      <form id="form-kelas" onSubmit={submit} noValidate className="space-y-4">
        {serverError && (
          <Banner tone="danger" title="Kelas belum tersimpan.">
            {serverError}
          </Banner>
        )}
        {(
          [
            ["name", "Nama kelas", "Contoh: Metodologi Penelitian"],
            ["code", "Kode kelas", "Contoh: MP-201-A"],
          ] as const
        ).map(([k, label, placeholder]) => (
          <Field key={k} id={`kelas-${k}`} label={label} required error={errors[k]}>
            <input
              id={`kelas-${k}`}
              className={inputClass}
              value={form[k]}
              onChange={set(k)}
              placeholder={placeholder}
              aria-invalid={Boolean(errors[k])}
              aria-describedby={describedBy(`kelas-${k}`, false, errors[k])}
            />
          </Field>
        ))}
        <Field id="kelas-description" label="Deskripsi">
          <textarea
            id="kelas-description"
            rows={3}
            className={textareaClass}
            value={form.description}
            onChange={set("description")}
          />
        </Field>
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-between">
          <Button onClick={close} disabled={saving}>
            Batal
          </Button>
          <Button type="submit" variant="primary" loading={saving} loadingText="Menyimpan…">
            Simpan Kelas
          </Button>
        </div>
      </form>
    </Modal>
  );
}
