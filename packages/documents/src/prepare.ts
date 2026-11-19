import QRCode from "qrcode";
import {
  encodeCode128,
  fitText,
  interpolate,
  isElementVisible,
  PT_TO_MM,
  resolveColor,
  resolveField,
  type DocumentData,
  type DocumentDefinition,
  type DocumentElement,
  type FontSpec,
  type TextStyle,
} from "@mais/core";
import { fontFile, fontMeasurer, verticalMetrics } from "./fonts";
import { layoutSections } from "./sections";

/**
 * Lista de exibição: o documento resolvido para UM registro, em mm a partir do
 * canto superior esquerdo da área final (sem sangria). Os renderizadores (PDF e
 * HTML) só desenham estes itens — a mesma etiqueta sai idêntica nos dois.
 */

export type RectItem = {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  strokeWidth: number;
  radius: number;
  opacity: number;
};

export type TextLine = { text: string; x: number; baseline: number; top: number; width: number };

export type TextItem = {
  kind: "text";
  /** Caixa no papel. Com rotação, as linhas usam a caixa local (w e h trocados). */
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: 0 | 90 | 180 | 270;
  lines: TextLine[];
  size: number; // pt
  lineBox: number; // mm
  fontFile: string;
  color: string;
  letterSpacing: number; // pt
  background?: string;
  radius: number;
  overflow: boolean;
};

export type QrItem = {
  kind: "qr";
  x: number;
  y: number;
  size: number;
  modules: boolean[][];
  color: string;
};
export type BarcodeItem = {
  kind: "barcode";
  x: number;
  y: number;
  w: number;
  h: number;
  bars: { x: number; w: number }[];
  color: string;
  text?: TextItem;
};
export type ImageItem = {
  kind: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  fileId: string;
  fit: "contain" | "cover";
  align: "left" | "center" | "right";
  circle: boolean;
};
export type DisplayItem = RectItem | TextItem | QrItem | BarcodeItem | ImageItem;

export type PrepareContext = { pageNumber?: number; pageCount?: number };

function spec(style: TextStyle): FontSpec {
  return { font: style.font, weight: style.weight };
}

/** Ajusta e posiciona um texto dentro de uma caixa — usado também pelas seções do voucher. */
export function layoutText(
  raw: string,
  box: { x: number; y: number; w: number; h: number; rotate?: 0 | 90 | 180 | 270 },
  style: TextStyle,
  colors: { color: string; background?: string },
): TextItem {
  const rotate = box.rotate ?? 0;
  const swap = rotate === 90 || rotate === 270;
  const lw = swap ? box.h : box.w;
  const lh = swap ? box.w : box.h;
  const text = style.uppercase ? raw.toLocaleUpperCase("pt-BR") : raw;
  const fs = spec(style);
  const pad = style.padding;
  const fit = fitText(
    text,
    {
      w: lw,
      h: Math.max(0.1, lh - 2 * pad),
      size: style.size,
      minSize: Math.min(style.minSize, style.size),
      maxLines: style.maxLines,
      lineHeight: style.lineHeight,
      autoFit: style.autoFit,
      letterSpacing: style.letterSpacing,
      padding: pad,
    },
    fs,
    fontMeasurer,
  );
  const lineBox = fit.size * style.lineHeight * PT_TO_MM;
  const block = fit.lines.length * lineBox;
  const innerH = lh - 2 * pad;
  const top0 =
    pad +
    (style.valign === "top"
      ? 0
      : style.valign === "bottom"
        ? innerH - block
        : (innerH - block) / 2);
  const { ascent, descent } = verticalMetrics(fs);
  const content = (ascent - descent) * fit.size * PT_TO_MM;
  const lines: TextLine[] = fit.lines.map((t, i) => {
    const width = fontMeasurer(t, fit.size, fs, style.letterSpacing);
    const avail = lw - 2 * pad;
    const x =
      pad +
      (style.align === "center"
        ? (avail - width) / 2
        : style.align === "right"
          ? avail - width
          : 0);
    const top = top0 + i * lineBox;
    return {
      text: t,
      x,
      top,
      width,
      baseline: top + (lineBox - content) / 2 + ascent * fit.size * PT_TO_MM,
    };
  });
  return {
    kind: "text",
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    rotate,
    lines,
    size: fit.size,
    lineBox,
    fontFile: fontFile(fs),
    color: colors.color,
    letterSpacing: style.letterSpacing,
    background: colors.background,
    radius: style.radius,
    overflow: fit.overflow,
  };
}

function qrModules(value: string, ecl: "L" | "M" | "Q" | "H", quiet: number): boolean[][] {
  const qr = QRCode.create(value || "-", { errorCorrectionLevel: ecl });
  const n = qr.modules.size;
  const total = n + quiet * 2;
  const rows: boolean[][] = [];
  for (let r = 0; r < total; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < total; c++) {
      const rr = r - quiet;
      const cc = c - quiet;
      row.push(rr >= 0 && cc >= 0 && rr < n && cc < n ? !!qr.modules.get(rr, cc) : false);
    }
    rows.push(row);
  }
  return rows;
}

function prepareElement(
  el: DocumentElement,
  def: DocumentDefinition,
  data: DocumentData,
  ctx: PrepareContext,
): DisplayItem | null {
  const color = (c: Parameters<typeof resolveColor>[0]) => resolveColor(c, data, def.monochrome);
  const extra = {
    "page.number": String(ctx.pageNumber ?? 1),
    "page.count": String(ctx.pageCount ?? 1),
  };

  switch (el.type) {
    case "box":
      return {
        kind: "rect",
        x: el.x,
        y: el.y,
        w: el.w,
        h: el.h,
        fill: el.fill ? color(el.fill) : undefined,
        stroke: el.stroke ? color(el.stroke) : undefined,
        strokeWidth: el.strokeWidth,
        radius: el.radius,
        opacity: el.opacity,
      };
    case "text":
    case "field": {
      const value =
        el.type === "text"
          ? interpolate(el.text, data, extra)
          : (() => {
              const v = resolveField(data, el.field) || el.fallback;
              return v ? `${el.prefix}${v}${el.suffix}` : "";
            })();
      if (!value.trim()) return null;
      return layoutText(value, el, el.style, {
        color: color(el.style.color),
        background: el.style.background ? color(el.style.background) : undefined,
      });
    }
    case "qrcode": {
      const value = resolveField(data, el.field);
      if (!value) return null;
      return {
        kind: "qr",
        x: el.x,
        y: el.y,
        size: el.size,
        modules: qrModules(value, el.errorCorrection, el.quietZone),
        color: color(el.color),
      };
    }
    case "barcode": {
      const value = resolveField(data, el.field);
      if (!value) return null;
      const textH = el.showText ? Math.min(3.5, el.h * 0.3) : 0;
      const { widths, modules } = encodeCode128(value);
      const unit = el.w / modules;
      const bars: { x: number; w: number }[] = [];
      let cursor = 0;
      widths.forEach((wd, i) => {
        if (i % 2 === 0) bars.push({ x: cursor * unit, w: wd * unit });
        cursor += wd;
      });
      return {
        kind: "barcode",
        x: el.x,
        y: el.y,
        w: el.w,
        h: el.h - textH,
        bars,
        color: color(el.color),
        text: el.showText
          ? layoutText(
              value,
              { x: el.x, y: el.y + el.h - textH, w: el.w, h: textH },
              {
                font: "mono",
                weight: "regular",
                size: 7,
                minSize: 4,
                autoFit: true,
                maxLines: 1,
                lineHeight: 1,
                align: "center",
                valign: "middle",
                color: "black",
                uppercase: false,
                letterSpacing: 0.4,
                radius: 0,
                padding: 0,
              },
              { color: color(el.color) },
            )
          : undefined,
      };
    }
    case "image": {
      const fileId =
        el.source.kind === "file" ? el.source.fileId : resolveField(data, el.source.field);
      if (!fileId) return null;
      return {
        kind: "image",
        x: el.x,
        y: el.y,
        w: el.w,
        h: el.h,
        fileId,
        fit: el.fit,
        align: el.align,
        circle: el.circle,
      };
    }
    case "sections":
      return null; // expandidas em prepareRecord
  }
}

/** Número de páginas-base do modelo (sem transbordo das seções). */
export function basePageCount(def: DocumentDefinition, backgroundPages = 0): number {
  const fromElements = def.elements.reduce((max, e) => Math.max(max, e.page + 1), 1);
  const bg = def.page.background;
  const fromBackground = bg?.kind === "pdf" && bg.allPages ? backgroundPages : 0;
  return Math.max(fromElements, fromBackground, 1);
}

export type PreparedPage = {
  items: DisplayItem[];
  /** Página do fundo a desenhar (PDF: índice; imagem: 0); null = sem fundo. */
  backgroundPage: number | null;
};

/**
 * Resolve o documento de UM registro em páginas prontas para desenhar.
 * Duas passadas: a primeira descobre quantas páginas o transbordo das seções
 * cria; a segunda monta com {{page.count}} correto.
 */
export function prepareRecord(
  def: DocumentDefinition,
  data: DocumentData,
  opts: { backgroundPages?: number } = {},
): PreparedPage[] {
  const bgPages = opts.backgroundPages ?? 0;
  const bg = def.page.background;
  const basePage = (index: number): number | null => {
    if (!bg) return null;
    if (bg.kind === "image") return 0;
    if (!bg.allPages) return 0;
    return index < bgPages ? index : null;
  };

  const build = (pageCount: number): PreparedPage[] => {
    const out: PreparedPage[] = [];
    const base = basePageCount(def, bgPages);
    for (let index = 0; index < base; index++) {
      const items: DisplayItem[] = [];
      let overflow: DisplayItem[][] = [];
      const pageNumber = out.length + 1;
      for (const el of def.elements) {
        if (el.page !== index || !isElementVisible(el, data)) continue;
        if (el.type === "sections") {
          const pages = layoutSections(el, data, resolveColor(el.accent, data, def.monochrome));
          items.push(...(pages[0] ?? []));
          overflow = pages.slice(1);
          continue;
        }
        const item = prepareElement(el, def, data, { pageNumber, pageCount });
        if (item) items.push(item);
      }
      out.push({ items, backgroundPage: basePage(index) });
      for (const extra of overflow) {
        const n = out.length + 1;
        const repeated = def.elements
          .filter((el) => el.repeat && el.type !== "sections" && isElementVisible(el, data))
          .map((el) => prepareElement(el, def, data, { pageNumber: n, pageCount }))
          .filter((x): x is DisplayItem => !!x);
        out.push({
          items: [...repeated, ...extra],
          backgroundPage: bg ? bg.continuationPage : null,
        });
      }
    }
    return out;
  };

  const first = build(1);
  return build(first.length);
}
