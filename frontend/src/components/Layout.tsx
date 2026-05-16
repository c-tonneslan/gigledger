"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

import { DEMO_MODE } from "@/lib/api";
import ThemeToggle from "./ThemeToggle";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/clients", label: "Clients" },
  { href: "/taxes", label: "Taxes" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen flex flex-col">
      {DEMO_MODE && (
        <div className="bg-ink-900 text-white text-xs px-6 py-2 flex items-center justify-center gap-3">
          <span className="font-medium">Live demo</span>
          <span className="text-ink-300 hidden sm:inline">
            Pre-baked synthetic data. Edits update on screen but don't persist. Source on
          </span>
          <a className="underline underline-offset-2 sm:ml-1" href="https://github.com/c-tonneslan/gigledger">
            GitHub
          </a>
        </div>
      )}
      <header className="border-b border-ink-100 bg-white sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg font-semibold tracking-tight">gigledger</span>
            <span className="text-xs text-ink-400 hidden md:inline truncate">
              finances built for 1099 work
            </span>
          </div>
          <div className="flex items-center gap-1">
            <nav className="flex gap-0.5 sm:gap-1 overflow-x-auto -mx-1 px-1 scrollbar-thin">
              {nav.map((item) => {
                const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "px-2.5 sm:px-3 py-1.5 rounded text-sm whitespace-nowrap transition-colors",
                      active ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <span className="hidden sm:block w-px h-5 bg-ink-200 mx-1" />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">{children}</main>
      <footer className="border-t border-ink-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-xs text-ink-400 flex flex-wrap items-center justify-between gap-2">
          <span>Built by a 1099 filer for 1099 filers. Numbers are estimates, not tax advice. Talk to a CPA before you file.</span>
          <a className="underline underline-offset-2 hover:text-ink-600" href="https://github.com/c-tonneslan/gigledger">
            Source
          </a>
        </div>
      </footer>
    </div>
  );
}
