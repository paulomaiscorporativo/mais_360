"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Navegação interna de Viagens corporativas: pílulas roláveis (mesmo padrão da Comunicação). */
export function TravelNav({
  base,
  items,
}: {
  base: string;
  items: { href: string; label: string; count?: number; exact?: boolean }[];
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Viagens corporativas"
      className="-mx-4 flex [scrollbar-width:none] gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {items.map((it) => {
        const href = it.href ? `${base}/${it.href}` : base;
        const active = it.exact
          ? pathname === href
          : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
              active ? "bg-fg text-canvas" : "text-fg-muted hover:bg-hover hover:text-fg",
            )}
          >
            {it.label}
            {it.count !== undefined && it.count > 0 && (
              <span
                className={cn(
                  "tabular text-2xs rounded-full px-1.5",
                  active ? "bg-canvas/20" : "bg-surface-sunken text-fg-subtle",
                )}
              >
                {it.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
