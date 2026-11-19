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
        <DialogPrimitive.Overlay className="bg-overlay data-[state=open]:animate-fade-in fixed inset-0 z-50" />
        <DialogPrimitive.Content className="border-border bg-surface-raised shadow-sheet data-[state=open]:animate-rise fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border outline-none">
          <DialogPrimitive.Title className="sr-only">Ir para</DialogPrimitive.Title>
          <Command loop className="flex flex-col">
            <div className="border-border flex items-center gap-3 border-b px-4">
              <Search className="text-fg-subtle size-4 shrink-0" />
              <Command.Input
                autoFocus
                placeholder="Buscar clientes, páginas e ações…"
                className="text-md placeholder:text-fg-faint h-13 w-full bg-transparent outline-none"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[min(60vh,420px)] scrollbar-thin overflow-y-auto p-2">
              <Command.Empty className="text-fg-subtle px-3 py-10 text-center text-base">
                Nada encontrado. Tente outro termo.
              </Command.Empty>
              {groups.map((g) => (
                <Command.Group
                  key={g}
                  heading={g}
                  className="[&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium"
                >
                  {items
                    .filter((i) => i.group === g)
                    .map((i) => (
                      <Command.Item
                        key={i.id}
                        value={`${i.label} ${i.hint ?? ""} ${(i.keywords ?? []).join(" ")}`}
                        onSelect={() => go(i.href)}
                        className="group data-[selected=true]:bg-hover flex h-10 cursor-default items-center gap-3 rounded-sm px-2.5 text-base [&_svg]:size-4"
                      >
                        <span className="text-fg-subtle">{i.icon}</span>
                        <span className="min-w-0 flex-1 truncate">{i.label}</span>
                        {i.hint && <span className="text-fg-faint truncate text-sm">{i.hint}</span>}
                        <CornerDownLeft className="text-fg-faint hidden group-data-[selected=true]:block" />
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
