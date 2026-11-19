"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const tabClass = cn(
  "relative inline-flex h-10 shrink-0 items-center gap-2 px-1 text-base font-medium text-fg-subtle transition-colors",
  "hover:text-fg data-[active=true]:text-fg data-[state=active]:text-fg",
  "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent",
  "data-[active=true]:after:bg-brand data-[state=active]:after:bg-brand",
  "[&_svg]:size-4",
);

const listClass =
  "flex gap-6 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Abas de estado local (conteúdo na mesma página). */
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn(listClass, className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn(tabClass, className)} {...props} />;
}
export const TabsContent = TabsPrimitive.Content;

/** Abas de navegação (cada aba é uma rota — link compartilhável, voltar funciona). */
export function LinkTabs({
  items,
  className,
}: {
  items: { href: string; label: React.ReactNode; icon?: React.ReactNode; exact?: boolean; count?: number }[];
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções" className={cn(listClass, className)}>
      {items.map((it) => {
        const active = it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link key={it.href} href={it.href} data-active={active} aria-current={active ? "page" : undefined} className={tabClass}>
            {it.icon}
            {it.label}
            {it.count !== undefined && (
              <span className="tabular rounded-full bg-surface-sunken px-1.5 text-2xs text-fg-subtle">{it.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
