import type { LucideIcon } from "lucide-react";

/** Lucide glyphs are used only as status and action markers next to text, never alone as meaning. */
export function Icon({ icon: C, size = 16, className }: { icon: LucideIcon; size?: number; className?: string }) {
  return <C aria-hidden="true" size={size} strokeWidth={1.75} className={`shrink-0 ${className ?? ""}`} />;
}
