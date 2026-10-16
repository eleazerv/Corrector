import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Navy top bar (design.md §4.2). Logo is the BeeCorrect hexagon icon plus the wordmark as text,
 * because the wordmark PNG has a solid white background that doesn't sit on navy.
 */
export function TopBar({
  home,
  userName,
  role,
  leading,
  children,
}: {
  home: string;
  userName: string;
  role: string;
  leading?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="bg-primary text-white">
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-primary"
      >
        Lewati ke konten
      </a>
      <div className="flex min-h-16 items-center gap-3 px-4 sm:px-8">
        {leading}
        <Link href={home} className="flex items-center gap-2 font-heading text-h2 leading-none">
          <Image src="/beecorrect-icon.png" alt="" width={28} height={32} priority />
          <span>
            <span className="text-bee">Bee</span>Correct
          </span>
        </Link>
        {children && <div className="ml-4 hidden flex-1 sm:flex">{children}</div>}
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <span className="hidden text-right text-small leading-tight md:block">
            <span className="block font-semibold">{userName}</span>
            <span className="text-white/85">{role}</span>
          </span>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-md border border-white/60 px-3 text-small font-semibold hover:bg-white/10"
          >
            Ganti peran
          </Link>
        </div>
      </div>
      {children && <div className="flex border-t border-white/20 px-2 sm:hidden">{children}</div>}
    </header>
  );
}
