import Link from "next/link";
import type { ReactNode } from "react";

export interface Crumb {
  href?: string;
  label: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-small">
      <ol className="flex flex-wrap items-center gap-x-2">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden="true" className="text-text-muted">
                /
              </span>
            )}
            {c.href ? (
              <Link href={c.href} className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline md:min-h-0">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-text-muted">
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
    <header className="doc-rule mb-8 pb-5">
      {crumbs && <Breadcrumb items={crumbs} />}
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-h1 md:text-display">{title}</h1>
          {meta && <div className="mt-1 text-text-muted">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </header>
  );
}

export function Container({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={wide ? "w-full" : "mx-auto w-full max-w-[1200px]"}>{children}</div>;
}
