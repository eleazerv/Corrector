import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Icon } from "@/components/kit/icon";

export interface Crumb {
  href: string;
  label: string;
}

/** Desktop: the full trail. Phone: one "back to parent" link, which is what the trail is for there. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  const parent = items[items.length - 1];
  return (
    <nav aria-label="Lokasi" className="text-sm">
      <ol className="hidden flex-wrap items-center gap-x-2 text-pencil sm:flex">
        {items.map((c) => (
          <li key={c.href} className="flex items-center gap-2">
            <Link href={c.href} className="underline decoration-rule-strong underline-offset-4 hover:text-ink">
              {c.label}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
        ))}
      </ol>
      <Link href={parent.href} className="-ml-1 inline-flex min-h-11 items-center gap-1 text-pencil sm:hidden">
        <Icon icon={ChevronLeft} />
        {parent.label}
      </Link>
    </nav>
  );
}

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto w-full px-4 pt-5 pb-16 sm:px-6 ${wide ? "max-w-[1400px]" : "max-w-5xl"}`}>{children}</main>
  );
}

export function PageHead({
  crumbs = [],
  title,
  meta,
  actions,
}: {
  crumbs?: Crumb[];
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <Breadcrumbs items={crumbs} />
      <div className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight sm:text-[32px]">{title}</h1>
          {meta && <div className="mt-1 text-pencil">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function SectionTitle({ children, aside, id }: { children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="text-xl">
        {children}
      </h2>
      {aside && <div className="text-sm text-pencil">{aside}</div>}
    </div>
  );
}
