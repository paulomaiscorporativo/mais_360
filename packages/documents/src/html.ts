import {
  pageGeometry,
  parseDefinition,
  type DocumentData,
  type DocumentDefinition,
  type DocumentDefinitionInput,
  type PageSetup,
} from "@mais/core";
import { CSS_FAMILIES, fontBytes } from "./fonts";
import { prepareRecord, type DisplayItem, type TextItem } from "./prepare";

/**
 * HTML para impressão direta em impressora térmica (Zebra, Elgin, Argox) pelo
 * Chrome com `--kiosk-printing`: tudo em mm, @page do tamanho exato da
 * etiqueta, sem margens. Usa a MESMA lista de exibição do PDF, então o ajuste
 * de texto é idêntico ao da pré-visualização.
 */

export type RenderHtmlOptions = {
  /** URL (ou data URL) de um arquivo de imagem pelo id; null = omite a imagem. */
  assetUrl?: (fileId: string) => string | null;
  /** Embute as fontes em base64 (padrão: true) — a etiqueta não depende da rede. */
  embedFonts?: boolean;
  /** Chama window.print() ao carregar (totem/balcão). */
  autoPrint?: boolean;
  title?: string;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const n = (v: number) => Number(v.toFixed(3));

function fontFaces(embed: boolean): string {
  return Object.entries(CSS_FAMILIES)
    .map(([file, { family, weight }]) => {
      const src = embed
        ? `url(data:font/ttf;base64,${Buffer.from(fontBytes(file)).toString("base64")}) format("truetype")`
        : `local("${family}")`;
      return `@font-face{font-family:"${family}";font-weight:${weight};src:${src};font-display:block}`;
    })
    .join("\n");
}

function textHtml(item: TextItem): string {
  const css = CSS_FAMILIES[item.fontFile] ?? { family: "Mais Sans", weight: 400 };
  const swap = item.rotate === 90 || item.rotate === 270;
  const lw = swap ? item.h : item.w;
  const lh = swap ? item.w : item.h;
  const frame = item.rotate
    ? `left:${n(item.x + item.w / 2 - lw / 2)}mm;top:${n(item.y + item.h / 2 - lh / 2)}mm;transform:rotate(${item.rotate}deg);`
    : `left:${n(item.x)}mm;top:${n(item.y)}mm;`;
  const bg = item.background ? `background:${item.background};border-radius:${n(item.radius)}mm;` : "";
  const lines = item.lines
    .map(
      (l) =>
        `<div style="position:absolute;left:${n(l.x)}mm;top:${n(l.top)}mm;height:${n(item.lineBox)}mm;line-height:${n(item.lineBox)}mm;white-space:pre">${esc(l.text)}</div>`,
    )
    .join("");
  return `<div style="position:absolute;${frame}width:${n(lw)}mm;height:${n(lh)}mm;${bg}color:${item.color};font-family:'${css.family}';font-weight:${css.weight};font-size:${n(item.size)}pt;letter-spacing:${n(item.letterSpacing)}pt;overflow:hidden">${lines}</div>`;
}

function itemHtml(item: DisplayItem, opts: RenderHtmlOptions): string {
  switch (item.kind) {
    case "rect": {
      if (!item.fill && !item.stroke) return "";
      const border = item.stroke ? `border:${n(item.strokeWidth)}mm solid ${item.stroke};box-sizing:border-box;` : "";
      return `<div style="position:absolute;left:${n(item.x)}mm;top:${n(item.y)}mm;width:${n(item.w)}mm;height:${n(item.h)}mm;${item.fill ? `background:${item.fill};` : ""}${border}border-radius:${n(item.radius)}mm;opacity:${item.opacity}"></div>`;
    }
    case "text":
      return textHtml(item);
    case "qr": {
      const size = item.modules.length;
      let d = "";
      item.modules.forEach((row, r) => {
        let start = -1;
        for (let c = 0; c <= size; c++) {
          const dark = c < size && row[c];
          if (dark && start < 0) start = c;
          if (!dark && start >= 0) { d += `M${start} ${r}h${c - start}v1h-${c - start}z`; start = -1; }
        }
      });
      return `<svg style="position:absolute;left:${n(item.x)}mm;top:${n(item.y)}mm;width:${n(item.size)}mm;height:${n(item.size)}mm" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="${item.color}" d="${d}"/></svg>`;
    }
    case "barcode": {
      const bars = item.bars.map((b) => `<rect x="${n(b.x)}" y="0" width="${n(b.w)}" height="${n(item.h)}"/>`).join("");
      const svg = `<svg style="position:absolute;left:${n(item.x)}mm;top:${n(item.y)}mm;width:${n(item.w)}mm;height:${n(item.h)}mm" viewBox="0 0 ${n(item.w)} ${n(item.h)}" preserveAspectRatio="none" shape-rendering="crispEdges"><g fill="${item.color}">${bars}</g></svg>`;
      return svg + (item.text ? textHtml(item.text) : "");
    }
    case "image": {
      const url = opts.assetUrl?.(item.fileId);
      if (!url) return "";
      const pos = item.align === "left" ? "left center" : item.align === "right" ? "right center" : "center";
      return `<img alt="" src="${esc(url)}" style="position:absolute;left:${n(item.x)}mm;top:${n(item.y)}mm;width:${n(item.w)}mm;height:${n(item.h)}mm;object-fit:${item.fit};object-position:${pos};${item.circle ? "border-radius:50%;" : ""}">`;
    }
  }
}

function pageWrap(page: PageSetup, inner: string): string {
  const g = pageGeometry(page);
  const rot = page.rotate;
  const t = {
    0: "",
    90: `translate(${n(g.sheetW)}mm,0) rotate(90deg)`,
    180: `translate(${n(g.sheetW)}mm,${n(g.sheetH)}mm) rotate(180deg)`,
    270: `translate(0,${n(g.sheetH)}mm) rotate(270deg)`,
  }[rot];
  const content = `<div style="position:absolute;left:${n(page.bleed)}mm;top:${n(page.bleed)}mm;width:${n(page.width)}mm;height:${n(page.height)}mm">${inner}</div>`;
  return `<section class="page"><div style="position:absolute;left:0;top:0;width:${n(g.mediaW)}mm;height:${n(g.mediaH)}mm;transform:translate(${n(page.offsetX)}mm,${n(page.offsetY)}mm) ${t};transform-origin:0 0">${content}</div></section>`;
}

function shell(page: PageSetup, body: string, opts: RenderHtmlOptions): string {
  const g = pageGeometry(page);
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(opts.title ?? "Etiquetas")}</title>
<style>
${fontFaces(opts.embedFonts !== false)}
@page{size:${n(g.sheetW)}mm ${n(g.sheetH)}mm;margin:0}
html,body{margin:0;padding:0;background:#fff}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:content-box}
.page{position:relative;width:${n(g.sheetW)}mm;height:${n(g.sheetH)}mm;overflow:hidden;break-after:page;page-break-after:always}
.page:last-child{break-after:auto;page-break-after:auto}
@media screen{body{background:#e9edf2;min-height:100vh;box-sizing:border-box;padding:8mm;display:flex;flex-direction:column;align-items:center;gap:6mm}.page{background:#fff;box-shadow:0 1px 3px rgba(11,26,43,.18)}}
</style></head><body>
${body}
${opts.autoPrint ? `<script>document.fonts.ready.then(function(){setTimeout(function(){window.print()},120)})</script>` : ""}
</body></html>`;
}

/** HTML de impressão de um ou mais registros (uma página por etiqueta/crachá). */
export function renderThermalHtml(
  definition: DocumentDefinition | DocumentDefinitionInput,
  records: DocumentData[],
  opts: RenderHtmlOptions = {},
): { html: string; pageCount: number } {
  const def = parseDefinition(definition);
  const pages: string[] = [];
  for (const data of records.length ? records : [{}]) {
    for (const p of prepareRecord(def, data)) {
      pages.push(pageWrap(def.page, p.items.map((i) => itemHtml(i, opts)).join("")));
    }
  }
  return { html: shell(def.page, pages.join("\n"), opts), pageCount: pages.length };
}

/**
 * Página de calibração: borda, cruz central e régua a cada 5 mm, com o tamanho
 * e os ajustes impressos — para acertar a impressora antes do evento.
 */
export function renderCalibrationHtml(page: PageSetup, opts: RenderHtmlOptions = {}): string {
  const ticks: string[] = [];
  for (let x = 5; x < page.width; x += 5) ticks.push(`<div style="position:absolute;left:${x}mm;top:0;width:.2mm;height:${x % 10 ? 2 : 4}mm;background:#000"></div>`);
  for (let y = 5; y < page.height; y += 5) ticks.push(`<div style="position:absolute;top:${y}mm;left:0;height:.2mm;width:${y % 10 ? 2 : 4}mm;background:#000"></div>`);
  const label = (top: number, size: number, weight: number, text: string) =>
    `<div style="position:absolute;left:6mm;top:${top}mm;font:${weight} ${size}pt 'Mais Sans',Arial,sans-serif">${esc(text)}</div>`;
  const inner = `<div style="position:absolute;inset:0;border:.3mm solid #000;box-sizing:border-box"></div>${ticks.join("")}
<div style="position:absolute;left:50%;top:0;bottom:0;border-left:.2mm dashed #000"></div>
<div style="position:absolute;top:50%;left:0;right:0;border-top:.2mm dashed #000"></div>
${label(6, 9, 700, `${page.width} × ${page.height} mm`)}
${label(11, 7, 400, `ajuste X ${page.offsetX} · Y ${page.offsetY} · rotação ${page.rotate}°`)}`;
  return shell(page, pageWrap(page, inner), { ...opts, title: "Calibração da etiqueta" });
}
