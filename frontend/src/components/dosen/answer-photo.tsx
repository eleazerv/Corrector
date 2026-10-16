"use client";
// Hijau = bagian yang memberi poin, kuning = sebagian, merah = bagian yang membuat poin berkurang.
import { useState } from "react";
import { ImageOff, ZoomIn, ZoomOut } from "lucide-react";
import type { BBox } from "@/lib/backend-types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

const KIND_STYLE: Record<string, string> = {
  gain: "border-success bg-success/10",
  partial: "border-warning bg-warning/10",
  loss: "border-danger bg-danger/10",
};

export function BoxLegend() {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-small">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-5 border-2 border-success bg-success/10" aria-hidden="true" /> memberi poin
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-5 border-2 border-warning bg-warning/10" aria-hidden="true" /> poin sebagian
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-5 border-2 border-danger bg-danger/10" aria-hidden="true" /> poin berkurang
      </span>
    </p>
  );
}

export function AnswerPhoto({
  pages,
  boxes,
}: {
  pages: { page_no: number; image_url: string | null }[];
  boxes: Pick<BBox, "page_no" | "bbox" | "kind">[];
}) {
  const [page, setPage] = useState(pages[0]?.page_no ?? 1);
  const [zoom, setZoom] = useState(false);
  const current = pages.find((p) => p.page_no === page) ?? pages[0];
  const pageBoxes = boxes.filter((b) => b.page_no === current?.page_no && b.bbox?.length === 4);

  if (!current)
    return (
      <p className="flex items-center gap-2 rounded-md border border-dashed border-border-strong bg-surface p-6 text-text-muted">
        <Icon icon={ImageOff} /> Foto lembar jawaban belum ada.
      </p>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {pages.length > 1 &&
          pages.map((p) => (
            <Button key={p.page_no} compact variant={p.page_no === current.page_no ? "primary" : "secondary"} onClick={() => setPage(p.page_no)}>
              Hal. {p.page_no}
            </Button>
          ))}
        <Button compact variant="tertiary" icon={zoom ? ZoomOut : ZoomIn} onClick={() => setZoom((z) => !z)} className="ml-auto">
          {zoom ? "Perkecil" : "Perbesar"}
        </Button>
      </div>
      <div className={`rounded-md border border-border bg-surface ${zoom ? "max-h-[80vh] overflow-auto" : ""}`}>
        {current.image_url ? (
          <div className={`relative ${zoom ? "w-[180%]" : "w-full"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.image_url} alt={`Lembar jawaban halaman ${current.page_no}`} className="block w-full" />
            {pageBoxes.map((b, i) => {
              const [x1, y1, x2, y2] = b.bbox;
              return (
                <span
                  key={i}
                  aria-hidden="true"
                  className={`absolute border-2 ${KIND_STYLE[b.kind] ?? "border-info"}`}
                  style={{ left: `${x1 / 10}%`, top: `${y1 / 10}%`, width: `${(x2 - x1) / 10}%`, height: `${(y2 - y1) / 10}%` }}
                />
              );
            })}
          </div>
        ) : (
          <p className="flex items-center gap-2 p-6 text-text-muted">
            <Icon icon={ImageOff} /> Foto halaman {current.page_no} tidak bisa ditampilkan.
          </p>
        )}
      </div>
      {pageBoxes.length > 0 && <BoxLegend />}
    </div>
  );
}
