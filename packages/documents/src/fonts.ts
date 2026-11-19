import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { PT_TO_MM, type FontSpec, type TextMeasurer } from "@mais/core";

/**
 * Fontes embutidas (OFL, ver fonts/OFL.txt). Instâncias estáticas geradas a
 * partir das variáveis do Google Fonts — o pdf-lib não instancia eixos.
 *
 *   sans  → Instrument Sans (regular, semibold, bold)
 *   serif → Instrument Serif
 *   mono  → Geist Mono (regular, medium)
 *
 * Em ambientes empacotados (Next.js), defina DOCUMENTS_FONTS_DIR se a pasta
 * `fonts/` não ficar ao lado do código.
 */

const FILES: Record<string, string> = {
  "sans:regular": "InstrumentSans-Regular.ttf",
  "sans:semibold": "InstrumentSans-SemiBold.ttf",
  "sans:bold": "InstrumentSans-Bold.ttf",
  "serif:regular": "InstrumentSerif-Regular.ttf",
  "serif:semibold": "InstrumentSerif-Regular.ttf",
  "serif:bold": "InstrumentSerif-Regular.ttf",
  "mono:regular": "GeistMono-Regular.ttf",
  "mono:semibold": "GeistMono-Medium.ttf",
  "mono:bold": "GeistMono-Medium.ttf",
};

/** Nome CSS de cada arquivo (para o HTML de impressão). */
export const CSS_FAMILIES: Record<string, { family: string; weight: number }> = {
  "InstrumentSans-Regular.ttf": { family: "Mais Sans", weight: 400 },
  "InstrumentSans-SemiBold.ttf": { family: "Mais Sans", weight: 600 },
  "InstrumentSans-Bold.ttf": { family: "Mais Sans", weight: 700 },
  "InstrumentSerif-Regular.ttf": { family: "Mais Serif", weight: 400 },
  "GeistMono-Regular.ttf": { family: "Mais Mono", weight: 400 },
  "GeistMono-Medium.ttf": { family: "Mais Mono", weight: 500 },
};

export function fontsDir(): string {
  if (process.env.DOCUMENTS_FONTS_DIR) return process.env.DOCUMENTS_FONTS_DIR;
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fonts");
}

export function fontFile(spec: FontSpec): string {
  return FILES[`${spec.font}:${spec.weight}`] ?? "InstrumentSans-Regular.ttf";
}

const bytesCache = new Map<string, Uint8Array>();
export function fontBytes(file: string): Uint8Array {
  let b = bytesCache.get(file);
  if (!b) {
    b = new Uint8Array(readFileSync(path.join(fontsDir(), file)));
    bytesCache.set(file, b);
  }
  return b;
}

type Metrics = { font: fontkit.Font; widths: Map<string, number> };
const metricsCache = new Map<string, Metrics>();

function metrics(file: string): Metrics {
  let m = metricsCache.get(file);
  if (!m) {
    m = { font: fontkit.create(fontBytes(file)), widths: new Map() };
    metricsCache.set(file, m);
  }
  return m;
}

/** Ascendente/descendente em frações do tamanho da fonte (para posicionar a linha de base). */
export function verticalMetrics(spec: FontSpec): { ascent: number; descent: number } {
  const { font } = metrics(fontFile(spec));
  return { ascent: font.ascent / font.unitsPerEm, descent: font.descent / font.unitsPerEm };
}

/**
 * Medidor com as métricas REAIS da fonte embutida — o mesmo valor que o
 * pdf-lib usa ao desenhar (soma dos avanços, sem kerning).
 */
export const fontMeasurer: TextMeasurer = (text, sizePt, spec, letterSpacingPt = 0) => {
  const m = metrics(fontFile(spec));
  let units = m.widths.get(text);
  if (units === undefined) {
    units = m.font.glyphsForString(text).reduce((sum, g) => sum + g.advanceWidth, 0);
    if (m.widths.size < 5000) m.widths.set(text, units);
  }
  const pt =
    (units / m.font.unitsPerEm) * sizePt + Math.max(0, [...text].length - 1) * letterSpacingPt;
  return pt * PT_TO_MM;
};
