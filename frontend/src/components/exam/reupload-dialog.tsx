"use client";

import { useState, type FormEvent } from "react";
import { api, errorMessage, type ProgressItem } from "@/lib/data";
import { invalidate, useResource } from "@/lib/use-resource";
import { Button } from "@/components/kit/button";
import { Dialog } from "@/components/kit/dialog";
import { Field, FieldError, inputClass } from "@/components/kit/field";
import { useToast } from "@/components/kit/toast";

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const MAX_IMAGE_MB = 10;

/** Same limits the backend enforces, checked here so the lecturer hears about it before uploading. */
export function imageProblem(f: File): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return `${f.name} bukan foto JPEG, PNG, atau WebP.`;
  if (f.size > MAX_IMAGE_MB * 1024 * 1024) return `${f.name} lebih dari ${MAX_IMAGE_MB} MB.`;
  if (f.size === 0) return `${f.name} kosong.`;
  return null;
}

function ReuploadForm({ classTestId, item, onDone }: { classTestId: string; item: ProgressItem; onDone: () => void }) {
  const toast = useToast();
  const stId = item.student_test_id!;
  // Page statuses come from the sheet detail; until it loads, every page is offered.
  const detail = useResource(`sheet:${stId}`, () => api.getStudentTest(stId));
  const flagged = detail.data?.pages.filter((p) => p.status === "needs_reupload" || p.status === "failed") ?? [];
  const options = Array.from({ length: Math.max(item.total_pages, 1) }, (_, i) => i + 1);
  const [page, setPage] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = page ?? flagged[0]?.page_no ?? 1;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Pilih foto pengganti.");
      return;
    }
    const problem = imageProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      await api.reuploadPage(stId, chosen, file);
      invalidate(`progress:${classTestId}`, `sheet:${stId}`);
      toast(`Halaman ${chosen} milik ${item.name} masuk antrean baca ulang.`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field
        id="re-page"
        label="Halaman"
        hint={
          flagged.length > 0
            ? `Halaman yang gagal dibaca: ${flagged.map((p) => (p.error ? `${p.page_no} (${p.error})` : p.page_no)).join(", ")}.`
            : "Pilih halaman yang fotonya buram atau gagal dibaca."
        }
      >
        <select
          id="re-page"
          className={inputClass}
          value={chosen}
          onChange={(e) => setPage(Number(e.target.value))}
          aria-describedby="re-page-hint"
        >
          {options.map((n) => (
            <option key={n} value={n}>
              Halaman {n}
              {flagged.some((p) => p.page_no === n) ? " (gagal dibaca)" : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field id="re-file" label="Foto pengganti" hint={`JPEG, PNG, atau WebP, maksimal ${MAX_IMAGE_MB} MB.`}>
        <input
          id="re-file"
          type="file"
          accept={IMAGE_ACCEPT}
          className={`${inputClass} py-2`}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
          }}
          aria-describedby="re-file-hint"
        />
      </Field>
      <FieldError message={error} />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" busy={busy}>
          Unggah ulang halaman {chosen}
        </Button>
      </div>
    </form>
  );
}

export function ReuploadDialog({
  classTestId,
  item,
  onClose,
}: {
  classTestId: string;
  item: ProgressItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      title="Unggah ulang halaman"
      description={item ? `${item.name} · ${item.nim}` : undefined}
    >
      {item && <ReuploadForm classTestId={classTestId} item={item} onDone={onClose} />}
    </Dialog>
  );
}
