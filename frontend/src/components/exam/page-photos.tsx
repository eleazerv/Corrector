"use client";

import { useState } from "react";
import { ExternalLink, ImageOff } from "lucide-react";
import type { Box } from "@/lib/data";
import { Button } from "@/components/kit/button";
import { Icon } from "@/components/kit/icon";

export interface PhotoPage {
  page_no: number;
  image_url: string | null;
}

export interface PhotoBox {
  page_no: number;
  bbox: Box;
}

/**
 * Photos of a sheet, one page at a time. Boxes mark evidence on the photo; their coordinates are
 * on the pipeline's 0-1000 scale, so they are placed as percentages of the image itself.
 * Mount it with a `key` that changes with the boxes, so the view jumps to the page that has them.
 */
export function PagePhotos({
  pages,
  boxes = [],
  startPage,
  caption,
  onExpired,
}: {
  pages: PhotoPage[];
  boxes?: PhotoBox[];
  /** Page to open on when no box points elsewhere. */
  startPage?: number;
  caption?: string;
  /** Signed photo URLs expire after about ten minutes; this refetches them. */
  onExpired?: () => void;
}) {
  const sorted = [...pages].sort((a, b) => a.page_no - b.page_no);
  const [picked, setPicked] = useState<number | null>(null);
  const [broken, setBroken] = useState<Set<number>>(new Set());
  const current = picked ?? boxes[0]?.page_no ?? startPage ?? sorted[0]?.page_no ?? null;
  const page = sorted.find((p) => p.page_no === current);
  const onPage = boxes.filter((b) => b.page_no === current);
  const withBoxes = new Set(boxes.map((b) => b.page_no));

  if (sorted.length === 0) return null;

  return (
    <div>
      {sorted.length > 1 && (
        <div role="group" aria-label="Halaman" className="mb-2 flex flex-wrap gap-1.5">
          {sorted.map((p) => (
            <button
              key={p.page_no}
              type="button"
              aria-pressed={p.page_no === current}
              onClick={() => setPicked(p.page_no)}
              className={`min-h-11 rounded-md border px-3 text-sm md:min-h-8 ${
                p.page_no === current ? "border-ink bg-ink text-surface" : "border-rule-strong bg-surface hover:bg-sunken"
              }`}
            >
              Hal. {p.page_no}
              {withBoxes.has(p.page_no) && <span className={p.page_no === current ? "" : "text-pencil"}> · bukti</span>}
            </button>
          ))}
        </div>
      )}

      {page && page.image_url && !broken.has(page.page_no) ? (
        <figure>
          <div className="rounded-md border border-rule bg-sunken p-2 text-center">
            <div className="relative inline-block max-w-full align-top">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs from storage, not optimisable */}
              <img
                src={page.image_url}
                alt={`Foto halaman ${page.page_no}`}
                className="block h-auto max-h-[75vh] w-auto max-w-full"
                onError={() => setBroken((b) => new Set(b).add(page.page_no))}
              />
              {onPage.map((b, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="pointer-events-none absolute rounded-sm bg-highlight/35 ring-2 ring-ink"
                  style={{
                    left: `${b.bbox[0] / 10}%`,
                    top: `${b.bbox[1] / 10}%`,
                    width: `${(b.bbox[2] - b.bbox[0]) / 10}%`,
                    height: `${(b.bbox[3] - b.bbox[1]) / 10}%`,
                  }}
                />
              ))}
            </div>
          </div>
          <figcaption className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-pencil">
            <span>{onPage.length > 0 && caption ? caption : `Halaman ${page.page_no}`}</span>
            <a
              href={page.image_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1 underline decoration-rule-strong underline-offset-4 hover:text-ink md:min-h-0"
            >
              Buka ukuran penuh
              <Icon icon={ExternalLink} size={14} />
              <span className="sr-only">(tab baru)</span>
            </a>
          </figcaption>
        </figure>
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-rule-strong px-4 py-5 text-pencil">
          <span className="flex items-center gap-2">
            <Icon icon={ImageOff} size={16} />
            {page && broken.has(page.page_no)
              ? "Foto tidak bisa dimuat. Tautannya berlaku sekitar 10 menit."
              : "Foto halaman ini tidak tersedia."}
          </span>
          {page && broken.has(page.page_no) && onExpired && (
            <Button
              compact
              onClick={() => {
                setBroken(new Set());
                onExpired();
              }}
            >
              Muat ulang foto
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
