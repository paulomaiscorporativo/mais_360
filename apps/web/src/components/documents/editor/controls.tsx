"use client";

import { useState } from "react";
import type { ColorValue, FieldDefinition } from "@mais/core";
import { cn } from "@/lib/cn";

/** Controles compactos do painel de propriedades (densidade de console). */

export const inputCls =
  "h-8 w-full min-w-0 rounded-sm border border-border-strong bg-surface px-2 text-sm text-fg outline-none transition-colors focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand-ring/40 disabled:opacity-50";

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="border-border border-b px-4 py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-fg-subtle text-xs font-semibold">{title}</h3>
        {action}
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

export function Row({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2">
      <label htmlFor={htmlFor} className="text-fg-muted truncate text-sm">
        {label}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Número com unidade; aplica ao sair do campo ou com Enter (não a cada tecla). */
export function NumberInput({
  value,
  onChange,
  unit,
  step = 0.5,
  min,
  max,
  id,
  disabled,
  ariaLabel,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  id?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const fmt = (v: number | undefined) => (v === undefined ? "" : String(Math.round(v * 100) / 100));
  const [text, setText] = useState(fmt(value));
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setText(fmt(value));
  }
  const apply = () => {
    const n = Number(text.replace(",", "."));
    if (!Number.isFinite(n)) return setText(fmt(value));
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    if (v !== value) onChange(v);
    setText(fmt(v));
  };
  return (
    <div className="relative">
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode="decimal"
        disabled={disabled}
        className={cn(inputCls, "pr-8 font-mono tabular-nums")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const d = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const base = Number(text.replace(",", ".")) || 0;
            let v = Math.round((base + d) * 100) / 100;
            if (min !== undefined) v = Math.max(min, v);
            if (max !== undefined) v = Math.min(max, v);
            setText(fmt(v));
            onChange(v);
          }
        }}
      />
      {unit && (
        <span className="text-fg-faint pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
          {unit}
        </span>
      )}
    </div>
  );
}

/** Dois campos numéricos lado a lado (X/Y, L/A). */
export function Pair({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-1.5">{children}</div>;
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="border-border-strong bg-surface-muted grid auto-cols-fr grid-flow-col gap-0.5 rounded-sm border p-0.5"
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "focus-visible:outline-brand-ring flex h-6 items-center justify-center gap-1 rounded-[3px] px-1.5 text-xs font-medium transition-colors focus-visible:outline-2 [&_svg]:size-3.5",
            value === o.value ? "bg-surface text-fg shadow-sm" : "text-fg-subtle hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-0.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-brand mt-0.5 size-4 shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint && <span className="text-fg-subtle block text-xs">{hint}</span>}
      </span>
    </label>
  );
}

// ── Cores ──────────────────────────────────────────────────────────────────

export type BrandColors = { primary: string; secondary: string; accent: string };

const TOKENS: { value: string; label: string }[] = [
  { value: "brand", label: "Cor da marca" },
  { value: "brandSecondary", label: "Secundária da marca" },
  { value: "accent", label: "Destaque da marca" },
  { value: "category", label: "Cor da categoria" },
  { value: "onBrand", label: "Contraste sobre a marca" },
  { value: "onCategory", label: "Contraste sobre a categoria" },
  { value: "ink", label: "Tinta" },
  { value: "muted", label: "Texto suave" },
  { value: "line", label: "Linha" },
  { value: "white", label: "Branco" },
  { value: "black", label: "Preto" },
];

export function tokenSwatch(v: string, brand: BrandColors): string {
  const map: Record<string, string> = {
    brand: brand.primary,
    brandSecondary: brand.secondary,
    accent: brand.accent,
    category: "#334155",
    onBrand: "#ffffff",
    onCategory: "#ffffff",
    onAccent: "#0b1a2b",
    ink: "#0b1a2b",
    muted: "#55657a",
    subtle: "#8a97a8",
    line: "#dde3ea",
    white: "#ffffff",
    black: "#000000",
  };
  return v.startsWith("#") ? v : (map[v] ?? "#000000");
}

/**
 * Cor por token (segue a marca do cliente e a categoria da inscrição) ou hex
 * fixo. Tokens são o padrão recomendado: o mesmo modelo serve a vários eventos.
 */
export function ColorInput({
  value,
  onChange,
  brand,
  allowNone,
}: {
  value: ColorValue | undefined;
  onChange: (v: ColorValue | undefined) => void;
  brand: BrandColors;
  allowNone?: boolean;
}) {
  const isHex = !!value && value.startsWith("#");
  const [hex, setHex] = useState(isHex ? value : "");
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setHex(value && value.startsWith("#") ? value : "");
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {allowNone && (
          <button
            type="button"
            title="Sem cor"
            aria-label="Sem cor"
            aria-pressed={!value}
            onClick={() => onChange(undefined)}
            className={cn(
              "relative size-6 overflow-hidden rounded-full border bg-white",
              !value ? "ring-brand ring-2 ring-offset-1" : "border-border-strong",
            )}
          >
            <span className="absolute top-1/2 left-1/2 h-px w-7 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-rose-500" />
          </button>
        )}
        {TOKENS.map((t) => (
          <button
            key={t.value}
            type="button"
            title={t.label}
            aria-label={t.label}
            aria-pressed={value === t.value}
            onClick={() => onChange(t.value as ColorValue)}
            className={cn(
              "size-6 rounded-full border border-black/10",
              value === t.value && "ring-brand ring-2 ring-offset-1",
            )}
            style={{ background: tokenSwatch(t.value, brand) }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label="Escolher cor fixa"
          value={isHex ? value : "#0b1a2b"}
          onChange={(e) => onChange(e.target.value as ColorValue)}
          className="border-border-strong h-8 w-9 shrink-0 cursor-pointer rounded-sm border bg-transparent p-0.5"
        />
        <input
          aria-label="Cor em hexadecimal"
          placeholder={value && !isHex ? TOKENS.find((t) => t.value === value)?.label : "#RRGGBB"}
          className={cn(inputCls, "font-mono uppercase")}
          value={hex}
          onChange={(e) => {
            const v = e.target.value;
            setHex(v);
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v as ColorValue);
          }}
        />
      </div>
    </div>
  );
}

// ── Campos ─────────────────────────────────────────────────────────────────

export function FieldSelect({
  value,
  onChange,
  fields,
  id,
  imageOnly,
  allowEmpty,
}: {
  value: string;
  onChange: (v: string) => void;
  fields: FieldDefinition[];
  id?: string;
  imageOnly?: boolean;
  allowEmpty?: string;
}) {
  const list = fields.filter((f) => !!f.image === !!imageOnly);
  const groups = [...new Set(list.map((f) => f.group))];
  const known = list.some((f) => f.key === value) || value === "";
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputCls, "pr-6")}
    >
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {!known && <option value={value}>{value} (desconhecido)</option>}
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {list
            .filter((f) => f.group === g)
            .map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
