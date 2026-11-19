"use client";

import { ArrowDownWideNarrow, ArrowUpNarrowWide, Plus, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import {
  MAX_SORT_LEVELS,
  groupRegistrations,
  matchPreset,
  sortFieldLabel,
  type SortField,
  type SortPresetId,
  type SortRow,
  type SortSpec,
} from "@mais/core/sorting";
import { Button, Notice } from "@/components/ui";
import { Select, Switch } from "@/components/ui/controls";
import { cn } from "@/lib/cn";

/**
 * Seletor de ordenação das listas: presets ou modo personalizado (até 3
 * critérios, sentido, agrupar por, quebra de página), com pré-visualização.
 * Usado nas configurações do cliente/projeto e na geração em lote.
 */

export type SortOptions = {
  fields: { value: SortField; label: string }[];
  presets: { id: SortPresetId; label: string; spec: SortSpec }[];
};

const CUSTOM = "custom";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  INVITED: "Convidado",
  CONFIRMED: "Confirmada",
  WAITLIST: "Lista de espera",
  DECLINED: "Recusada",
  CANCELED: "Cancelada",
};

export function SortPicker({
  value,
  onChange,
  options,
  sample,
  customLabels,
  disabled,
  warnings,
  compact,
}: {
  value: SortSpec;
  onChange: (spec: SortSpec) => void;
  options: SortOptions;
  /** Linhas para a pré-visualização (já normalizadas). */
  sample: readonly SortRow[];
  customLabels?: Record<string, string>;
  disabled?: boolean;
  warnings?: string[];
  /** Sem pré-visualização (barra de geração). */
  compact?: boolean;
}) {
  const uid = useId();
  const preset = matchPreset(value);
  const available = new Set(options.presets.map((p) => p.id));
  const [forceCustom, setForceCustom] = useState(false);
  const mode = !forceCustom && preset && available.has(preset) ? preset : CUSTOM;
  const fieldOptions = options.fields.map((f) => ({ value: f.value, label: f.label }));
  const label = (f: SortField) =>
    options.fields.find((x) => x.value === f)?.label ?? sortFieldLabel(f, customLabels);

  const setLevel = (i: number, patch: Partial<SortSpec["levels"][number]>) =>
    onChange({
      ...value,
      levels: value.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    });

  const unused = options.fields.find((f) => !value.levels.some((l) => l.field === f.value));

  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={disabled} className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Ordem</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ...options.presets.map((p) => ({ id: p.id as string, label: p.label })),
            { id: CUSTOM, label: "Personalizada" },
          ].map((o) => (
            <label
              key={o.id}
              className={cn(
                "border-border bg-surface flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors",
                "hover:border-border-strong has-[:focus-visible]:outline-brand-ring has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                mode === o.id && "border-brand bg-brand-subtle text-brand-subtle-fg",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={`${uid}-preset`}
                value={o.id}
                checked={mode === o.id}
                onChange={() => {
                  // Personalizada parte da ordem atual para o usuário ajustar
                  setForceCustom(o.id === CUSTOM);
                  const p = options.presets.find((x) => x.id === o.id);
                  if (p) onChange(p.spec);
                }}
                className="accent-brand size-4 shrink-0"
              />
              <span className="font-medium">{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode === CUSTOM && (
        <fieldset
          disabled={disabled}
          className="border-border flex flex-col gap-3 rounded-md border p-3 sm:p-4"
        >
          <legend className="px-1 text-sm font-medium">Critérios (até {MAX_SORT_LEVELS})</legend>
          <ol className="flex flex-col gap-2">
            {value.levels.map((l, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <span className="text-fg-subtle tabular w-5 shrink-0 text-sm">{i + 1}.</span>
                <Select
                  aria-label={`Critério ${i + 1}`}
                  className="min-w-0 flex-1"
                  value={l.field}
                  onValueChange={(v) => setLevel(i, { field: v as SortField })}
                  options={fieldOptions.map((f) => ({
                    ...f,
                    disabled: f.value !== l.field && value.levels.some((x) => x.field === f.value),
                  }))}
                />
                <Select
                  aria-label={`Sentido do critério ${i + 1}`}
                  className="w-full sm:w-44"
                  value={l.direction}
                  onValueChange={(v) => setLevel(i, { direction: v as "asc" | "desc" })}
                  options={[
                    { value: "asc", label: "Crescente (A→Z)" },
                    { value: "desc", label: "Decrescente (Z→A)" },
                  ]}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover critério ${i + 1}`}
                  disabled={value.levels.length <= 1}
                  onClick={() =>
                    onChange({ ...value, levels: value.levels.filter((_, j) => j !== i) })
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ol>
          {value.levels.length < MAX_SORT_LEVELS && unused && (
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  onChange({
                    ...value,
                    levels: [...value.levels, { field: unused.value, direction: "asc" }],
                  })
                }
              >
                <Plus /> Adicionar critério
              </Button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-group`} className="text-sm font-medium">
                Agrupar por
              </label>
              <Select
                id={`${uid}-group`}
                value={value.groupBy ?? "none"}
                onValueChange={(v) =>
                  onChange({
                    ...value,
                    groupBy: v === "none" ? null : (v as SortField),
                    pageBreakPerGroup: v === "none" ? false : value.pageBreakPerGroup,
                  })
                }
                options={[{ value: "none", label: "Sem agrupamento" }, ...fieldOptions]}
              />
            </div>
            <label className="flex min-h-9 items-center justify-between gap-3 text-sm">
              <span>
                <span className="font-medium">Quebra de página por grupo</span>
                <span className="text-fg-subtle block text-xs">
                  Cada grupo começa numa folha nova ao imprimir.
                </span>
              </span>
              <Switch
                checked={value.pageBreakPerGroup}
                disabled={disabled || !value.groupBy}
                onCheckedChange={(v) => onChange({ ...value, pageBreakPerGroup: v })}
              />
            </label>
          </div>
        </fieldset>
      )}

      {warnings && warnings.length > 0 && (
        <Notice tone="warning" title="Parte da ordenação não vale neste projeto">
          <ul className="list-disc pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}

      {!compact && <SortPreview spec={value} sample={sample} label={label} />}
    </div>
  );
}

/** Pré-visualização curta: os primeiros nomes na ordem escolhida. */
export function SortPreview({
  spec,
  sample,
  label,
}: {
  spec: SortSpec;
  sample: readonly SortRow[];
  label: (f: SortField) => string;
}) {
  const groups = useMemo(
    () => groupRegistrations(sample, spec, { statusLabels: STATUS_LABELS }),
    [sample, spec],
  );
  const detailField = spec.levels.find((l) => l.field !== "fullName")?.field ?? null;
  const titleId = useId();
  let shown = 0;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h4 id={titleId} className="text-fg-subtle text-xs font-semibold">
        Pré-visualização
      </h4>
      {sample.length === 0 ? (
        <p className="text-fg-subtle border-border rounded-md border border-dashed px-3 py-4 text-sm">
          Quando houver inscritos, os primeiros nomes aparecem aqui na ordem escolhida.
        </p>
      ) : (
        <div className="border-border bg-surface-sunken rounded-md border p-2">
          {groups.map((g) => {
            const rows = g.rows.slice(0, Math.max(0, 8 - shown));
            shown += rows.length;
            if (!rows.length) return null;
            return (
              <div key={g.key || "all"} className="py-1">
                {g.label && (
                  <p className="text-fg-muted flex items-center gap-2 px-2 pt-1 pb-0.5 text-xs font-semibold">
                    {g.label}
                    {spec.pageBreakPerGroup && (
                      <span className="text-fg-faint font-normal">· nova página</span>
                    )}
                  </p>
                )}
                <ol className="flex flex-col">
                  {rows.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-baseline justify-between gap-3 rounded-sm px-2 py-1 text-sm"
                    >
                      <span className="min-w-0 truncate">{r.fullName}</span>
                      {detailField && (
                        <span className="text-fg-subtle shrink-0 truncate text-xs">
                          {previewValue(r, detailField) ||
                            `sem ${label(detailField).toLowerCase()}`}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
          {sample.length > 8 && (
            <p className="text-fg-faint px-2 pt-1 text-xs">e mais {sample.length - 8}…</p>
          )}
        </div>
      )}
      <p className="text-fg-faint flex items-center gap-1.5 text-xs">
        {spec.levels[0]?.direction === "desc" ? (
          <ArrowDownWideNarrow className="size-3.5" />
        ) : (
          <ArrowUpNarrowWide className="size-3.5" />
        )}
        Vazios ficam sempre no fim; acentos e maiúsculas não mudam a ordem.
      </p>
    </section>
  );
}

function previewValue(r: SortRow, f: SortField): string {
  if (f.startsWith("custom:")) return String(r.custom?.[f.slice(7)] ?? "");
  switch (f) {
    case "seat":
      return r.table != null ? `Mesa ${r.table}${r.seat != null ? `, cadeira ${r.seat}` : ""}` : "";
    case "status":
      return r.status ? (STATUS_LABELS[r.status] ?? r.status) : "";
    case "createdAt":
      return r.createdAt ? new Date(r.createdAt).toLocaleDateString("pt-BR") : "";
    case "badgeName":
      return r.badgeName || "";
    default: {
      const v = r[f as keyof SortRow];
      return typeof v === "string" ? v : "";
    }
  }
}
