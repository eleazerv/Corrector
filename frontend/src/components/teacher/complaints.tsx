"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft } from "lucide-react";
import { api, errorMessage, type ComplaintItem, type ComplaintStatus } from "@/lib/data";
import { complaintStatus, formatDateTime, formatNumber } from "@/lib/format";
import { invalidate, useResource } from "@/lib/use-resource";
import { Page, PageHead } from "@/components/app/page";
import { Button } from "@/components/kit/button";
import { Field, FieldError, describedBy, inputClass, textareaClass } from "@/components/kit/field";
import { Icon } from "@/components/kit/icon";
import { AiScore, FinalScore } from "@/components/kit/score";
import { Empty, ErrorState, Loading, MockNotice, Notice, StatusTag } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { aiGrade } from "@/components/exam/answer-utils";

const TABS: { status: ComplaintStatus; label: string }[] = [
  { status: "pending", label: "Baru" },
  { status: "accepted", label: "Diterima" },
  { status: "rejected", label: "Ditolak" },
];

const RECOMMENDATION: Record<string, string> = {
  accept: "Terima keberatan",
  reject: "Tolak keberatan",
  review: "Perlu dicek dosen",
};

/** The worker stores "accept: <reason>" (tasks/summarize_complaint.py). */
function parseRecommendation(raw: string | null) {
  if (!raw) return null;
  const [head, ...rest] = raw.split(":");
  const key = head.trim().toLowerCase();
  return { label: RECOMMENDATION[key] ?? head, reason: rest.join(":").trim() };
}

const MIN_RESPONSE = 10;

function target(c: ComplaintItem) {
  return c.question_number ? `soal ${c.question_number}` : "lembar secara umum";
}

function DecisionForm({ c }: { c: ComplaintItem }) {
  const toast = useToast();
  const perQuestion = c.test_answer_id !== null;
  const max = c.max_points ?? 0;
  const [decision, setDecision] = useState<"accepted" | "rejected" | null>(null);
  const [grade, setGrade] = useState(c.current_grade === null ? "" : String(c.current_grade));
  const [response, setResponse] = useState("");
  const [errors, setErrors] = useState<{ decision?: string; grade?: string; response?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const changesGrade = decision === "accepted" && perQuestion;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const g = Number(grade.replace(",", "."));
    const next = {
      decision: decision ? undefined : "Pilih keputusan.",
      grade: changesGrade && (!grade.trim() || !Number.isFinite(g) || g < 0 || g > max) ? `Isi angka 0 sampai ${formatNumber(max)}.` : undefined,
      response:
        response.trim().length < MIN_RESPONSE
          ? `Tulis tanggapan minimal ${MIN_RESPONSE} karakter. Mahasiswa membaca tanggapan ini.`
          : undefined,
    };
    setErrors(next);
    if (next.decision || next.grade || next.response) return;
    setBusy(true);
    try {
      const r = await api.resolveComplaint(c.id, {
        status: decision!,
        teacher_response: response.trim(),
        new_grade: changesGrade ? g : null,
      });
      invalidate("complaints", `sheet:${c.student_test_id}`, `progress:${c.class_test_id}`);
      toast(
        r.new_grade !== null
          ? `Keberatan diterima. Nilai ${target(c)} menjadi ${formatNumber(r.new_grade)}.`
          : decision === "accepted"
            ? "Keberatan diterima."
            : "Keberatan ditolak.",
      );
    } catch (err) {
      setErrors({ form: errorMessage(err) });
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-md border border-rule bg-surface p-5">
      <fieldset>
        <legend className="mb-2 text-lg font-semibold">Keputusan Anda</legend>
        <div className="space-y-1">
          {(
            [
              {
                value: "accepted",
                label: perQuestion ? "Terima dan ubah nilai" : "Terima",
                hint: perQuestion
                  ? `Nilai ${target(c)} diganti, perubahannya tercatat di riwayat nilai.`
                  : "Keberatan ini tidak menunjuk satu soal, jadi tidak ada nilai yang berubah otomatis.",
              },
              { value: "rejected", label: "Tolak", hint: "Nilai tetap. Mahasiswa membaca tanggapan Anda." },
            ] as const
          ).map((d) => (
            <label key={d.value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-sunken">
              <input
                type="radio"
                name="keputusan"
                value={d.value}
                checked={decision === d.value}
                onChange={() => setDecision(d.value)}
                className="mt-1 h-4 w-4 shrink-0 accent-ink"
              />
              <span>
                <span className="font-medium">{d.label}</span>
                <span className="block text-sm text-pencil">{d.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldError message={errors.decision} />
      </fieldset>
      {changesGrade && (
        <Field id="nilai-baru" label={`Nilai baru ${target(c)}`} error={errors.grade}>
          <div className="flex items-center gap-2">
            <input
              id="nilai-baru"
              inputMode="decimal"
              className={`${inputClass} num w-24 text-right`}
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              aria-invalid={!!errors.grade}
              aria-describedby={describedBy("nilai-baru", null, errors.grade)}
            />
            <span className="num text-pencil">/ {formatNumber(max)}</span>
          </div>
        </Field>
      )}
      {decision === "accepted" && !perQuestion && (
        <Notice>
          Bila nilai salah satu soal perlu diubah, ubah di{" "}
          <Link
            href={`/dosen/ujian/${c.class_test_id}/review?lembar=${c.student_test_id}`}
            className="underline underline-offset-4"
          >
            layar pemeriksaan lembar ini
          </Link>
          .
        </Notice>
      )}
      <Field id="tanggapan" label="Tanggapan untuk mahasiswa" error={errors.response}>
        <textarea
          id="tanggapan"
          rows={3}
          className={textareaClass}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          aria-invalid={!!errors.response}
          aria-describedby={describedBy("tanggapan", null, errors.response)}
        />
      </Field>
      <FieldError message={errors.form} />
      <Button type="submit" variant="primary" busy={busy}>
        Simpan keputusan
      </Button>
    </form>
  );
}

/** The question and answer behind a complaint, read from the sheet the lecturer can already open. */
function AnswerContext({ c }: { c: ComplaintItem }) {
  const sheet = useResource(`sheet:${c.student_test_id}`, () => api.getStudentTest(c.student_test_id));
  if (!c.test_answer_id) return null;
  if (sheet.loading) return <Loading what="jawaban" />;
  if (sheet.error) return <ErrorState error={sheet.error} onRetry={sheet.reload} />;
  const a = sheet.data?.answers.find((x) => x.id === c.test_answer_id);
  if (!a) return null;
  return (
    <section aria-labelledby="konteks-h" className="rounded-md border border-rule bg-surface px-4 py-4">
      <h3 id="konteks-h" className="text-lg">
        Soal {a.question.number}
      </h3>
      <p className="mt-1">{a.question.text}</p>
      {a.answer_text && <p className="mt-3 border-t border-rule pt-3 whitespace-pre-line">{a.answer_text}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-rule pt-3 text-sm">
        <div>
          <dt className="text-pencil">Saran AI</dt>
          <dd className="text-lg">
            <AiScore value={aiGrade(a)} max={a.question.max_points} />
          </dd>
        </div>
        <div>
          <dt className="text-pencil">Nilai sekarang</dt>
          <dd className="text-lg">
            <FinalScore value={a.grade} max={a.question.max_points} />
          </dd>
        </div>
      </dl>
      {a.criteria_result.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm">
          {a.criteria_result.map((r, i) => (
            <li key={r.criterion_id} className="flex justify-between gap-3">
              <span>
                <span className="num text-pencil">{i + 1}.</span> {r.description ?? "Kriteria tanpa keterangan"}
                {r.reasoning && <span className="block text-pencil">{r.reasoning}</span>}
              </span>
              <span className="shrink-0">
                <AiScore value={r.points} max={r.max_points} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ComplaintView({ c, onBack }: { c: ComplaintItem; onBack: () => void }) {
  const st = complaintStatus(c.status, "teacher");
  const rec = parseRecommendation(c.ai_recommendation);

  return (
    <article aria-labelledby="k-judul" className="space-y-6">
      <button type="button" onClick={onBack} className="-ml-1 inline-flex min-h-11 items-center gap-1 text-pencil lg:hidden">
        <Icon icon={ChevronLeft} />
        Semua keberatan
      </button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="k-judul" className="text-2xl">
            {c.student_name}
          </h2>
          <p className="text-pencil">
            <span className="num text-sm">{c.nim}</span> · {c.test_name}, {target(c)}
          </p>
        </div>
        <StatusTag tone={st.tone}>{st.label}</StatusTag>
      </header>

      <section aria-labelledby="asli-h">
        <h3 id="asli-h" className="text-sm font-medium text-pencil">
          Keberatan mahasiswa
        </h3>
        <blockquote id="keberatan-asli" className="mt-2 border-l-2 border-ink pl-4 text-[16px] leading-relaxed whitespace-pre-line">
          {c.complaint}
        </blockquote>
      </section>

      <section aria-labelledby="ai-h" className="rounded-md border border-dashed border-rule-strong px-4 py-3">
        <h3 id="ai-h" className="text-sm font-medium text-pencil">
          Ringkasan AI{" "}
          <a href="#keberatan-asli" className="font-normal underline underline-offset-4">
            (bandingkan dengan keberatan asli)
          </a>
        </h3>
        {c.ai_summary ? (
          <>
            <p className="mt-1 text-pencil">{c.ai_summary}</p>
            {rec && (
              <p className="mt-2 text-sm">
                Saran AI: <strong className="font-semibold">{rec.label}</strong>
                {rec.reason && <span className="text-pencil">. {rec.reason}</span>}
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-pencil">Ringkasan belum ada. AI membuatnya beberapa saat setelah keberatan masuk.</p>
        )}
      </section>

      <AnswerContext c={c} />

      <Link
        href={`/dosen/ujian/${c.class_test_id}/review?lembar=${c.student_test_id}`}
        className="inline-flex min-h-11 items-center underline decoration-rule-strong underline-offset-4"
      >
        Buka lembar lengkapnya
      </Link>

      {c.teacher_response && (
        <Notice title={c.resolved_at ? `Tanggapan Anda, ${formatDateTime(c.resolved_at)}` : "Tanggapan Anda"}>
          {c.teacher_response}
        </Notice>
      )}

      {c.status === "pending" && <DecisionForm key={c.id} c={c} />}
    </article>
  );
}

export function ComplaintInbox({ initial }: { initial?: string }) {
  const lists = {
    pending: useResource("complaints:pending", () => api.listComplaints("pending")),
    accepted: useResource("complaints:accepted", () => api.listComplaints("accepted")),
    rejected: useResource("complaints:rejected", () => api.listComplaints("rejected")),
  };
  const [tab, setTab] = useState<ComplaintStatus>("pending");
  const [selected, setSelected] = useState<string | null>(initial ?? null);

  useEffect(() => {
    const url = selected ? `?k=${selected}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [selected]);

  const current = lists[tab];
  const all = [...(lists.pending.data?.items ?? []), ...(lists.accepted.data?.items ?? []), ...(lists.rejected.data?.items ?? [])];
  const chosen = all.find((c) => c.id === selected) ?? null;
  const shown = current.data?.items ?? [];
  const anyLoading = lists.pending.loading || lists.accepted.loading || lists.rejected.loading;

  const row = (c: ComplaintItem) => {
    const on = c.id === selected;
    return (
      <li key={c.id}>
        <button
          type="button"
          aria-current={on ? "true" : undefined}
          onClick={() => setSelected(c.id)}
          className={`w-full rounded-md px-3 py-3 text-left ${on ? "bg-surface ring-1 ring-ink" : "hover:bg-sunken"}`}
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{c.student_name}</span>
            {c.resolved_at && <span className="shrink-0 text-[13px] text-pencil">{formatDateTime(c.resolved_at)}</span>}
          </span>
          <span className="block text-sm text-pencil">
            {c.test_name}, {target(c)}
          </span>
          <span className="mt-1 line-clamp-2 block text-sm">{c.complaint}</span>
        </button>
      </li>
    );
  };

  return (
    <Page wide>
      <PageHead title="Keberatan nilai" meta="Keberatan mahasiswa atas nilai yang sudah dipublikasikan." />
      <div className="mb-4">
        <MockNotice endpoint="listComplaints" />
      </div>
      <div className="lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-8">
        <div className={chosen ? "hidden lg:block" : ""}>
          <div role="group" aria-label="Saring keberatan" className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.status}
                type="button"
                aria-pressed={tab === t.status}
                onClick={() => setTab(t.status)}
                className={`min-h-11 rounded-md border px-3 text-sm md:min-h-9 ${
                  tab === t.status ? "border-ink bg-ink text-surface" : "border-rule-strong bg-surface hover:bg-sunken"
                }`}
              >
                {t.label}
                {lists[t.status].data && <span className="num"> ({lists[t.status].data!.items.length})</span>}
              </button>
            ))}
          </div>
          <div className="mt-4">
            {current.loading ? (
              <Loading what="keberatan" />
            ) : current.error ? (
              <ErrorState error={current.error} onRetry={current.reload} />
            ) : shown.length === 0 ? (
              <p className="px-3 py-4 text-pencil">
                {tab === "pending"
                  ? "Tidak ada keberatan baru. Keberatan muncul di sini setelah mahasiswa mengajukannya dari halaman nilai."
                  : "Tidak ada keberatan di saringan ini."}
              </p>
            ) : (
              <ul className="space-y-1">{shown.map(row)}</ul>
            )}
          </div>
        </div>
        <div className={chosen ? "" : "hidden lg:block"}>
          {chosen ? (
            <ComplaintView key={chosen.id} c={chosen} onBack={() => setSelected(null)} />
          ) : selected && anyLoading ? (
            <Loading what="keberatan" />
          ) : all.length === 0 && !anyLoading ? (
            <Empty title="Belum ada keberatan">Keberatan muncul di sini setelah mahasiswa mengajukannya dari halaman nilai.</Empty>
          ) : (
            <p className="rounded-md border border-dashed border-rule-strong px-5 py-10 text-center text-pencil">
              Pilih keberatan di kiri untuk membaca dan memutuskannya.
            </p>
          )}
        </div>
      </div>
    </Page>
  );
}
