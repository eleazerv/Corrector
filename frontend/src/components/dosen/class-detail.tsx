"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { ClipboardList, FileSpreadsheet, Plus, UserPlus, Users } from "lucide-react";
import { useData, uid } from "@/lib/store";
import { examMax, formatDate, stageText } from "@/lib/grading";
import type { ClassRoom } from "@/lib/types";
import { Badge, FileBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, describedBy, inputClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/panels";
import { Container, PageHeader } from "@/components/ui/page";
import { Tabs, panelId, tabId } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { MissingState } from "./not-found-state";

export function ClassDetail({ classId }: { classId: string }) {
  const { data } = useData();
  const [tab, setTab] = useState("mahasiswa");
  const [modal, setModal] = useState<"add" | "import" | "exam" | null>(null);
  const cls = data.classes.find((c) => c.id === classId);
  if (!cls) return <MissingState what="Kelas" back="/dosen/kelas" backLabel="Kembali ke daftar kelas" />;

  const exams = data.exams.filter((e) => e.classId === cls.id);

  return (
    <Container>
      <PageHeader
        crumbs={[
          { href: "/dosen", label: "Dashboard" },
          { href: "/dosen/kelas", label: "Kelas" },
          { label: cls.name },
        ]}
        title={cls.name}
        meta={`${cls.code} • ${cls.period}`}
        actions={
          tab === "mahasiswa" ? (
            <>
              <Button icon={FileSpreadsheet} onClick={() => setModal("import")}>
                Impor CSV/XLSX
              </Button>
              <Button variant="primary" icon={UserPlus} onClick={() => setModal("add")}>
                Tambah Mahasiswa
              </Button>
            </>
          ) : (
            <Button variant="primary" icon={Plus} onClick={() => setModal("exam")}>
              Buat Ujian
            </Button>
          )
        }
      >
        {cls.description && <p className="max-w-[68ch]">{cls.description}</p>}
      </PageHeader>

      <Tabs
        group="kelas"
        label="Isi kelas"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "mahasiswa", label: "Mahasiswa", count: cls.studentIds.length },
          { id: "ujian", label: "Ujian", count: exams.length },
        ]}
      />
      <div role="tabpanel" id={panelId("kelas", tab)} aria-labelledby={tabId("kelas", tab)} className="pt-6">
        {tab === "mahasiswa" ? (
          <StudentsTab cls={cls} onAdd={() => setModal("add")} />
        ) : (
          <ExamsTab classId={cls.id} onCreate={() => setModal("exam")} />
        )}
      </div>

      <AddStudentModal cls={cls} open={modal === "add"} onClose={() => setModal(null)} />
      <ImportModal cls={cls} open={modal === "import"} onClose={() => setModal(null)} />
      <CreateExamModal classId={cls.id} open={modal === "exam"} onClose={() => setModal(null)} />
    </Container>
  );
}

function StudentsTab({ cls, onAdd }: { cls: ClassRoom; onAdd: () => void }) {
  const { data } = useData();
  const students = cls.studentIds.map((id) => data.students.find((s) => s.id === id)!).filter(Boolean);
  const latest = [...data.exams]
    .filter((e) => e.classId === cls.id && data.submissions.some((s) => s.examId === e.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  if (students.length === 0) {
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
        Tambahkan mahasiswa satu per satu atau impor dari file CSV agar jawaban bisa dipetakan ke NIM.
      </EmptyState>
    );
  }

  return (
    <table className="sheet">
      <thead>
        <tr>
          <th scope="col">NIM</th>
          <th scope="col">Nama</th>
          <th scope="col">{latest ? `Status jawaban ${latest.title}` : "Status jawaban"}</th>
        </tr>
      </thead>
      <tbody>
        {students.map((s) => {
          const sub = latest && data.submissions.find((x) => x.examId === latest.id && x.studentId === s.id);
          return (
            <tr key={s.id}>
              <td data-label="NIM" className="tabular">
                {s.nim}
              </td>
              <td data-label="Nama">{s.name}</td>
              <td data-label="Status">
                {sub ? <FileBadge status={sub.status} /> : <Badge tone="neutral">Belum ada jawaban</Badge>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ExamsTab({ classId, onCreate }: { classId: string; onCreate: () => void }) {
  const { data } = useData();
  const exams = data.exams.filter((e) => e.classId === classId);
  if (exams.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Belum ada ujian di kelas ini."
        action={
          <Button variant="primary" icon={Plus} onClick={onCreate}>
            Buat Ujian
          </Button>
        }
      >
        Buat ujian pertama untuk mulai menyiapkan soal dan rubrik.
      </EmptyState>
    );
  }
  return (
    <table className="sheet">
      <thead>
        <tr>
          <th scope="col">Nama ujian</th>
          <th scope="col">Tahap</th>
          <th scope="col">Progres penilaian</th>
          <th scope="col">Dibuat</th>
        </tr>
      </thead>
      <tbody>
        {exams.map((e) => {
          const subs = data.submissions.filter((s) => s.examId === e.id);
          const done = subs.filter((s) => ["graded", "review_required", "published"].includes(s.status)).length;
          const first = e.stage === "draft" ? "rubrik" : e.stage === "publish" || e.stage === "ditutup" ? "publikasi" : "review";
          return (
            <tr key={e.id}>
              <td data-label="Ujian">
                <Link href={`/dosen/ujian/${e.id}/${first}`} className="font-medium underline decoration-border-strong underline-offset-4 hover:decoration-current">
                  {e.title}
                </Link>
                <span className="block text-small text-text-muted">Nilai maksimum {examMax(e)}</span>
              </td>
              <td data-label="Tahap">{stageText(e.stage)}</td>
              <td data-label="Progres" className="tabular">
                {subs.length ? `${done} dari ${subs.length} file dinilai` : "Belum ada jawaban"}
              </td>
              <td data-label="Dibuat">{formatDate(e.createdAt)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AddStudentModal({ cls, open, onClose }: { cls: ClassRoom; open: boolean; onClose: () => void }) {
  const { data, dispatch } = useData();
  const toast = useToast();
  const [nim, setNim] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<{ nim?: string; name?: string }>({});

  function close() {
    setNim("");
    setName("");
    setErrors({});
    onClose();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!/^\d{5,20}$/.test(nim.trim())) errs.nim = "NIM hanya berisi angka, 5 sampai 20 digit.";
    else if (cls.studentIds.some((id) => data.students.find((s) => s.id === id)?.nim === nim.trim()))
      errs.nim = "NIM ini sudah terdaftar di kelas.";
    if (!name.trim()) errs.name = "Isi nama lengkap mahasiswa.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    dispatch({ type: "addStudents", classId: cls.id, students: [{ nim: nim.trim(), name: name.trim() }] });
    toast({ tone: "success", text: `${name.trim()} ditambahkan ke ${cls.name}.` });
    close();
  }

  return (
    <Modal open={open} onClose={close} title="Tambah mahasiswa">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field id="mhs-nim" label="NIM" required error={errors.nim}>
          <input
            id="mhs-nim"
            inputMode="numeric"
            className={inputClass}
            value={nim}
            onChange={(e) => setNim(e.target.value)}
            aria-invalid={Boolean(errors.nim)}
            aria-describedby={describedBy("mhs-nim", false, errors.nim)}
          />
        </Field>
        <Field id="mhs-name" label="Nama lengkap" required error={errors.name}>
          <input
            id="mhs-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama sesuai data akademik"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy("mhs-name", false, errors.name)}
          />
        </Field>
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button onClick={close}>Batal</Button>
          <Button type="submit" variant="primary">
            Simpan Mahasiswa
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface ImportRow {
  line: number;
  nim: string;
  name: string;
  error?: string;
}

function parseCsv(text: string, existing: Set<string>): ImportRow[] {
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .forEach((line, i) => {
      if (!line) return;
      const [rawNim = "", ...rest] = line.split(/[,;]/);
      const nim = rawNim.trim().replace(/^"|"$/g, "");
      const name = rest.join(" ").trim().replace(/^"|"$/g, "");
      if (i === 0 && !/^\d/.test(nim)) return; // header row
      let error: string | undefined;
      if (!/^\d{5,20}$/.test(nim)) error = "NIM harus berupa angka 5 sampai 20 digit.";
      else if (!name) error = "Nama kosong.";
      else if (seen.has(nim)) error = "NIM ganda di file ini.";
      else if (existing.has(nim)) error = "Sudah terdaftar di kelas.";
      seen.add(nim);
      rows.push({ line: i + 1, nim, name, error });
    });
  return rows;
}

function ImportModal({ cls, open, onClose }: { cls: ClassRoom; open: boolean; onClose: () => void }) {
  const { data, dispatch } = useData();
  const toast = useToast();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  function close() {
    setRows(null);
    setFileError(null);
    setFileName("");
    onClose();
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setRows(null);
    setFileError(null);
    if (!file) return;
    setFileName(file.name);
    if (/\.xlsx?$/i.test(file.name)) {
      setFileError("Pratinjau XLSX belum tersedia di prototipe ini. Simpan file sebagai CSV lalu pilih lagi.");
      return;
    }
    if (!/\.csv$/i.test(file.name)) {
      setFileError("Format tidak dikenali. Pilih file .csv dengan kolom NIM dan Nama.");
      return;
    }
    const existing = new Set(cls.studentIds.map((id) => data.students.find((s) => s.id === id)?.nim ?? ""));
    const parsed = parseCsv(await file.text(), existing);
    if (parsed.length === 0) setFileError("File tidak berisi baris data. Pastikan setiap baris berisi NIM,Nama.");
    else setRows(parsed);
  }

  const valid = rows?.filter((r) => !r.error) ?? [];

  function save() {
    dispatch({ type: "addStudents", classId: cls.id, students: valid.map(({ nim, name }) => ({ nim, name })) });
    toast({ tone: "success", text: `${valid.length} mahasiswa diimpor ke ${cls.name}.` });
    close();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Impor mahasiswa dari file"
      size="lg"
      footer={
        <>
          <Button onClick={close}>Batal</Button>
          <Button variant="primary" disabled={valid.length === 0} onClick={save}>
            Simpan {valid.length} Mahasiswa
          </Button>
        </>
      }
    >
      <Field
        id="impor-file"
        label="File daftar mahasiswa"
        help="Satu mahasiswa per baris dengan format NIM,Nama. Baris judul kolom boleh ada."
      >
        <input
          id="impor-file"
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={onFile}
          aria-describedby="impor-file-help"
          className="block min-h-11 w-full text-body file:mr-4 file:min-h-11 file:rounded-md file:border file:border-primary file:bg-surface file:px-4 file:font-semibold file:text-primary"
        />
      </Field>
      <FieldError message={fileError} />
      {rows && (
        <div className="mt-5">
          <p className="mb-2 font-semibold">
            Pratinjau {fileName}: {valid.length} siap diimpor, {rows.length - valid.length} bermasalah.
          </p>
          <div className="max-h-72 overflow-y-auto">
            <table className="sheet">
              <thead>
                <tr>
                  <th scope="col">Baris</th>
                  <th scope="col">NIM</th>
                  <th scope="col">Nama</th>
                  <th scope="col">Validasi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td data-label="Baris" className="tabular">
                      {r.line}
                    </td>
                    <td data-label="NIM" className="tabular">
                      {r.nim || "(kosong)"}
                    </td>
                    <td data-label="Nama">{r.name || "(kosong)"}</td>
                    <td data-label="Validasi">
                      {r.error ? <Badge tone="danger">{r.error}</Badge> : <Badge tone="success">Siap</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CreateExamModal({ classId, open, onClose }: { classId: string; open: boolean; onClose: () => void }) {
  const { dispatch } = useData();
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setTitle("");
    setError(null);
    onClose();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Isi nama ujian, misalnya Ujian Akhir Semester.");
      return;
    }
    const id = uid("e");
    const now = new Date().toISOString();
    dispatch({
      type: "createExam",
      exam: {
        id,
        classId,
        title: title.trim(),
        stage: "draft",
        rubricVersion: 0,
        rubricUpdatedAt: now,
        createdAt: now,
        questions: [],
        studentView: { perQuestion: true, evidence: true, overrideReason: false },
      },
    });
    toast({ tone: "success", text: `Ujian ${title.trim()} dibuat. Tambahkan soal dan rubrik.` });
    close();
    router.push(`/dosen/ujian/${id}/rubrik`);
  }

  return (
    <Modal open={open} onClose={close} title="Buat ujian baru">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field id="ujian-title" label="Nama ujian" required error={error} help="Soal dan nilai maksimum diatur di langkah berikutnya.">
          <input
            id="ujian-title"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy("ujian-title", true, error)}
          />
        </Field>
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button onClick={close}>Batal</Button>
          <Button type="submit" variant="primary">
            Buat Ujian
          </Button>
        </div>
      </form>
    </Modal>
  );
}
