import type { LucideIcon } from "lucide-react";

/** Lucide at the size and stroke fixed by design.md §6. Always decorative: the label carries meaning. */
export function Icon({ icon: C, size = 20, className }: { icon: LucideIcon; size?: number; className?: string }) {
  return <C size={size} strokeWidth={1.75} aria-hidden="true" className={className} />;
}
