/**
 * Utilitários de cor sem dependências: sRGB ⇄ OKLCH e contraste WCAG 2.x.
 *
 * Trabalhamos em OKLCH porque a luminosidade é perceptualmente uniforme: uma
 * rampa gerada variando só L tem degraus visualmente iguais para qualquer
 * matiz — o que não acontece em HSL (amarelo "claro" e azul "claro" com a
 * mesma L em HSL parecem de pesos muito diferentes).
 */

export type Rgb = { r: number; g: number; b: number }; // 0–1
export type Oklch = { l: number; c: number; h: number }; // l 0–1, c ≥ 0, h em graus

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX_RE.test(value.trim());
}

export function parseHex(value: string): Rgb {
  const m = HEX_RE.exec(value.trim());
  if (!m?.[1]) throw new Error(`Cor inválida: "${value}". Use o formato #RRGGBB.`);
  let hex = m[1];
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  const n = parseInt(hex, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function normalizeHex(value: string): string {
  return toHex(parseHex(value));
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

function oklchToLinear({ l, c, h }: Oklch): Rgb {
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr);
  const B = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    g: -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    b: -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  };
}

const inGamut = ({ r, g, b }: Rgb) =>
  [r, g, b].every((v) => v >= -0.0001 && v <= 1.0001);

/** Converte para sRGB reduzindo o croma até caber no gamut (preserva L e matiz). */
export function oklchToRgb(color: Oklch): Rgb {
  let lo = 0;
  let hi = color.c;
  let lin = oklchToLinear(color);
  if (!inGamut(lin)) {
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ ...color, c: mid }))) lo = mid;
      else hi = mid;
    }
    lin = oklchToLinear({ ...color, c: lo });
  }
  return { r: fromLinear(lin.r), g: fromLinear(lin.g), b: fromLinear(lin.b) };
}

/** Luminância relativa WCAG 2.x. */
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Razão de contraste WCAG 2.x (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
