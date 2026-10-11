"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorMessage, type MyTestDetail } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { invalidate, useResource } from "@/lib/use-resource";
import { Page, PageHead } from "@/components/app/page";
import { Button } from "@/components/kit/button";
import { Field, FieldError, describedBy, textareaClass } from "@/components/kit/field";
import { ErrorState, Loading } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";

const MIN = 20;
const MAX = 4000;
/** Radio value for a complaint about the sheet as a whole (test_answer_id null). */
const WHOLE = "keseluruhan";

function Form({ r }: { r: MyTestDetail }) {
  const router = useRouter();
  const toast = useToast();
  const [target, setTarget] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<{ target?: string; text?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const pending = new Set(r.complaints.filter((c) => c.status === "pending").map((c) => c.test_answer_id ?? WHOLE));
  const options = [
    ...r.answers
      .filter((q) => q.test_answer_id)
      .map((q) => ({
        value: q.test_answer_id!,
        title: `Soal ${q.number}`,
        detail: q.question_text,
        score: `${formatNumber(q.grade)} / ${formatNumber(q.max_points)}`,
      })),
    { value: WHOLE, title: "Nilai secara keseluruhan", detail: "Bukan tentang satu soal tertentu.", score: "" },
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const length = text.trim().length;
    const next = {
      target: target === null ? "Pilih soal yang ingin Anda ajukan." : undefined,
      text:
        length < MIN
          ? `Jelaskan alasan Anda, minimal ${MIN} karakter.`
          : length > MAX
            ? `Maksimal ${MAX} karakter. Persingkat penjelasan Anda.`
            : undefined,
    };
    setErrors(next);
    if (next.target || next.text) return;
    setBusy(true);
    try {
      await api.submitComplaint(r.student_test_id, {
        test_answer_id: target === WHOLE ? null : target,
        complaint: text.trim(),
      });
      invalidate("my-complaints", `my-result:${r.student_test_id}`);
      toast("Keberatan terkirim. Dosen akan membacanya.");
      router.push("/mahasiswa/keberatan");
    } catch (err) {
      setErrors({ form: errorMessage(err) });
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <fieldset>
        <legend className="mb-2 font-medium">Yang Anda ajukan</legend>
        <div className="divide-y divide-rule rounded-md border border-rule bg-surface">
          {options.map((o) => {
            const waiting = pending.has(o.value);
            return (
              <label
                key={o.value}
                className={`flex min-h-12 items-center gap-3 px-4 py-2 ${waiting ? "" : "cursor-pointer hover:bg-sunken"}`}
              >
                <input
                  type="radio"
                  name="soal"
                  disabled={waiting}
                  checked={target === o.value}
                  onChange={() => setTarget(o.value)}
                  className="h-4 w-4 shrink-0 accent-ink"
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{o.title}</span>
                  <span className="block truncate text-sm text-pencil">
                    {waiting ? "Keberatan Anda untuk ini masih menunggu dosen." : o.detail}
                  </span>
                </span>
                {o.score && <span className="num shrink-0 text-pencil">{o.score}</span>}
              </label>
            );
          })}
        </div>
        <FieldError message={errors.target} />
      </fieldset>

      <Field
        id="alasan"
        label="Alasan keberatan"
        hint={`Tunjukkan bagian jawaban Anda yang menurut Anda belum dinilai dengan tepat. ${text.trim().length} karakter, minimal ${MIN}.`}
        error={errors.text}
      >
        <textarea
          id="alasan"
          rows={6}
          maxLength={MAX}
          className={textareaClass}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={!!errors.text}
          aria-describedby={describedBy("alasan", true, errors.text)}
        />
      </Field>

      <p className="text-sm text-pencil">Dosen membaca keberatan ini apa adanya. Nilai Anda tidak berubah sampai dosen memutuskan.</p>
      <FieldError message={errors.form} />
      <Button type="submit" variant="primary" busy={busy}>
        Kirim keberatan
      </Button>
    </form>
  );
}

export function StudentComplaintForm({ studentTestId }: { studentTestId: string }) {
  const res = useResource(`my-result:${studentTestId}`, () => api.myTest(studentTestId));
  return (
    <Page>
      {res.loading ? (
        <Loading what="nilai" />
      ) : res.error ? (
        <ErrorState error={res.error} onRetry={res.reload} />
      ) : res.data ? (
        <>
          <PageHead
            crumbs={[
              { href: "/mahasiswa", label: "Nilai saya" },
              { href: `/mahasiswa/nilai/${studentTestId}`, label: res.data.test_name },
            ]}
            title="Ajukan keberatan"
          />
          <div className="max-w-2xl">
            <Form r={res.data} />
          </div>
        </>
      ) : null}
    </Page>
  );
}
