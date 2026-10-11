import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./icon";

export interface Crumb {
  href?: string;
  label: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-small">
      <ol className="flex flex-wrap items-center gap-x-1">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <Icon icon={ChevronRight} size={14} className="text-border-strong" />}
            {c.href ? (
              <Link href={c.href} className="inline-flex min-h-11 items-center text-text-muted hover:text-text md:min-h-0">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-text">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  crumbs,
  title,
  meta,
  actions,
  children,
}: {
  crumbs?: Crumb[];
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {crumbs && <Breadcrumb items={crumbs} />}
      <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-h1">{title}</h1>
          {meta && <div className="mt-0.5 text-text-muted">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </header>
  );
}

export function Container({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={wide ? "w-full" : "mx-auto w-full max-w-[1120px]"}>{children}</div>;
}
