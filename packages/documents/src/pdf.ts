import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  appendBezierCurve,
  clip,
  closePath,
  concatTransformationMatrix,
  degrees,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  type PDFEmbeddedPage,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import {
  MM_TO_PT,
  hexToRgb,
  interpolate,
  pageGeometry,
  parseDefinition,
  type DocumentData,
  type DocumentDefinition,
  type DocumentDefinitionInput,
} from "@mais/core";
import { fontBytes } from "./fonts";
import { prepareRecord, type DisplayItem, type ImageItem, type TextItem } from "./prepare";

export type LoadedAsset = { bytes: Uint8Array; mimeType?: string };
/** Carrega um arquivo (logo, foto, PDF de fundo) pelo id de StoredFile. */
export type AssetLoader = (fileId: string) => Promise<LoadedAsset | null>;

export type RenderPdfOptions = {
  loadAsset?: AssetLoader;
  /** Pré-visualização do editor: desenha sangria, corte, margem de segurança e furos. */
  guides?: boolean;
  title?: string;
  author?: string;
};

export type RenderPdfResult = {
  bytes: Uint8Array;
  pageCount: number;
  fileName: string;
  /** Avisos não fatais (logo ausente, texto truncado…) para exibir ao operador. */
  warnings: string[];
};

const color = (hex: string) => {
  const c = hexToRgb(hex);
  return rgb(c.r, c.g, c.b);
};

function isPng(a: LoadedAsset) {
  if (a.mimeType) return a.mimeType.includes("png");
  return a.bytes[0] === 0x89 && a.bytes[1] === 0x50;
}

/** Retângulo com cantos arredondados como caminho SVG (origem no canto superior esquerdo). */
function roundedRectPath(w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr === 0) return `M0,0 H${w} V${h} H0 Z`;
  return `M${rr},0 H${w - rr} A${rr},${rr} 0 0 1 ${w},${rr} V${h - rr} A${rr},${rr} 0 0 1 ${w - rr},${h} H${rr} A${rr},${rr} 0 0 1 0,${h - rr} V${rr} A${rr},${rr} 0 0 1 ${rr},0 Z`;
}

class PdfWriter {
  private fonts = new Map<string, PDFFont>();
  private images = new Map<string, PDFImage | null>();
  readonly warnings: string[] = [];

  constructor(
    readonly doc: PDFDocument,
    readonly def: DocumentDefinition,
    private readonly loadAsset?: AssetLoader,
  ) {}

  async font(file: string): Promise<PDFFont> {
    let f = this.fonts.get(file);
    if (!f) {
      f = await this.doc.embedFont(fontBytes(file), { subset: true });
      this.fonts.set(file, f);
    }
    return f;
  }

  async image(fileId: string): Promise<PDFImage | null> {
    if (this.images.has(fileId)) return this.images.get(fileId) ?? null;
    let img: PDFImage | null = null;
    try {
      const asset = await this.loadAsset?.(fileId);
      if (asset)
        img = isPng(asset)
          ? await this.doc.embedPng(asset.bytes)
          : await this.doc.embedJpg(asset.bytes);
      else this.warnings.push(`Imagem ${fileId} não encontrada.`);
    } catch {
      this.warnings.push(`Imagem ${fileId} em formato não suportado (use PNG ou JPG).`);
    }
    this.images.set(fileId, img);
    return img;
  }
}

/** Converte mm (origem no topo-esquerdo da área final) para pt do PDF (origem embaixo-esquerda da mídia). */
function coords(def: DocumentDefinition) {
  const g = pageGeometry(def.page);
  const ox = def.page.bleed + def.page.offsetX;
  const oy = def.page.bleed + def.page.offsetY;
  return {
    g,
    px: (xMm: number) => (ox + xMm) * MM_TO_PT,
    /** y do PDF para a BORDA INFERIOR de algo que começa em yMm com altura hMm. */
    py: (yMm: number, hMm = 0) => (g.mediaH - oy - yMm - hMm) * MM_TO_PT,
  };
}

async function drawText(w: PdfWriter, page: PDFPage, item: TextItem) {
  const { px, py } = coords(w.def);
  const font = await w.font(item.fontFile);
  const swap = item.rotate === 90 || item.rotate === 270;
  const lw = swap ? item.h : item.w;
  const lh = swap ? item.w : item.h;

  page.pushOperators(pushGraphicsState());
  if (item.rotate) {
    // Gira em torno do centro da caixa; desenha numa caixa local centrada.
    const cx = px(item.x + item.w / 2);
    const cy = py(item.y + item.h / 2);
    const a = (-item.rotate * Math.PI) / 180;
    page.pushOperators(
      concatTransformationMatrix(1, 0, 0, 1, cx, cy),
      concatTransformationMatrix(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0),
      concatTransformationMatrix(1, 0, 0, 1, -(lw / 2) * MM_TO_PT, -(lh / 2) * MM_TO_PT),
    );
  } else {
    page.pushOperators(concatTransformationMatrix(1, 0, 0, 1, px(item.x), py(item.y, lh)));
  }
  // A partir daqui: origem no canto inferior esquerdo da caixa local, em pt.
  if (item.background) {
    page.drawSvgPath(roundedRectPath(lw * MM_TO_PT, lh * MM_TO_PT, item.radius * MM_TO_PT), {
      x: 0,
      y: lh * MM_TO_PT,
      color: color(item.background),
      borderWidth: 0,
    });
  }
  if (item.letterSpacing) page.pushOperators(setCharacterSpacing(item.letterSpacing));
  for (const line of item.lines) {
    page.drawText(line.text, {
      x: line.x * MM_TO_PT,
      y: (lh - line.baseline) * MM_TO_PT,
      size: item.size,
      font,
      color: color(item.color),
    });
  }
  page.pushOperators(popGraphicsState());
}

async function drawImage(w: PdfWriter, page: PDFPage, item: ImageItem) {
  const img = await w.image(item.fileId);
  if (!img) return;
  const { px, py } = coords(w.def);
  const scale =
    item.fit === "cover"
      ? Math.max(item.w / img.width, item.h / img.height)
      : Math.min(item.w / img.width, item.h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = item.align === "left" ? 0 : item.align === "right" ? item.w - dw : (item.w - dw) / 2;
  const dy = (item.h - dh) / 2;

  const needsClip = item.circle || item.fit === "cover";
  page.pushOperators(pushGraphicsState());
  if (needsClip) {
    const x0 = px(item.x);
    const y0 = py(item.y, item.h);
    const W = item.w * MM_TO_PT;
    const H = item.h * MM_TO_PT;
    if (item.circle) {
      const k = 0.5523;
      const rx = W / 2;
      const ry = H / 2;
      const cx = x0 + rx;
      const cy = y0 + ry;
      page.pushOperators(
        moveTo(cx + rx, cy),
        appendBezierCurve(cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry),
        appendBezierCurve(cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy),
        appendBezierCurve(cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry),
        appendBezierCurve(cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy),
      );
    } else {
      page.pushOperators(
        moveTo(x0, y0),
        lineTo(x0 + W, y0),
        lineTo(x0 + W, y0 + H),
        lineTo(x0, y0 + H),
      );
    }
    page.pushOperators(closePath(), clip(), endPath());
  }
  page.drawImage(img, {
    x: px(item.x + dx),
    y: py(item.y + dy, dh),
    width: dw * MM_TO_PT,
    height: dh * MM_TO_PT,
  });
  page.pushOperators(popGraphicsState());
}

async function drawItem(w: PdfWriter, page: PDFPage, item: DisplayItem) {
  const { px, py } = coords(w.def);
  switch (item.kind) {
    case "rect": {
      if (!item.fill && !item.stroke) return;
      page.drawSvgPath(
        roundedRectPath(item.w * MM_TO_PT, item.h * MM_TO_PT, item.radius * MM_TO_PT),
        {
          x: px(item.x),
          y: py(item.y),
          color: item.fill ? color(item.fill) : undefined,
          borderColor: item.stroke ? color(item.stroke) : undefined,
          borderWidth: item.stroke ? item.strokeWidth * MM_TO_PT : 0,
          opacity: item.opacity,
          borderOpacity: item.opacity,
        },
      );
      return;
    }
    case "text":
      if (item.overflow)
        w.warnings.push(
          `Texto “${item.lines.map((l) => l.text).join(" ")}” não coube e foi abreviado.`,
        );
      return drawText(w, page, item);
    case "qr": {
      const n = item.modules.length;
      const cell = item.size / n;
      const c = color(item.color);
      // Agrupa módulos escuros consecutivos da linha em um retângulo só (PDF menor e nítido).
      item.modules.forEach((row, r) => {
        let start = -1;
        for (let col = 0; col <= n; col++) {
          const dark = col < n && row[col];
          if (dark && start < 0) start = col;
          if (!dark && start >= 0) {
            page.drawRectangle({
              x: px(item.x + start * cell),
              y: py(item.y + r * cell, cell),
              width: (col - start) * cell * MM_TO_PT + 0.02,
              height: cell * MM_TO_PT + 0.02,
              color: c,
            });
            start = -1;
          }
        }
      });
      return;
    }
    case "barcode": {
      const c = color(item.color);
      for (const bar of item.bars) {
        page.drawRectangle({
          x: px(item.x + bar.x),
          y: py(item.y, item.h),
          width: bar.w * MM_TO_PT,
          height: item.h * MM_TO_PT,
          color: c,
        });
      }
      if (item.text) await drawText(w, page, item.text);
      return;
    }
    case "image":
      return drawImage(w, page, item);
  }
}

function drawGuides(w: PdfWriter, page: PDFPage) {
  const { px, py } = coords(w.def);
  const p = w.def.page;
  const dash = { borderDashArray: [3, 2] };
  if (p.bleed > 0) {
    page.drawRectangle({
      x: px(-p.bleed),
      y: py(-p.bleed, p.height + 2 * p.bleed),
      width: (p.width + 2 * p.bleed) * MM_TO_PT,
      height: (p.height + 2 * p.bleed) * MM_TO_PT,
      borderColor: rgb(0.86, 0.15, 0.15),
      borderWidth: 0.6,
    });
  }
  page.drawRectangle({
    x: px(0),
    y: py(0, p.height),
    width: p.width * MM_TO_PT,
    height: p.height * MM_TO_PT,
    borderColor: rgb(0.15, 0.39, 0.92),
    borderWidth: 0.6,
  });
  if (p.safeMargin > 0) {
    page.drawRectangle({
      x: px(p.safeMargin),
      y: py(p.safeMargin, p.height - 2 * p.safeMargin),
      width: (p.width - 2 * p.safeMargin) * MM_TO_PT,
      height: (p.height - 2 * p.safeMargin) * MM_TO_PT,
      borderColor: rgb(0.09, 0.64, 0.29),
      borderWidth: 0.6,
      ...dash,
    });
  }
  for (const h of p.holes) {
    page.drawEllipse({
      x: px(h.x),
      y: py(h.y),
      xScale: ((h.shape === "slot" ? (h.width ?? h.diameter * 3) : h.diameter) / 2) * MM_TO_PT,
      yScale: (h.diameter / 2) * MM_TO_PT,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.3, 0.3, 0.3),
      borderWidth: 0.5,
    });
  }
}

function safeFileName(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `${base || "documento"}.pdf`;
}

/**
 * Renderiza um ou mais registros (lote) em UM PDF. Cada registro gera as
 * páginas do modelo (+ continuação das seções do voucher).
 */
export async function renderPdf(
  definition: DocumentDefinition | DocumentDefinitionInput,
  records: DocumentData[],
  opts: RenderPdfOptions = {},
): Promise<RenderPdfResult> {
  const def = parseDefinition(definition);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setCreator("Comitiva · Mais Corporativo");
  doc.setProducer("@mais/documents");
  if (opts.title) doc.setTitle(opts.title);
  if (opts.author) doc.setAuthor(opts.author);

  const w = new PdfWriter(doc, def, opts.loadAsset);
  const { g } = coords(def);

  // Fundo: PDF (cada página do arquivo vira uma página) ou imagem.
  let bgPdfPages: (PDFEmbeddedPage | null)[] = [];
  let bgImage: PDFImage | null = null;
  const bg = def.page.background;
  if (bg) {
    const asset = await opts.loadAsset?.(bg.fileId);
    if (!asset) w.warnings.push("Arte de fundo não encontrada; o documento saiu sem ela.");
    else if (bg.kind === "pdf") {
      const src = await PDFDocument.load(asset.bytes);
      // Página a página: uma página em branco (sem conteúdo) não pode derrubar o documento.
      // (o pdf-lib só falha no save(), então a checagem é feita antes de embutir).
      for (const i of src.getPageIndices()) {
        if (!src.getPage(i).node.Contents()) {
          bgPdfPages.push(null);
          continue;
        }
        const [emb] = await doc.embedPdf(src, [i]);
        bgPdfPages.push(emb ?? null);
      }
    } else bgImage = await w.image(bg.fileId);
  }

  const list = records.length ? records : [{}];
  for (const data of list) {
    const pages = prepareRecord(def, data, { backgroundPages: bgPdfPages.length });
    for (const prepared of pages) {
      const page = doc.addPage([g.mediaW * MM_TO_PT, g.mediaH * MM_TO_PT]);
      if (def.page.bleed > 0) {
        const b = def.page.bleed * MM_TO_PT;
        page.setTrimBox(b, b, def.page.width * MM_TO_PT, def.page.height * MM_TO_PT);
        page.setBleedBox(0, 0, g.mediaW * MM_TO_PT, g.mediaH * MM_TO_PT);
      }
      if (def.page.rotate) page.setRotation(degrees(def.page.rotate));
      if (def.page.fill) {
        page.drawRectangle({
          x: 0,
          y: 0,
          width: g.mediaW * MM_TO_PT,
          height: g.mediaH * MM_TO_PT,
          color: color(def.page.fill.startsWith("#") ? def.page.fill : "#ffffff"),
        });
      }
      // A arte de fundo cobre a mídia inteira quando foi feita com sangria; senão, a área final.
      const bgTarget = (wPt: number, hPt: number) => {
        const withBleed =
          Math.abs(wPt - g.mediaW * MM_TO_PT) < 3 && Math.abs(hPt - g.mediaH * MM_TO_PT) < 3;
        const b = withBleed ? 0 : def.page.bleed * MM_TO_PT;
        return {
          x: b,
          y: b,
          width: (withBleed ? g.mediaW : def.page.width) * MM_TO_PT,
          height: (withBleed ? g.mediaH : def.page.height) * MM_TO_PT,
        };
      };
      if (prepared.backgroundPage !== null) {
        const emb = bgPdfPages[prepared.backgroundPage];
        if (emb) page.drawPage(emb, bgTarget(emb.width, emb.height));
        else if (bgImage) page.drawImage(bgImage, bgTarget(bgImage.width, bgImage.height));
      }
      for (const item of prepared.items) await drawItem(w, page, item);
      if (opts.guides) drawGuides(w, page);
    }
  }

  const bytes = await doc.save();
  return {
    bytes,
    pageCount: doc.getPageCount(),
    fileName: safeFileName(
      list.length === 1
        ? interpolate(def.fileName, list[0] ?? {})
        : `${def.fileName.replace(/\{\{.*?\}\}/g, "").replace(/-+$/, "") || "documentos"}-lote`,
    ),
    warnings: [...new Set(w.warnings)],
  };
}
