"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/data";
import { invalidate } from "@/lib/use-resource";
import { Button } from "@/components/kit/button";
import { Dialog } from "@/components/kit/dialog";
import { Field, FieldError, describedBy, inputClass, textareaClass } from "@/components/kit/field";
import { useToast } from "@/components/kit/toast";

export function CreateClassDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Kelas baru">
      <CreateClassForm onDone={onClose} />
    </Dialog>
  );
}

function CreateClassForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ name?: string; code?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = {
      name: name.trim() ? undefined : "Isi nama kelas.",
      code: code.trim() ? undefined : "Isi kode mata kuliah.",
    };
    setErrors(next);
    if (next.name || next.code) return;
    setBusy(true);
    try {
      const c = await api.createClass({ name, code, description: description.trim() || null });
      invalidate("classes");
      toast(`Kelas ${c.name} dibuat.`);
      onDone();
      router.push(`/dosen/kelas/${c.id}`);
    } catch (err) {
      setErrors({ form: errorMessage(err) });
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field id="kelas-nama" label="Nama kelas" error={errors.name}>
        <input
          id="kelas-nama"
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!errors.name}
          aria-describedby={describedBy("kelas-nama", null, errors.name)}
          placeholder="Contoh: Metodologi Penelitian"
        />
      </Field>
      <Field id="kelas-kode" label="Kode mata kuliah" error={errors.code}>
        <input
          id="kelas-kode"
          className={inputClass}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={!!errors.code}
          aria-describedby={describedBy("kelas-kode", null, errors.code)}
          placeholder="Contoh: MP-201"
        />
      </Field>
      <Field id="kelas-desk" label="Keterangan" optional hint="Misalnya semester atau ruang kelas.">
        <textarea
          id="kelas-desk"
          rows={2}
          className={textareaClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-describedby="kelas-desk-hint"
        />
      </Field>
      <FieldError message={errors.form} />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" busy={busy}>
          Buat kelas
        </Button>
      </div>
    </form>
  );
}
