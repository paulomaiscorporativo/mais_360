import { contrastRatio, normalizeHex, oklchToRgb, parseHex, rgbToOklch, toHex } from "./color";

/**
 * Tema da marca do cliente.
 *
 * O cliente escolhe UMA cor (qualquer uma). A partir dela geramos a rampa
 * completa e os papéis de interface, com garantia de contraste WCAG AA:
 *   • texto sobre a cor da marca (botão primário) ≥ 4,5:1
 *   • cor da marca usada como texto/link sobre a superfície ≥ 4,5:1
 *   • cor da marca como elemento de interface (borda, foco) ≥ 3:1
 * em modo claro e escuro.
 */

export const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type RampStep = (typeof RAMP_STEPS)[number];
export type Ramp = Record<RampStep, string>;

/** Superfícies de referência do design system (ver apps/web globals.css). */
export const SURFACE_LIGHT = "#ffffff";
export const SURFACE_DARK = "#0b111d";
/** Tinta escura usada como texto sobre cores claras (neutro 950 do sistema). */
export const INK = "#0a1424";

export const AA_TEXT = 4.5;
export const AA_UI = 3;

const LIGHTNESS: Record<RampStep, number> = {
  50: 0.975,
  100: 0.948,
  200: 0.895,
  300: 0.815,
  400: 0.72,
  500: 0.63,
  600: 0.545,
  700: 0.465,
  800: 0.385,
  900: 0.31,
  950: 0.235,
};

// Croma relativo ao da cor base: tons extremos ficam mais neutros, como em
// paletas desenhadas à mão (um 50 saturado parece "plástico").
const CHROMA: Record<RampStep, number> = {
  50: 0.14,
  100: 0.26,
  200: 0.45,
  300: 0.68,
  400: 0.88,
  500: 1,
  600: 1,
  700: 0.94,
  800: 0.84,
  900: 0.72,
  950: 0.6,
};

export function buildRamp(hex: string): Ramp {
  const base = rgbToOklch(parseHex(hex));
  const ramp = {} as Ramp;
  for (const step of RAMP_STEPS) {
    ramp[step] = toHex(oklchToRgb({ l: LIGHTNESS[step], c: base.c * CHROMA[step], h: base.h }));
  }
  return ramp;
}

/** Branco ou tinta escura — o que tiver mais contraste sobre a cor (sempre ≥ 4,5:1). */
export function onColor(hex: string): string {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, INK) ? "#ffffff" : INK;
}

function shiftLightness(hex: string, delta: number): string {
  const c = rgbToOklch(parseHex(hex));
  return toHex(oklchToRgb({ ...c, l: Math.min(0.99, Math.max(0.05, c.l + delta)) }));
}

/** Primeiro tom (na ordem dada) que atinge o contraste mínimo contra o fundo. */
function firstPassing(candidates: string[], background: string, min: number): string {
  return (
    candidates.find((c) => contrastRatio(c, background) >= min) ??
    candidates[candidates.length - 1] ??
    INK
  );
}

export type ThemeRoles = {
  brand: string; // preenchimento de botão primário
  brandHover: string;
  brandActive: string;
  brandFg: string; // texto sobre brand
  brandSubtle: string; // fundo de destaque suave (item ativo, badge)
  brandSubtleFg: string; // texto sobre brandSubtle
  brandText: string; // cor da marca como texto/link sobre a superfície
  brandRing: string; // anel de foco
};

export type BrandTheme = {
  input: string;
  ramp: Ramp;
  light: ThemeRoles;
  dark: ThemeRoles;
};

export function buildBrandTheme(input: string): BrandTheme {
  const hex = normalizeHex(input);
  const ramp = buildRamp(hex);
  const darker = [ramp[600], ramp[700], ramp[800], ramp[900], ramp[950]];
  const lighter = [ramp[400], ramp[300], ramp[200], ramp[100], ramp[50]];
  const isDark = rgbToOklch(parseHex(hex)).l < 0.5;

  // Claro: a cor do cliente é usada como está no botão (é a identidade dele).
  const lightBrand = hex;
  const light: ThemeRoles = {
    brand: lightBrand,
    brandHover: shiftLightness(lightBrand, isDark ? 0.06 : -0.06),
    brandActive: shiftLightness(lightBrand, isDark ? 0.1 : -0.1),
    brandFg: onColor(lightBrand),
    brandSubtle: ramp[50],
    brandSubtleFg: firstPassing([ramp[700], ramp[800], ramp[900], ramp[950]], ramp[50], AA_TEXT),
    brandText: firstPassing([hex, ...darker], SURFACE_LIGHT, AA_TEXT),
    brandRing: firstPassing([hex, ...darker], SURFACE_LIGHT, AA_UI),
  };

  // Escuro: marca muito escura sumiria no fundo; sobe na rampa até ser visível.
  const darkBrand = firstPassing([hex, ramp[500], ramp[400], ramp[300]], SURFACE_DARK, AA_UI);
  const dark: ThemeRoles = {
    brand: darkBrand,
    brandHover: shiftLightness(darkBrand, 0.06),
    brandActive: shiftLightness(darkBrand, 0.1),
    brandFg: onColor(darkBrand),
    brandSubtle: toHex(oklchToRgb({ ...rgbToOklch(parseHex(ramp[900])), l: 0.27 })),
    brandSubtleFg: ramp[100],
    brandText: firstPassing([hex, ...lighter], SURFACE_DARK, AA_TEXT),
    brandRing: firstPassing([hex, ...lighter], SURFACE_DARK, AA_UI),
  };

  return { input: hex, ramp, light, dark };
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** Variáveis CSS de um conjunto de papéis: { "--brand": "#…", "--brand-hover": "#…" } */
export function themeVars(roles: ThemeRoles, ramp?: Ramp): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(roles)) vars[`--${kebab(k)}`] = v;
  if (ramp) for (const step of RAMP_STEPS) vars[`--brand-${step}`] = ramp[step];
  return vars;
}

/**
 * CSS pronto para injetar num <style>: tema claro no seletor e escuro em
 * `.dark` (classe no <html>) e em prefers-color-scheme quando não há escolha.
 */
export function themeCss(theme: BrandTheme, selector = ":root"): string {
  const block = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([k, v]) => `${k}:${v};`)
      .join("");
  const darkSel = selector === ":root" ? ".dark" : `.dark ${selector}, ${selector}.dark`;
  return `${selector}{${block(themeVars(theme.light, theme.ramp))}}${darkSel}{${block(themeVars(theme.dark))}}`;
}
