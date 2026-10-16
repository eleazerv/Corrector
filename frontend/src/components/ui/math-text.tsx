"use client";
// tampilkan teks hasil OCR yang berisi LaTeX (mis. "\frac{2}{x^2+1}", "\begin{aligned}…")
// sebagai rumus yang enak dibaca. Teks biasa tetap teks biasa.
// - blok \begin{…}…\end{…} -> rumus tampilan (display)
// - baris yang memuat perintah LaTeX (\frac, \lim, ^{…}, …) -> rumus inline; kata Indonesia (>= 3 huruf)
//   di baris itu dibungkus \text{…} supaya tidak jadi huruf miring menempel
// - baris tanpa LaTeX -> teks biasa
// KaTeX dipanggil dengan throwOnError=false + trust=false: LaTeX rusak tampil sebagai teks merah, tidak error,
// dan perintah berbahaya (\href, \htmlData, …) tidak dijalankan.

import "katex/dist/katex.min.css";
import katex from "katex";
import { useMemo } from "react";

const BLOCK_RE = /\\begin\{([a-z*]+)\}[\s\S]*?\\end\{\1\}/g;
const LATEX_HINT_RE = /\\[a-zA-Z]+|[\^_]\{|\\[{}]/;
const WORD_RE = /(?<![\\a-zA-Z{])([A-Za-z]{3,})(?![a-zA-Z{])/g;

function render(tex: string, display: boolean): string {
  return katex.renderToString(tex, { throwOnError: false, displayMode: display, trust: false, strict: "ignore" });
}

function lineToHtml(line: string): string | null {
  if (!LATEX_HINT_RE.test(line)) return null; // teks biasa
  const tex = line.replace(WORD_RE, "\\text{$1}");
  return render(tex, false);
}

type Part = { kind: "text"; value: string } | { kind: "html"; value: string; block: boolean };

function parse(src: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  const pushLines = (chunk: string) => {
    chunk.split("\n").forEach((line, i, arr) => {
      const html = line.trim() ? lineToHtml(line) : null;
      if (html) parts.push({ kind: "html", value: html, block: false });
      else parts.push({ kind: "text", value: line });
      if (i < arr.length - 1) parts.push({ kind: "text", value: "\n" });
    });
  };
  for (const m of src.matchAll(BLOCK_RE)) {
    if (m.index! > last) pushLines(src.slice(last, m.index));
    parts.push({ kind: "html", value: render(m[0], true), block: true });
    last = m.index! + m[0].length;
  }
  if (last < src.length) pushLines(src.slice(last));
  return parts;
}

export function MathText({ text, className = "" }: { text: string; className?: string }) {
  const parts = useMemo(() => parse(text || ""), [text]);
  return (
    <div className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.value}</span>
        ) : (
          <span
            key={i}
            className={p.block ? "my-1 block overflow-x-auto overflow-y-hidden py-1" : "inline"}
            dangerouslySetInnerHTML={{ __html: p.value }}
          />
        ),
      )}
    </div>
  );
}
