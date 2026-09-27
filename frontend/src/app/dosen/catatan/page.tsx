"use client";

import { useState } from "react";
import { NotebookPen, Trash2 } from "lucide-react";
import { useData } from "@/lib/store";
import type { FeedbackMemory } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/modal";
import { Banner, EmptyState } from "@/components/ui/panels";
import { Container, PageHeader } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";

export default function CatatanPage() {
  const { data, dispatch } = useData();
  const toast = useToast();
  const [removing, setRemoving] = useState<FeedbackMemory | null>(null);

  return (
    <Container>
      <PageHeader crumbs={[{ href: "/dosen", label: "Dashboard" }, { label: "Catatan Penilaian" }]} title="Catatan Penilaian" />
      <div className="mb-6">
        <Banner tone="info">
          Catatan ini dipakai sebagai contoh/preseden saat AI menilai jawaban serupa. Rubrik tidak berubah otomatis.
          Nonaktifkan catatan yang tidak lagi sesuai.
        </Banner>
      </div>

      {data.memory.length === 0 ? (
        <EmptyState icon={NotebookPen} title="Belum ada catatan penilaian.">
          Catatan dibuat saat Anda mengubah Saran AI di layar Review dan mencentang &ldquo;Simpan sebagai catatan
          penilaian&rdquo;.
        </EmptyState>
      ) : (
        <table className="sheet">
          <thead>
            <tr>
              <th scope="col">Soal / kriteria</th>
              <th scope="col" className="num">
                Saran AI → Dosen
              </th>
              <th scope="col">Alasan</th>
              <th scope="col">Versi rubrik</th>
              <th scope="col">Status</th>
              <th scope="col">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {data.memory.map((m) => {
              const exam = data.exams.find((e) => e.id === m.examId);
              const q = exam?.questions.find((x) => x.id === m.questionId);
              return (
                <tr key={m.id}>
                  <td data-label="Soal">
                    <span className="block font-semibold">{m.criterionName}</span>
                    <span className="text-small text-text-muted">
                      {exam?.title}, Soal {q?.number}
                    </span>
                  </td>
                  <td data-label="Nilai" className="num whitespace-nowrap">
                    <span className="text-text-muted">{m.aiScore}</span> → <span className="font-semibold text-primary">{m.lecturerScore}</span>
                    <span className="text-text-muted"> / {m.max}</span>
                  </td>
                  <td data-label="Alasan" className="max-w-[40ch] text-left">
                    {m.reason}
                  </td>
                  <td data-label="Versi">v{m.rubricVersion}</td>
                  <td data-label="Status">
                    {m.active ? <Badge tone="success">Aktif</Badge> : <Badge tone="neutral">Nonaktif</Badge>}
                  </td>
                  <td data-label="Aksi">
                    <div className="flex flex-wrap justify-end gap-2 sm:justify-start">
                      <Button
                        compact
                        onClick={() => {
                          dispatch({ type: "toggleMemory", id: m.id });
                          toast({ tone: "info", text: m.active ? "Catatan dinonaktifkan. AI tidak lagi memakainya." : "Catatan diaktifkan kembali." });
                        }}
                      >
                        {m.active ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                      <Button compact variant="danger" icon={Trash2} onClick={() => setRemoving(m)}>
                        Hapus
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <ConfirmModal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) dispatch({ type: "deleteMemory", id: removing.id });
          setRemoving(null);
          toast({ tone: "success", text: "Catatan penilaian dihapus." });
        }}
        title="Hapus catatan penilaian ini?"
        confirmLabel="Hapus Catatan"
        variant="danger"
      >
        <p>
          Catatan untuk kriteria &ldquo;{removing?.criterionName}&rdquo; akan dihapus permanen dan tidak dipakai lagi oleh AI.
          Nilai yang sudah diberikan tidak berubah. Jika hanya ingin berhenti memakainya, pilih Nonaktifkan.
        </p>
      </ConfirmModal>
    </Container>
  );
}
