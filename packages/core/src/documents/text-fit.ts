import type { FontFamily, FontWeight } from "./schema";

/** 1 pt = 0,3528 mm. */
export const PT_TO_MM = 25.4 / 72;
export const MM_TO_PT = 72 / 25.4;

export type FontSpec = { font: FontFamily; weight: FontWeight };

/**
 * Mede a largura de um texto em mm. Injetável: o renderizador PDF usa as
 * métricas reais da fonte embutida; os testes usam um medidor determinístico.
 */
export type TextMeasurer = (text: string, sizePt: number, spec: FontSpec, letterSpacingPt?: number) => number;

/** Medidor aproximado (largura média de glifo) — útil para testes e pré-cálculos. */
export const approximateMeasurer: TextMeasurer = (text, sizePt, spec, letterSpacingPt = 0) => {
  const factor = spec.font === "mono" ? 0.6 : spec.weight === "bold" ? 0.56 : 0.52;
  return (text.length * sizePt * factor + Math.max(0, text.length - 1) * letterSpacingPt) * PT_TO_MM;
};

export type FitBox = {
  w: number; // mm
  h: number; // mm
  size: number; // pt desejado
  minSize: number;
  maxLines: number;
  lineHeight: number;
  autoFit: boolean;
  letterSpacing: number;
  /** Folga horizontal descontada da largura (padding). */
  padding?: number;
};

export type FitResult = {
  size: number;
  lines: string[];
  /** true se mesmo no tamanho mínimo o texto não coube (foi truncado com "…"). */
  overflow: boolean;
};

/** Quebra em palavras respeitando a largura; quebra palavra longa por caractere. */
export function wrapText(
  text: string,
  maxWidth: number,
  sizePt: number,
  spec: FontSpec,
  measure: TextMeasurer,
  letterSpacing = 0,
): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let cur = "";
    for (const word of words) {
      const candidate = cur ? `${cur} ${word}` : word;
      if (measure(candidate, sizePt, spec, letterSpacing) <= maxWidth) {
        cur = candidate;
        continue;
      }
      if (cur) out.push(cur);
      // palavra maior que a linha: corta por caractere
      if (measure(word, sizePt, spec, letterSpacing) > maxWidth) {
        let piece = "";
        for (const ch of word) {
          if (piece && measure(piece + ch, sizePt, spec, letterSpacing) > maxWidth) {
            out.push(piece);
            piece = ch;
          } else piece += ch;
        }
        cur = piece;
      } else cur = word;
    }
    if (cur) out.push(cur);
  }
  return out;
}

function lineHeightMm(sizePt: number, lineHeight: number) {
  return sizePt * lineHeight * PT_TO_MM;
}

function ellipsize(line: string, maxWidth: number, sizePt: number, spec: FontSpec, measure: TextMeasurer, ls: number) {
  if (measure(line, sizePt, spec, ls) <= maxWidth) return line;
  let t = line;
  while (t.length > 1 && measure(`${t}…`, sizePt, spec, ls) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/**
 * Encaixa o texto na caixa: tenta o tamanho desejado e, com autoFit, reduz em
 * passos de 0,5 pt até caber em largura, altura e número de linhas. Abaixo do
 * mínimo, trunca a última linha com reticências (nunca vaza da etiqueta).
 */
export function fitText(text: string, box: FitBox, spec: FontSpec, measure: TextMeasurer): FitResult {
  const width = Math.max(0.1, box.w - 2 * (box.padding ?? 0));
  const clean = text.trim();
  if (!clean) return { size: box.size, lines: [], overflow: false };

  const attempt = (size: number) => {
    const lines =
      box.maxLines === 1 ? [clean.replace(/\s*\n\s*/g, " ")] : wrapText(clean, width, size, spec, measure, box.letterSpacing);
    const widest = Math.max(...lines.map((l) => measure(l, size, spec, box.letterSpacing)));
    const height = lines.length * lineHeightMm(size, box.lineHeight);
    const fits = widest <= width + 0.01 && height <= box.h + 0.01 && lines.length <= box.maxLines;
    return { lines, fits };
  };

  let size = box.size;
  for (;;) {
    const { lines, fits } = attempt(size);
    if (fits) return { size, lines, overflow: false };
    if (!box.autoFit || size - 0.5 < box.minSize) break;
    size = Math.round((size - 0.5) * 10) / 10;
  }

  // Não coube: mantém o maior número de linhas que cabe na altura e trunca.
  const { lines } = attempt(size);
  const byHeight = Math.max(1, Math.floor((box.h + 0.01) / lineHeightMm(size, box.lineHeight)));
  const keep = Math.min(box.maxLines, byHeight, lines.length);
  const kept = lines.slice(0, keep);
  if (lines.length > keep && kept.length) kept[keep - 1] = `${kept[keep - 1]} ${lines.slice(keep).join(" ")}`;
  const last = kept.length - 1;
  if (last >= 0) kept[last] = ellipsize(kept[last] ?? "", width, size, spec, measure, box.letterSpacing);
  return { size, lines: kept, overflow: true };
}
