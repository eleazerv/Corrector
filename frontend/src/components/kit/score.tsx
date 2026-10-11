import { formatNumber } from "@/lib/format";

/** AI suggestion: plain grey. `label` shows "AI" where the surrounding text does not already say it. */
export function AiScore({
  value,
  max,
  size = "md",
  label,
}: {
  value: number | null;
  max?: number | null;
  size?: "md" | "lg";
  label?: boolean;
}) {
  return (
    <span className={`num whitespace-nowrap text-pencil ${size === "lg" ? "text-3xl" : ""}`}>
      {label ? <span className="mr-1 text-[0.8em] font-semibold">AI</span> : <span className="sr-only">Saran AI: </span>}
      {formatNumber(value)}
      {max !== undefined && max !== null && <> / {formatNumber(max)}</>}
    </span>
  );
}

/** The lecturer's final score: the only red on the page. */
export function FinalScore({ value, max, size = "md" }: { value: number | null; max?: number | null; size?: "md" | "lg" | "xl" }) {
  const text = { md: "", lg: "text-3xl", xl: "text-5xl md:text-6xl" }[size];
  return (
    <span className={`num inline-flex items-baseline gap-1 whitespace-nowrap ${text}`}>
      <span className="sr-only">Nilai akhir: </span>
      <span className="font-bold text-pen">{formatNumber(value)}</span>
      {max !== undefined && max !== null && (
        <span className={`text-pencil ${size === "xl" ? "text-2xl" : ""}`}>/ {formatNumber(max)}</span>
      )}
    </span>
  );
}
