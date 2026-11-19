"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/cn";
import { Button } from "./button";

// ---------------------------------------------------------------------------
// useMediaQuery — decide painel lateral (desktop) × folha inferior (mobile)
// ---------------------------------------------------------------------------

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export const useIsDesktop = () => useMediaQuery("(min-width: 768px)");

// ---------------------------------------------------------------------------
// Sheet — painel lateral no desktop, folha inferior arrastável no mobile
// ---------------------------------------------------------------------------

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Largura no desktop */
  size?: "md" | "lg";
};

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: SheetProps) {
  const desktop = useIsDesktop();

  if (!desktop) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
        <Drawer.Portal>
          <Drawer.Overlay className="bg-overlay fixed inset-0 z-50" />
          <Drawer.Content className="bg-surface-raised shadow-sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-xl outline-none">
            <div
              aria-hidden
              className="bg-border-strong mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full"
            />
            <div className="px-5 pt-3 pb-3">
              <Drawer.Title className="text-lg font-semibold">{title}</Drawer.Title>
              {description && (
                <Drawer.Description className="text-fg-subtle mt-0.5 text-sm">
                  {description}
                </Drawer.Description>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
            {footer && (
              <div className="safe-bottom border-border flex flex-col-reverse gap-2 border-t px-5 pt-3 pb-3 [&>*]:w-full">
                {footer}
              </div>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bg-overlay data-[state=open]:animate-fade-in fixed inset-0 z-50" />
        <DialogPrimitive.Content
          className={cn(
            "border-border bg-surface-raised shadow-sheet fixed inset-y-2 right-2 z-50 flex flex-col rounded-lg border outline-none",
            "data-[state=open]:animate-[sheet-in_240ms_var(--ease-out)]",
            size === "md" ? "w-[460px]" : "w-[640px]",
          )}
        >
          <div className="border-border flex items-start justify-between gap-4 border-b px-6 py-5">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-fg-subtle mt-0.5 text-sm">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Fechar">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="border-border flex justify-end gap-2 border-t px-6 py-4">{footer}</div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// ConfirmDialog — ações com consequência dizem o que será afetado
// ---------------------------------------------------------------------------

type ConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  tone = "primary",
  loading,
  onConfirm,
  children,
}: ConfirmProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bg-overlay data-[state=open]:animate-fade-in fixed inset-0 z-50" />
        <DialogPrimitive.Content className="border-border bg-surface-raised shadow-sheet data-[state=open]:animate-rise fixed top-1/2 left-1/2 z-50 w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border p-6 outline-none">
          <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description className="text-fg-muted mt-2 text-base">
              {description}
            </DialogPrimitive.Description>
          )}
          {children && <div className="mt-4">{children}</div>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogPrimitive.Close asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </DialogPrimitive.Close>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="bg-ink-950 shadow-pop animate-fade-in dark:bg-ink-100 dark:text-ink-950 z-50 rounded-sm px-2 py-1 text-xs font-medium text-white"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Menu suspenso
// ---------------------------------------------------------------------------

export const Menu = DropdownPrimitive.Root;
export const MenuTrigger = DropdownPrimitive.Trigger;

export function MenuContent({
  className,
  align = "end",
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          "bg-surface-raised shadow-pop animate-rise z-50 min-w-48 rounded-md p-1",
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export function MenuItem({
  className,
  tone,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { tone?: "danger" }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "data-[highlighted]:bg-hover [&_svg]:text-fg-subtle flex cursor-default items-center gap-2.5 rounded-sm px-2.5 py-2 text-base outline-none select-none data-[disabled]:opacity-40 [&_svg]:size-4",
        tone === "danger" && "text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) {
  return (
    <DropdownPrimitive.Label
      className={cn("text-fg-subtle px-2.5 pt-2 pb-1 text-xs font-medium", className)}
      {...props}
    />
  );
}

export function MenuSeparator() {
  return <DropdownPrimitive.Separator className="bg-border -mx-1 my-1 h-px" />;
}
