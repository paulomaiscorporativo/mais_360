import type { ColorValue } from "./schema";
import type { DocumentData } from "./data";

export type Rgb = { r: number; g: number; b: number }; // 0..1

const PALETTE = {
  ink: "#0b1a2b",
  muted: "#55657a",
  subtle: "#8a97a8",
  line: "#dde3ea",
  white: "#ffffff",
  black: "#000000",
  brand: "#002042", // azul Mais Corporativo
  brandSecondary: "#0f2836",
  accent: "#a0bf27",
  category: "#334155",
} as const;

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = parseInt(m?.[1] ?? "000000", 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const h = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Luminância relativa (WCAG 2.x). */
export function luminance(hex: string): number {
  const ch = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Preto-tinta ou branco: o que tiver mais contraste sobre o fundo. */
export function readableOn(background: string): string {
  return contrastRatio(background, PALETTE.white) >= contrastRatio(background, PALETTE.ink)
    ? PALETTE.white
    : PALETTE.ink;
}

const isHex = (v: string | undefined): v is string => !!v && /^#[0-9a-fA-F]{6}$/.test(v);

/** Converte uma cor do modelo (hex ou token) em hex, com os dados do documento. */
export function resolveColor(value: ColorValue, data: DocumentData, monochrome = false): string {
  const brand =
    (isHex(data.project?.primaryColor) && data.project?.primaryColor) ||
    (isHex(data.tenant?.primaryColor) && data.tenant?.primaryColor) ||
    PALETTE.brand;
  const brandSecondary =
    (isHex(data.project?.secondaryColor) && data.project?.secondaryColor) ||
    (isHex(data.tenant?.secondaryColor) && data.tenant?.secondaryColor) ||
    PALETTE.brandSecondary;
  const accent = (isHex(data.tenant?.accentColor) && data.tenant?.accentColor) || PALETTE.accent;
  const category = (isHex(data.registration?.categoryColor) && data.registration?.categoryColor) || brand;

  let out: string;
  switch (value) {
    case "brand": out = brand; break;
    case "brandSecondary": out = brandSecondary; break;
    case "accent": out = accent; break;
    case "category": out = category; break;
    case "onBrand": out = readableOn(brand); break;
    case "onCategory": out = readableOn(category); break;
    case "onAccent": out = readableOn(accent); break;
    case "ink": case "muted": case "subtle": case "line": case "white": case "black":
      out = PALETTE[value]; break;
    default: out = isHex(value) ? value.toLowerCase() : PALETTE.ink;
  }
  if (!monochrome) return out;
  // Térmica: só preto ou branco. Claro vira branco; o resto, preto.
  return luminance(out) > 0.6 ? PALETTE.white : PALETTE.black;
}
