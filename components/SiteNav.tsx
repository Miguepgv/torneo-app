"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteNav() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-gradient-to-r from-slate-900 via-violet-950 to-slate-900 shadow-lg shadow-black/20 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="text-base font-bold tracking-tight text-white sm:text-lg">
          Maraton Cofrade <span className="font-semibold text-violet-300">2026</span>
        </Link>
        {!isHome ? (
          <nav className="flex shrink-0 items-center gap-2">
            <Link
              href="/"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-violet-900 shadow hover:bg-violet-100 transition-colors"
            >
              Inicio
            </Link>
          </nav>
        ) : (
          <span className="text-xs font-medium uppercase tracking-widest text-violet-300/90 sm:text-sm">
            Torneo oficial
          </span>
        )}
      </div>
    </header>
  );
}
