"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BookOpen, Plus } from "lucide-react";
import { useData, uid } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Field, describedBy, inputClass, textareaClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/panels";
import { useToast } from "@/components/ui/toast";

export function ClassTable({ onCreate }: { onCreate: () => void }) {
  const { data } = useData();
  if (data.classes.length === 0) {
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
          <th scope="col">Periode</th>
          <th scope="col" className="num">
            Mahasiswa
          </th>
          <th scope="col" className="num">
            Ujian
          </th>
        </tr>
      </thead>
      <tbody>
        {data.classes.map((c) => (
          <tr key={c.id}>
            <td data-label="Kelas">
              <Link href={`/dosen/kelas/${c.id}`} className="font-semibold text-primary underline-offset-4 hover:underline">
                {c.name}
              </Link>
            </td>
            <td data-label="Kode">{c.code}</td>
            <td data-label="Periode">{c.period}</td>
            <td data-label="Mahasiswa" className="num">
              {c.studentIds.length}
            </td>
            <td data-label="Ujian" className="num">
              {data.exams.filter((e) => e.classId === c.id).length}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CreateClassModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dispatch } = useData();
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", code: "", period: "", description: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function close() {
    setForm({ name: "", code: "", period: "", description: "" });
    setErrors({});
    onClose();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Isi nama kelas, misalnya nama mata kuliah.";
    if (!form.code.trim()) errs.code = "Isi kode mata kuliah sesuai kurikulum.";
    if (!form.period.trim()) errs.period = "Isi periode akademik, misalnya Ganjil 2026/2027.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const id = uid("c");
    dispatch({
      type: "createClass",
      classRoom: {
        id,
        name: form.name.trim(),
        code: form.code.trim(),
        period: form.period.trim(),
        description: form.description.trim() || undefined,
        studentIds: [],
      },
    });
    toast({ tone: "success", text: `Kelas ${form.name.trim()} dibuat.` });
    close();
    router.push(`/dosen/kelas/${id}`);
  }

  return (
    <Modal open={open} onClose={close} title="Buat kelas baru">
      <form id="form-kelas" onSubmit={submit} noValidate className="space-y-4">
        {(
          [
            ["name", "Nama kelas", "Contoh: Metodologi Penelitian"],
            ["code", "Kode mata kuliah", "Contoh: MP-201"],
            ["period", "Periode akademik", "Contoh: Ganjil 2026/2027"],
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
          <Button onClick={close}>Batal</Button>
          <Button type="submit" variant="primary">
            Simpan Kelas
          </Button>
        </div>
      </form>
    </Modal>
  );
}
