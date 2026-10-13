"use client";
// detail kelas dari backend (GET /classes/{id}).
// Dua bagian: "Ujian" (buat & buka ujian) dan "Mahasiswa" (tambah dari data sekolah / keluarkan).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FileText, Plus, Search, UserMinus, UserPlus, Users } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api";
import type {
  ClassDetail as ClassDetailData,
  ClassTestItem,
  ListResponse,
  StudentItem,
  Subject,
  TestItem,
} from "@/lib/backend-types";
import { date, TEST_TYPES, todayWIB, wibDateToISO } from "@/lib/format";
import { invalidate, useApi } from "@/lib/use-api";
import { ClassTestBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, inputClass, textareaClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { ConfirmModal, Modal } from "@/components/ui/modal";
import { Container, PageHeader } from "@/components/ui/page";
import { Banner, EmptyState } from "@/components/ui/panels";
import { LoadError, Loading } from "@/components/ui/state";
import { Tabs, panelId, tabId } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

export function ClassDetail({ classId }: { classId: string }) {
  const { data: cls, loading, error, reload } = useApi<ClassDetailData>(`/classes/${classId}`);
  const [tab, setTab] = useState("ujian");
  const [creatingExam, setCreatingExam] = useState(false);
  const [addingStudents, setAddingStudents] = useState(false);

  if (loading && !cls) return <Loading text="Memuat kelas…" />;
  if (error || !cls)
    return (
      <Container>
        <LoadError title="Kelas tidak bisa dibuka." message={error ?? "Kelas tidak ditemukan."} onRetry={reload} />
      </Container>
    );

  return (
    <Container>
      <PageHeader
        crumbs={[{ href: "/dosen", label: "Beranda" }, { href: "/dosen/kelas", label: "Kelas" }, { label: cls.name }]}
        title={cls.name}
        meta={`Kode ${cls.code} • Dosen: ${cls.teacher_name ?? "-"}`}
        actions={
          tab === "ujian" ? (
            <Button variant="primary" icon={Plus} onClick={() => setCreatingExam(true)}>
              Buat Ujian
            </Button>
          ) : (
            <Button variant="primary" icon={UserPlus} onClick={() => setAddingStudents(true)}>
              Tambah Mahasiswa
            </Button>
          )
        }
      >
        {cls.description && <p className="max-w-[68ch] text-text-muted">{cls.description}</p>}
      </PageHeader>

      <Tabs
        group="kelas"
        label="Isi kelas"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "ujian", label: "Ujian", count: cls.tests.length },
          { id: "mahasiswa", label: "Mahasiswa", count: cls.students.length },
        ]}
      />
      <div id={panelId("kelas", tab)} role="tabpanel" aria-labelledby={tabId("kelas", tab)} className="pt-6">
        {tab === "ujian" ? (
          <ExamList cls={cls} onCreate={() => setCreatingExam(true)} />
        ) : (
          <StudentList cls={cls} onAdd={() => setAddingStudents(true)} />
        )}
      </div>

      <CreateExamModal classId={cls.id} open={creatingExam} onClose={() => setCreatingExam(false)} />
      <AddStudentsModal cls={cls} open={addingStudents} onClose={() => setAddingStudents(false)} />
    </Container>
  );
}

/* ---------------------------------------------------------------- ujian */
function ExamList({ cls, onCreate }: { cls: ClassDetailData; onCreate: () => void }) {
  if (cls.tests.length === 0)
    return (
      <EmptyState
        icon={FileText}
        title="Belum ada ujian di kelas ini."
        action={
          <Button variant="primary" icon={Plus} onClick={onCreate}>
            Buat Ujian
          </Button>
        }
      >
        Buat ujian, tulis soal dan kunci jawabannya, lalu unggah foto lembar jawaban mahasiswa.
      </EmptyState>
    );
  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-surface">
      {cls.tests.map((t) => (
        <li key={t.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <span className="min-w-0 flex-1">
            <span className="block text-h3 font-bold">{t.test_name}</span>
            <span className="text-small text-text-muted">Tanggal ujian {date(t.test_date)}</span>
          </span>
          <ClassTestBadge status={t.status} />
          <Link
            href={`/dosen/ujian/${t.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 font-semibold text-white hover:bg-primary-hover"
          >
            Buka ujian
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CreateExamModal({ classId, open, onClose }: { classId: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const tests = useApi<ListResponse<TestItem>>(open ? "/tests?scope=mine" : null);
  const subjects = useApi<ListResponse<Subject>>(open ? "/subjects" : null);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const today = todayWIB();
  const [form, setForm] = useState({ subject_id: "", name: "", test_type: "MID", max_score: "100", test_id: "", test_date: today });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function close() {
    setErrors({});
    setServerError(null);
    setForm({ subject_id: "", name: "", test_type: "MID", max_score: "100", test_id: "", test_date: today });
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (mode === "new") {
      if (!form.subject_id) errs.subject_id = "Pilih mata kuliah.";
      if (!form.name.trim()) errs.name = "Isi nama ujian, misalnya UTS Kalkulus.";
      if (!(Number(form.max_score) > 0)) errs.max_score = "Isi nilai maksimal, misalnya 100.";
    } else if (!form.test_id) errs.test_id = "Pilih ujian yang sudah pernah Anda buat.";
    if (!form.test_date) errs.test_date = "Isi tanggal ujian.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    setServerError(null);
    try {
      let testId = form.test_id;
      if (mode === "new") {
        const t = await apiFetch<TestItem>("/tests", {
          method: "POST",
          body: JSON.stringify({
            subject_id: form.subject_id,
            name: form.name.trim(),
            test_type: form.test_type,
            max_score: Number(form.max_score),
          }),
        });
        testId = t.id;
      }
      const ct = await apiFetch<ClassTestItem>("/class-tests", {
        method: "POST",
        body: JSON.stringify({ class_id: classId, test_id: testId, test_date: wibDateToISO(form.test_date) }), 
      });
      invalidate("/classes");
      invalidate("/class-tests");
      toast({ tone: "success", text: "Ujian dibuat. Sekarang tulis soal dan kunci jawabannya." });
      close();
      router.push(`/dosen/ujian/${ct.id}/rubrik`);
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Buat ujian untuk kelas ini"
      footer={
        <>
          <Button onClick={close} disabled={saving}>
            Batal
          </Button>
          <Button type="submit" form="form-ujian" variant="primary" loading={saving} loadingText="Menyimpan…">
            Buat Ujian
          </Button>
        </>
      }
    >
      <form id="form-ujian" onSubmit={submit} noValidate className="space-y-5">
        {serverError && (
          <Banner tone="danger" title="Ujian belum dibuat.">
            {serverError}
          </Banner>
        )}
        <fieldset>
          <legend className="mb-2 font-semibold">Soal ujiannya</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["new", "Ujian baru", "Saya akan menulis soal baru."],
                ["existing", "Pakai ujian lama", "Soalnya sama dengan kelas lain."],
              ] as const
            ).map(([id, label, help]) => (
              <label
                key={id}
                className={`flex cursor-pointer gap-3 rounded-md border p-3 ${mode === id ? "border-2 border-primary bg-primary-soft" : "border-border"}`}
              >
                <input
                  type="radio"
                  name="mode"
                  checked={mode === id}
                  onChange={() => setMode(id)}
                  className="mt-1 h-5 w-5 accent-primary"
                />
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="text-small text-text-muted">{help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {mode === "new" ? (
          <>
            <Field id="ujian-subject" label="Mata kuliah" required error={errors.subject_id}>
              <select id="ujian-subject" className={inputClass} value={form.subject_id} onChange={set("subject_id")}>
                <option value="">{subjects.loading ? "Memuat…" : "Pilih mata kuliah"}</option>
                {subjects.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </Field>
            <Field id="ujian-name" label="Nama ujian" required error={errors.name}>
              <input id="ujian-name" className={inputClass} value={form.name} onChange={set("name")} placeholder="Contoh: UTS Kalkulus 1" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="ujian-type" label="Jenis">
                <select id="ujian-type" className={inputClass} value={form.test_type} onChange={set("test_type")}>
                  {TEST_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="ujian-max" label="Nilai maksimal" required error={errors.max_score}>
                <input id="ujian-max" type="number" min={1} className={inputClass} value={form.max_score} onChange={set("max_score")} />
              </Field>
            </div>
          </>
        ) : (
          <Field id="ujian-test" label="Ujian yang dipakai" required error={errors.test_id}>
            <select id="ujian-test" className={inputClass} value={form.test_id} onChange={set("test_id")}>
              <option value="">{tests.loading ? "Memuat…" : "Pilih ujian"}</option>
              {tests.data?.items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.subject_name} ({t.question_count} soal)
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field id="ujian-date" label="Tanggal ujian" required error={errors.test_date}>
          <input id="ujian-date" type="date" className={inputClass} value={form.test_date} onChange={set("test_date")} />
        </Field>
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------- mahasiswa */
function StudentList({ cls, onAdd }: { cls: ClassDetailData; onAdd: () => void }) {
  const toast = useToast();
  const [removing, setRemoving] = useState<StudentItem | null>(null);

  async function remove() {
    if (!removing) return;
    try {
      await apiFetch(`/classes/${cls.id}/students/${removing.id}`, { method: "DELETE" });
      invalidate("/classes");
      toast({ tone: "success", text: `${removing.name} dikeluarkan dari kelas.` });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
    setRemoving(null);
  }

  if (cls.students.length === 0)
    return (
      <EmptyState
        icon={Users}
        title="Belum ada mahasiswa di kelas ini."
        action={
          <Button variant="primary" icon={UserPlus} onClick={onAdd}>
            Tambah Mahasiswa
          </Button>
        }
      >
        Tambahkan mahasiswa yang sudah terdaftar di kampus. Cari dengan nama atau NIM.
      </EmptyState>
    );
  return (
    <>
      <table className="sheet">
        <thead>
          <tr>
            <th scope="col">NIM</th>
            <th scope="col">Nama</th>
            <th scope="col">Email</th>
            <th scope="col">
              <span className="sr-only">Aksi</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cls.students.map((s) => (
            <tr key={s.id}>
              <td data-label="NIM" className="tabular">
                {s.nim}
              </td>
              <td data-label="Nama">{s.name}</td>
              <td data-label="Email" className="text-text-muted">
                {s.email}
              </td>
              <td data-label="Aksi" className="text-right">
                <Button variant="tertiary" compact icon={UserMinus} onClick={() => setRemoving(s)}>
                  Keluarkan
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ConfirmModal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        title="Keluarkan mahasiswa?"
        confirmLabel="Keluarkan"
        variant="danger"
      >
        <p>
          {removing?.name} ({removing?.nim}) akan dikeluarkan dari kelas ini. Akun mahasiswanya tidak dihapus.
        </p>
      </ConfirmModal>
    </>
  );
}

function AddStudentsModal({ cls, open, onClose }: { cls: ClassDetailData; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [nims, setNims] = useState("");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const results = useApi<ListResponse<StudentItem>>(open ? `/students?q=${encodeURIComponent(query)}` : null);
  const inClass = new Set(cls.students.map((s) => s.id));

  function close() {
    setQ("");
    setQuery("");
    setPicked(new Set());
    setNims("");
    setServerError(null);
    onClose();
  }

  function toggle(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function save() {
    const nimList = nims
      .split(/[\s,;]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (picked.size === 0 && nimList.length === 0) {
      setServerError("Pilih minimal satu mahasiswa atau tulis NIM-nya.");
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      await apiFetch(`/classes/${cls.id}/students`, {
        method: "POST",
        body: JSON.stringify({ student_ids: [...picked], nims: nimList }),
      });
      invalidate("/classes");
      toast({ tone: "success", text: "Mahasiswa ditambahkan ke kelas." });
      close();
    } catch (e) {
      setServerError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Tambah mahasiswa"
      size="lg"
      footer={
        <>
          <Button onClick={close} disabled={saving}>
            Batal
          </Button>
          <Button variant="primary" onClick={save} loading={saving} loadingText="Menyimpan…">
            Tambahkan {picked.size ? `(${picked.size})` : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {serverError && (
          <Banner tone="danger" title="Belum tersimpan.">
            {serverError}
          </Banner>
        )}
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q.trim());
          }}
          className="flex gap-2"
        >
          <label htmlFor="cari-mhs" className="sr-only">
            Cari nama atau NIM
          </label>
          <input id="cari-mhs" className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau NIM" />
          <Button type="submit" icon={Search}>
            Cari
          </Button>
        </form>
        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          {results.loading ? (
            <p className="px-4 py-3 text-text-muted">Mencari…</p>
          ) : (results.data?.items ?? []).length === 0 ? (
            <p className="px-4 py-3 text-text-muted">Tidak ada mahasiswa yang cocok.</p>
          ) : (
            <ul className="divide-y divide-border">
              {results.data!.items.map((s) => {
                const already = inClass.has(s.id);
                return (
                  <li key={s.id}>
                    <label className={`flex min-h-11 items-center gap-3 px-4 py-2 ${already ? "text-text-muted" : "cursor-pointer hover:bg-primary-soft"}`}>
                      <input
                        type="checkbox"
                        disabled={already}
                        checked={already || picked.has(s.id)}
                        onChange={() => toggle(s.id)}
                        className="h-5 w-5 accent-primary"
                      />
                      <span className="tabular w-32 shrink-0">{s.nim}</span>
                      <span className="flex-1">{s.name}</span>
                      {already && <span className="text-small">sudah di kelas</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Field
          id="mhs-nims"
          label="Atau tempel daftar NIM"
          help="Satu NIM per baris, atau pisahkan dengan koma. Mahasiswa harus sudah terdaftar di kampus."
        >
          <textarea id="mhs-nims" rows={3} className={textareaClass} value={nims} onChange={(e) => setNims(e.target.value)} />
        </Field>
        <p className="flex items-start gap-2 text-small text-text-muted">
          <Icon icon={Users} size={16} className="mt-1 shrink-0" />
          Mahasiswa baru (belum punya akun) didaftarkan oleh admin kampus.
        </p>
      </div>
    </Modal>
  );
}
