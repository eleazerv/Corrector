import type { SheetAnswer, SheetPage } from "@/lib/data";

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The AI's own grade for an answer. An override replaces test_answers.grade but leaves
 * criteria_result alone, so the AI's points are still the sum of its criteria.
 */
export function aiGrade(a: SheetAnswer): number | null {
  if (a.criteria_result.length > 0) {
    return round(Math.min(a.question.max_points, a.criteria_result.reduce((s, r) => s + r.points, 0)));
  }
  return a.override ? a.override.old_grade : a.grade;
}

/** The current grade is the lecturer's override. A later AI regrade replaces it, so compare values. */
export const changedByLecturer = (a: SheetAnswer) => a.override !== null && a.grade === a.override.new_grade;

/** Text of an OCR block by its pipeline id, "p{page_no}-{index in that page's ocr_result}". */
export function blockText(pages: SheetPage[], id: string): string | null {
  const m = /^p(\d+)-(\d+)$/.exec(id);
  if (!m) return null;
  const page = pages.find((p) => p.page_no === Number(m[1]));
  return page?.ocr_blocks?.[Number(m[2])]?.text ?? null;
}

export interface Segment {
  text: string;
  marked: boolean;
}

/** Splits `text` so every occurrence of a needle is its own marked segment. */
export function markSegments(text: string, needles: string[]): Segment[] {
  const ranges: [number, number][] = [];
  for (const raw of needles) {
    const n = raw.trim();
    if (!n) continue;
    let from = 0;
    for (let at = text.indexOf(n, from); at !== -1; at = text.indexOf(n, from)) {
      ranges.push([at, at + n.length]);
      from = at + n.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  const out: Segment[] = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (s > pos) out.push({ text: text.slice(pos, s), marked: false });
    out.push({ text: text.slice(s, e), marked: true });
    pos = e;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), marked: false });
  return out;
}
