"use client";

import { CalendarDays, Check, MapPin, QrCode } from "lucide-react";
import { useMemo } from "react";
import {
  buildBrandTheme,
  contrastRatio,
  isHex,
  RAMP_STEPS,
  SURFACE_LIGHT,
  themeVars,
} from "@mais/core";
import { tenantFont } from "@/app/fonts";
import { Field, Input } from "@/components/ui";
import { Select, Switch } from "@/components/ui/controls";
import { BRAND_PRESETS, TENANT_FONT_NAMES, type TenantFontName } from "@/config/terms";
import { PRODUCT } from "@/config/product";
import { cn } from "@/lib/cn";

export type BrandValue = {
  primaryColor: string;
  accentColor: string;
  fontFamily: TenantFontName;
  showMaisBrand: boolean;
};

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = isHex(value);
  return (
    <Field label={label} hint={hint} error={valid ? null : "Use o formato #RRGGBB."}>
      {({ id, describedBy, invalid }) => (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <label
              className="border-border-strong relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-sm border shadow-sm"
              style={{ background: valid ? value : "transparent" }}
            >
              <span className="sr-only">Escolher cor</span>
              <input
                type="color"
                value={valid ? value : "#000000"}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <Input
              id={id}
              value={value}
              onChange={(e) =>
                onChange(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)
              }
              maxLength={7}
              spellCheck={false}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="font-mono uppercase"
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sugestões de cor">
            {BRAND_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange(c)}
                aria-label={c}
                className={cn(
                  "ring-offset-surface grid size-6 place-items-center rounded-full ring-offset-2 transition-transform hover:scale-110",
                  value.toLowerCase() === c && "ring-fg ring-2",
                )}
                style={{ background: c }}
              >
                {value.toLowerCase() === c && (
                  <Check className="size-3 text-white mix-blend-difference" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </Field>
  );
}

export function BrandFields({
  value,
  onChange,
  allowProductToggle = true,
}: {
  value: BrandValue;
  onChange: (v: BrandValue) => void;
  allowProductToggle?: boolean;
}) {
  const set = <K extends keyof BrandValue>(k: K, val: BrandValue[K]) =>
    onChange({ ...value, [k]: val });
  return (
    <div className="flex flex-col gap-6">
      <ColorField
        label="Cor principal"
        hint="Botões, destaques e cabeçalhos. Qualquer cor funciona: o contraste é ajustado automaticamente."
        value={value.primaryColor}
        onChange={(v) => set("primaryColor", v)}
      />
      <ColorField
        label="Cor de destaque"
        hint="Faixas de categoria em crachás e detalhes de convites."
        value={value.accentColor}
        onChange={(v) => set("accentColor", v)}
      />
      <Field label="Fonte">
        {({ id }) => (
          <Select
            id={id}
            value={value.fontFamily}
            onValueChange={(v) => set("fontFamily", v as TenantFontName)}
            options={TENANT_FONT_NAMES.map((f) => ({ value: f, label: f }))}
          />
        )}
      </Field>
      {allowProductToggle && (
        <label className="border-border bg-surface-muted flex cursor-pointer items-start justify-between gap-4 rounded-md border p-4">
          <span>
            <span className="block text-base font-medium">Assinatura “{PRODUCT.name}”</span>
            <span className="text-fg-subtle mt-0.5 block text-sm">
              Mostra “operado por {PRODUCT.name}” no rodapé das páginas e e-mails do cliente.
            </span>
          </span>
          <Switch checked={value.showMaisBrand} onCheckedChange={(v) => set("showMaisBrand", v)} />
        </label>
      )}
    </div>
  );
}

/** Pré-visualização ao vivo: convite do participante + elementos do console, com o tema real. */
export function BrandPreview({
  name,
  value,
  className,
}: {
  name: string;
  value: BrandValue;
  className?: string;
}) {
  const primary = isHex(value.primaryColor) ? value.primaryColor : PRODUCT.brandColor;
  const accent = isHex(value.accentColor) ? value.accentColor : primary;
  const theme = useMemo(() => buildBrandTheme(primary), [primary]);
  const font = tenantFont(value.fontFamily);
  const style = {
    ...themeVars(theme.light, theme.ramp),
    "--tenant-font": `var(${font.cssVar})`,
  } as React.CSSProperties;
  const ratio = contrastRatio(theme.light.brand, theme.light.brandFg);
  const textRatio = contrastRatio(theme.light.brandText, SURFACE_LIGHT);
  const displayName = name.trim() || "Nome do cliente";

  return (
    <div className={cn("flex flex-col gap-4", font.className, className)} style={style}>
      {/* Convite */}
      <div className="border-border font-tenant shadow-pop overflow-hidden rounded-lg border bg-white text-[#0a1424]">
        <div
          className="relative px-6 pt-5 pb-6"
          style={{ background: theme.light.brand, color: theme.light.brandFg }}
        >
          <div className="flex items-center justify-between text-xs font-medium opacity-80">
            <span className="tracking-[0.14em] uppercase">{displayName}</span>
            <span>Convite digital</span>
          </div>
          <p className="mt-6 text-[26px] leading-tight font-semibold tracking-tight">
            Jantar de Confraternização 2026
          </p>
          <span
            className="absolute bottom-0 left-6 h-1 w-14 translate-y-1/2 rounded-full"
            style={{ background: accent }}
          />
        </div>
        <div className="flex flex-col gap-3 px-6 py-5 text-sm">
          <div className="flex items-center gap-2.5 text-[#374051]">
            <CalendarDays className="size-4" style={{ color: theme.light.brandText }} />
            Sexta, 12 de dezembro · 20h
          </div>
          <div className="flex items-center gap-2.5 text-[#374051]">
            <MapPin className="size-4" style={{ color: theme.light.brandText }} />
            Casa Bizutt · São Paulo
          </div>
          <div className="mt-2 flex gap-2">
            <span
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md text-sm font-semibold"
              style={{ background: theme.light.brand, color: theme.light.brandFg }}
            >
              Confirmar presença
            </span>
            <span className="inline-flex h-10 items-center gap-1.5 rounded-md border border-[#d6dbe3] px-3 text-sm font-medium">
              <QrCode className="size-4" /> Meu QR
            </span>
          </div>
        </div>
        {value.showMaisBrand && (
          <div className="border-t border-[#eceff4] px-6 py-2.5 text-[11px] text-[#8d96a6]">
            operado por {PRODUCT.name}
          </div>
        )}
      </div>

      {/* Rampa e contraste */}
      <div className="border-border bg-surface rounded-md border p-4">
        <div className="flex overflow-hidden rounded-sm">
          {RAMP_STEPS.map((s) => (
            <span
              key={s}
              className="h-7 flex-1"
              style={{ background: theme.ramp[s] }}
              title={`${s} · ${theme.ramp[s]}`}
            />
          ))}
        </div>
        <div className="text-fg-subtle mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <Check className="text-success size-3.5" strokeWidth={2.5} />
            Texto no botão <span className="tabular text-fg font-medium">{ratio.toFixed(1)}:1</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="text-success size-3.5" strokeWidth={2.5} />
            Links sobre fundo claro{" "}
            <span className="tabular text-fg font-medium">{textRatio.toFixed(1)}:1</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="text-success size-3.5" strokeWidth={2.5} />
            WCAG AA
          </span>
        </div>
      </div>
    </div>
  );
}
