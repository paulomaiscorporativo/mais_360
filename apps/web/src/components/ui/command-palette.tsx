"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Kbd } from "./display";

export type CommandItem = {
  id: string;
  label: string;
  group: string;
  href: string;
  hint?: string;
  icon?: React.ReactNode;
  keywords?: string[];
};

const OPEN_EVENT = "mais:open-command-palette";

/** Abre a palette a partir de qualquer botão (ex.: busca da barra lateral). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CommandPalette({ items }: { items: CommandItem[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sheet outline-none data-[state=open]:animate-rise">
          <DialogPrimitive.Title className="sr-only">Ir para</DialogPrimitive.Title>
          <Command loop className="flex flex-col">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-fg-subtle" />
              <Command.Input
                autoFocus
                placeholder="Buscar clientes, páginas e ações…"
                className="h-13 w-full bg-transparent text-md outline-none placeholder:text-fg-faint"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2 scrollbar-thin">
              <Command.Empty className="px-3 py-10 text-center text-base text-fg-subtle">
                Nada encontrado. Tente outro termo.
              </Command.Empty>
              {groups.map((g) => (
                <Command.Group
                  key={g}
                  heading={g}
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-subtle"
                >
                  {items
                    .filter((i) => i.group === g)
                    .map((i) => (
                      <Command.Item
                        key={i.id}
                        value={`${i.label} ${i.hint ?? ""} ${(i.keywords ?? []).join(" ")}`}
                        onSelect={() => go(i.href)}
                        className="group flex h-10 cursor-default items-center gap-3 rounded-sm px-2.5 text-base data-[selected=true]:bg-hover [&_svg]:size-4"
                      >
                        <span className="text-fg-subtle">{i.icon}</span>
                        <span className="min-w-0 flex-1 truncate">{i.label}</span>
                        {i.hint && <span className="truncate text-sm text-fg-faint">{i.hint}</span>}
                        <CornerDownLeft className="hidden text-fg-faint group-data-[selected=true]:block" />
                      </Command.Item>
                    ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
