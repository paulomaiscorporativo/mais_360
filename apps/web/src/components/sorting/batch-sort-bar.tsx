"use client";

import { ArrowDownUp, ChevronDown, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { describeSortSpec, encodeSortSpec, type SortRow, type SortSpec } from "@mais/core/sorting";
import { buttonVariants, Notice } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SortPicker, type SortOptions } from "./sort-picker";

export type BatchLink = {
  label: string;
  href: string;
  variant?: "primary" | "secondary" | "ghost";
  icon?: React.ReactNode;
  title?: string;
  /** Abre em nova aba (impressão). */
  newTab?: boolean;
};

const sameSpec = (a: SortSpec, b: SortSpec) => encodeSortSpec(a) === encodeSortSpec(b);

/** Acrescenta `ordem=` ao link quando a escolha difere do padrão efetivo. */
export function withSort(href: string, spec: SortSpec, defaultSpec: SortSpec) {
  if (sameSpec(spec, defaultSpec)) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}ordem=${encodeURIComponent(encodeSortSpec(spec))}`;
}

/**
 * Barra de geração em lote: mostra a ordenação efetiva (já preenchida com o
 * padrão do projeto/cliente), permite trocar na hora e leva a escolha nos links.
 */
export function BatchSortBar({
  defaultSpec,
  sourceLabel,
  warnings,
  options,
  customLabels,
  sample = [],
  links,
  children,
}: {
  defaultSpec: SortSpec;
  sourceLabel: string;
  warnings: string[];
  options: SortOptions;
  customLabels?: Record<string, string>;
  sample?: readonly SortRow[];
  links: BatchLink[];
  /** Controles extras (ex.: escolha do modelo), renderizados antes dos links. */
  children?: React.ReactNode;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [spec, setSpec] = useState(defaultSpec);
  const isDefault = sameSpec(spec, defaultSpec);

  return (
    <div className="border-border bg-surface flex flex-col gap-3 rounded-md border p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="hover:bg-hover focus-visible:outline-brand-ring -m-1 flex min-h-11 min-w-0 items-center gap-2.5 rounded-sm p-1 text-left focus-visible:outline-2"
        >
          <ArrowDownUp className="text-fg-subtle size-4 shrink-0" />
          <span className="min-w-0">
            <span className="text-fg-subtle block text-xs">Ordenação</span>
            <span className="block truncate text-sm font-medium">
              {describeSortSpec(spec, customLabels)}
              <span className="text-fg-subtle font-normal">
                {" "}
                · {isDefault ? sourceLabel : "escolhida agora"}
              </span>
            </span>
          </span>
          {isDefault && warnings.length > 0 && (
            <TriangleAlert className="text-warning size-4 shrink-0" aria-label="Com avisos" />
          )}
          <ChevronDown
            className={cn(
              "text-fg-subtle size-4 shrink-0 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {children}
          {links.map((l) => (
            <a
              key={l.label}
              href={withSort(l.href, spec, defaultSpec)}
              title={l.title}
              {...(l.newTab ? { target: "_blank", rel: "noreferrer" } : {})}
              className={buttonVariants({ variant: l.variant ?? "secondary", size: "md" })}
            >
              {l.icon}
              {l.label}
            </a>
          ))}
        </div>
      </div>

      {!open && isDefault && warnings.length > 0 && (
        <Notice tone="warning" title="Parte da ordenação padrão não vale neste projeto">
          {warnings.join(" ")}
        </Notice>
      )}

      {open && (
        <div id={panelId} className="border-border border-t pt-3">
          <SortPicker
            value={spec}
            onChange={setSpec}
            options={options}
            sample={sample}
            customLabels={customLabels}
            warnings={isDefault ? warnings : undefined}
            compact={sample.length === 0}
          />
        </div>
      )}
    </div>
  );
}
