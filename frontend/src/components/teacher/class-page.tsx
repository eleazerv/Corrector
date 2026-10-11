"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { api, errorMessage, type ClassDetail, type Student, type TestType } from "@/lib/data";
import { classTestStatus, formatDate } from "@/lib/format";
import { invalidate, useResource } from "@/lib/use-resource";
import { Page, PageHead, SectionTitle } from "@/components/app/page";
import { Button } from "@/components/kit/button";
import { ConfirmDialog, Dialog } from "@/components/kit/dialog";
import { Field, FieldError, describedBy, inputClass, textareaClass } from "@/components/kit/field";
import { Icon } from "@/components/kit/icon";
import { Empty, ErrorState, Loading, MockNotice, Notice, StatusTag } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";

const TEST_TYPES: { value: TestType; label: string }[] = [
  { value: "ASG", label: "Tugas atau kuis" },
  { value: "MID", label: "Ujian tengah semester" },
  { value: "FINAL", label: "Ujian akhir semester" },
];

/* ---------- new exam ---------- */

function NewExamForm({ classId, onDone }: { classId: string; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const subjects = useResource("subjects", () => api.listSubjects());
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<TestType>("ASG");
  const [date, setDate] = useState("");
  const [errors, setErrors] = useState<{ name?: string; subject?: string; date?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const list = subjects.data ?? [];
  const chosenSubject = subject || (list.length === 1 ? list[0].id : "");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = {
      name: name.trim() ? undefined : "Isi nama ujian.",
      subject: chosenSubject ? undefined : "Pilih mata kuliah.",
      date: date ? undefined : "Isi tanggal ujian.",
    };
    setErrors(next);
    if (next.name || next.subject || next.date) return;
    setBusy(true);
    try {
      const t = await api.createClassTest(classId, {
        test_name: name.trim(),
        subject_id: chosenSubject,
        test_type: type,
        test_date: new Date(`${date}T08:00:00`).toISOString(),
      });
      invalidate("classes", `class:${classId}`);
      toast(`${t.test_name} dibuat. Lanjutkan dengan mengisi rubrik.`);
      onDone();
      router.push(`/dosen/ujian/${t.id}/rubrik`);
    } catch (err) {
      setErrors({ form: errorMessage(err) });
      setBusy(false);
    }
  };

  if (subjects.loading) return <Loading what="mata kuliah" />;
  if (subjects.error) return <ErrorState error={subjects.error} onRetry={subjects.reload} />;
  if (list.length === 0) {
    return (
      <Notice tone="attention" title="Sekolah belum punya mata kuliah">
        Setiap ujian terhubung ke satu mata kuliah. Mata kuliah dibuat oleh admin sekolah.
      </Notice>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field id="ujian-nama" label="Nama ujian" error={errors.name}>
        <input
          id="ujian-nama"
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!errors.name}
          aria-describedby={describedBy("ujian-nama", null, errors.name)}
          placeholder="Contoh: Ujian Akhir Semester"
        />
      </Field>
      <Field id="ujian-mk" label="Mata kuliah" error={errors.subject}>
        <select
          id="ujian-mk"
          className={inputClass}
          value={chosenSubject}
          onChange={(e) => setSubject(e.target.value)}
          aria-invalid={!!errors.subject}
          aria-describedby={describedBy("ujian-mk", null, errors.subject)}
        >
          {list.length > 1 && <option value="">Pilih mata kuliah</option>}
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ujian-jenis" label="Jenis">
          <select id="ujian-jenis" className={inputClass} value={type} onChange={(e) => setType(e.target.value as TestType)}>
            {TEST_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="ujian-tgl" label="Tanggal ujian" error={errors.date}>
          <input
            id="ujian-tgl"
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={!!errors.date}
            aria-describedby={describedBy("ujian-tgl", null, errors.date)}
          />
        </Field>
      </div>
      <p className="text-sm text-pencil">Soal, kunci jawaban, dan kriteria diisi di langkah berikutnya.</p>
      <FieldError message={errors.form} />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" busy={busy}>
          Buat ujian
        </Button>
      </div>
    </form>
  );
}

/* ---------- add students ---------- */

/**
 * One NIM per line. A pasted spreadsheet row ("NIM, Nama" or tab separated) also works: only the
 * first column is read, because names come from the student accounts the school admin created.
 */
function parseNims(text: string): { nims: string[]; problems: string[] } {
  const nims: string[] = [];
  const problems: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const nim = (line.trim().split(/\t|;|,|\s+/)[0] ?? "").trim();
    if (!nim || /^nim$/i.test(nim)) return;
    if (!/^[A-Za-z0-9.-]{3,20}$/.test(nim)) problems.push(`Baris ${i + 1}: "${nim}" bukan NIM yang valid.`);
    else if (!nims.includes(nim)) nims.push(nim);
  });
  return { nims, problems };
}

function AddStudentsForm({ classId, onDone }: { classId: string; onDone: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseNims(text), [text]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (parsed.nims.length === 0) return setError("Tulis minimal satu NIM.");
    if (parsed.problems.length > 0) return setError("Perbaiki baris yang bermasalah dulu, atau hapus baris itu.");
    setBusy(true);
    setError(null);
    try {
      const r = await api.addStudents(classId, parsed.nims);
      invalidate("classes", `class:${classId}`);
      const parts = [`${r.added} mahasiswa ditambahkan.`];
      if (r.already > 0) parts.push(`${r.already} sudah ada di kelas.`);
      toast(parts.join(" "));
      if (r.unknown.length > 0) {
        // Keep the dialog open on the NIMs that need an admin, so they can be copied and sent.
        setUnknown(r.unknown);
        setText(r.unknown.join("\n"));
        setBusy(false);
      } else onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {unknown.length > 0 && (
        <Notice tone="attention" title={`${unknown.length} NIM belum punya akun di sekolah`}>
          <p className="font-mono text-sm break-all">{unknown.join(", ")}</p>
          <p className="mt-1">Akun mahasiswa dibuat oleh admin sekolah. Kirim daftar ini ke admin, lalu tambahkan lagi.</p>
        </Notice>
      )}
      <Field
        id="roster"
        label="NIM mahasiswa"
        hint="Satu NIM per baris. Bisa ditempel langsung dari spreadsheet; hanya kolom pertama yang dibaca."
        error={error}
      >
        <textarea
          id="roster"
          rows={7}
          className={`${textareaClass} font-mono text-sm`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          aria-invalid={!!error}
          aria-describedby={describedBy("roster", true, error)}
          placeholder={"2601011\n2601012"}
          spellCheck={false}
        />
      </Field>
      {(parsed.nims.length > 0 || parsed.problems.length > 0) && (
        <div className="rounded-md bg-sunken px-4 py-3 text-sm" aria-live="polite">
          <p>
            <strong className="font-semibold">{parsed.nims.length}</strong> NIM siap dicari di akun mahasiswa sekolah.
          </p>
          {parsed.problems.length > 0 && (
            <ul className="mt-2 space-y-1 text-attention">
              {parsed.problems.slice(0, 6).map((p) => (
                <li key={p}>{p}</li>
              ))}
              {parsed.problems.length > 6 && <li>dan {parsed.problems.length - 6} baris lain.</li>}
            </ul>
          )}
        </div>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" busy={busy}>
          Tambahkan {parsed.nims.length > 0 ? parsed.nims.length : ""} mahasiswa
        </Button>
      </div>
    </form>
  );
}

/* ---------- page ---------- */

function ClassBody({ c }: { c: ClassDetail }) {
  const toast = useToast();
  const [dialog, setDialog] = useState<"exam" | "students" | null>(null);
  const [removing, setRemoving] = useState<Student | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => setDialog(null);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.removeStudent(c.id, removing.id);
      invalidate("classes", `class:${c.id}`);
      toast(`${removing.name} dikeluarkan dari kelas.`);
      setRemoving(null);
    } catch (err) {
      toast(errorMessage(err), "attention");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        crumbs={[{ href: "/dosen", label: "Kelas & ujian" }]}
        title={c.name}
        meta={[c.code, `${c.students.length} mahasiswa`, c.description].filter(Boolean).join(" · ")}
      />
      <div className="mb-6 space-y-3">
        <MockNotice endpoint="getClass" id={c.id} />
        {!c.is_teacher && (
          <Notice>Anda memeriksa ujian di kelas ini. Ujian baru dan daftar mahasiswa diatur oleh dosen pengampunya.</Notice>
        )}
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="ujian">
          <SectionTitle
            id="ujian"
            aside={
              c.is_teacher && (
                <Button compact onClick={() => setDialog("exam")}>
                  <Icon icon={Plus} />
                  Ujian baru
                </Button>
              )
            }
          >
            Ujian
          </SectionTitle>
          {c.class_tests.length === 0 ? (
            <Empty
              title="Belum ada ujian"
              action={
                c.is_teacher && (
                  <Button variant="primary" onClick={() => setDialog("exam")}>
                    Buat ujian pertama
                  </Button>
                )
              }
            >
              Buat ujian, isi rubriknya, lalu unggah foto jawaban mahasiswa.
            </Empty>
          ) : (
            <ul className="divide-y divide-rule rounded-md border border-rule bg-surface px-5">
              {c.class_tests.map((t) => {
                const s = classTestStatus(t.status);
                return (
                  <li key={t.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link
                        href={`/dosen/ujian/${t.id}`}
                        className="text-lg font-semibold underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                      >
                        {t.test_name}
                      </Link>
                      <p className="num text-sm text-pencil">
                        {t.test_date ? `${formatDate(t.test_date)} · ` : ""}
                        {t.questions_count} soal · {t.sheets_graded} dari {t.sheets_total} lembar dinilai
                      </p>
                    </div>
                    <StatusTag tone={s.tone}>{s.label}</StatusTag>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="mahasiswa">
          <SectionTitle
            id="mahasiswa"
            aside={
              c.is_teacher && (
                <Button compact onClick={() => setDialog("students")}>
                  <Icon icon={Plus} />
                  Tambah
                </Button>
              )
            }
          >
            Mahasiswa
          </SectionTitle>
          {c.students.length === 0 ? (
            <Empty
              title="Belum ada mahasiswa"
              action={
                c.is_teacher && (
                  <Button variant="primary" onClick={() => setDialog("students")}>
                    Tambah mahasiswa
                  </Button>
                )
              }
            >
              Jawaban dicocokkan ke mahasiswa lewat NIM, jadi daftar ini perlu diisi sebelum mengunggah.
            </Empty>
          ) : (
            <div className="rounded-md border border-rule bg-surface px-4">
              <table className="table">
                <caption className="sr-only">Mahasiswa di kelas {c.name}</caption>
                <thead>
                  <tr>
                    <th scope="col">NIM</th>
                    <th scope="col">Nama</th>
                    {c.is_teacher && (
                      <th scope="col">
                        <span className="sr-only">Tindakan</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {c.students.map((s) => (
                    <tr key={s.id}>
                      <td data-label="NIM" className="num text-sm text-pencil">
                        {s.nim}
                      </td>
                      <td data-label="Nama">{s.name}</td>
                      {c.is_teacher && (
                        <td className="right">
                          <Button compact variant="quiet" onClick={() => setRemoving(s)}>
                            Keluarkan
                            <span className="sr-only"> {s.name}</span>
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <Dialog open={dialog === "exam"} onClose={close} title="Ujian baru" description={c.name}>
        <NewExamForm classId={c.id} onDone={close} />
      </Dialog>
      <Dialog open={dialog === "students"} onClose={close} title="Tambah mahasiswa" description={c.name}>
        <AddStudentsForm classId={c.id} onDone={close} />
      </Dialog>
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        busy={busy}
        title={`Keluarkan ${removing?.name ?? ""}?`}
        confirmLabel="Keluarkan dari kelas"
        body={
          <p>
            Lembar jawaban {removing?.name} ({removing?.nim}) tidak bisa diunggah lagi untuk ujian di kelas ini. Lembar dan nilai
            yang sudah ada tetap tersimpan.
          </p>
        }
      />
    </>
  );
}

export function ClassPage({ classId }: { classId: string }) {
  const cls = useResource(`class:${classId}`, () => api.getClass(classId));
  return (
    <Page>
      {cls.loading ? (
        <Loading what="kelas" />
      ) : cls.error ? (
        <ErrorState error={cls.error} onRetry={cls.reload} />
      ) : cls.data ? (
        <ClassBody c={cls.data} />
      ) : null}
    </Page>
  );
}
