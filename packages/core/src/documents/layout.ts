import type { DocumentData } from "./data";
import type { DocumentDefinition, DocumentElement, PageSetup } from "./schema";
import { resolveField } from "./fields";

/** O elemento aparece para estes dados? (condições por categoria, papel e campo obrigatório) */
export function isElementVisible(el: DocumentElement, data: DocumentData): boolean {
  if (el.hidden) return false;
  const w = el.when;
  if (!w) return true;
  const norm = (v: string | undefined) => (v ?? "").trim().toLocaleUpperCase("pt-BR");
  if (w.categories?.length) {
    const cat = norm(data.registration?.category);
    if (!w.categories.map(norm).includes(cat)) return false;
  }
  if (w.roles?.length) {
    const role = norm(data.registration?.role);
    if (!w.roles.map(norm).includes(role)) return false;
  }
  if (w.requiresField && !resolveField(data, w.requiresField)) return false;
  if (w.unlessField && resolveField(data, w.unlessField)) return false;
  return true;
}

export type Rect = { x: number; y: number; w: number; h: number };

export function elementRect(el: DocumentElement): Rect {
  if (el.type === "qrcode") return { x: el.x, y: el.y, w: el.size, h: el.size };
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}

/** Tamanho físico da mídia (com sangria) e da página impressa (com rotação). */
export function pageGeometry(page: PageSetup) {
  const mediaW = page.width + 2 * page.bleed;
  const mediaH = page.height + 2 * page.bleed;
  const swap = page.rotate === 90 || page.rotate === 270;
  return {
    trimW: page.width,
    trimH: page.height,
    mediaW,
    mediaH,
    /** Dimensões da folha que sai da impressora (após rotação). */
    sheetW: swap ? mediaH : mediaW,
    sheetH: swap ? mediaW : mediaH,
  };
}

function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export type LayoutWarning = {
  elementId: string;
  code: "OUTSIDE_PAGE" | "OUTSIDE_SAFE_AREA" | "OVER_HOLE" | "UNKNOWN_FIELD" | "TOO_SMALL_QR";
  message: string;
};

/**
 * Alertas para o editor: elemento fora da página, invadindo a margem de
 * segurança ou um furo, QR pequeno demais para leitura confiável…
 * `knownField` permite ao chamador validar campos contra o catálogo.
 */
export function validateLayout(def: DocumentDefinition, knownField: (key: string) => boolean): LayoutWarning[] {
  const out: LayoutWarning[] = [];
  const { page } = def;
  const safe: Rect = {
    x: page.safeMargin,
    y: page.safeMargin,
    w: page.width - 2 * page.safeMargin,
    h: page.height - 2 * page.safeMargin,
  };
  const holeRects = page.holes.map((h) => {
    const w = h.shape === "slot" ? (h.width ?? h.diameter * 3) : h.diameter;
    return { x: h.x - w / 2, y: h.y - h.diameter / 2, w, h: h.diameter };
  });

  for (const el of def.elements) {
    if (el.hidden) continue;
    const r = elementRect(el);
    const isBackgroundShape = el.type === "box" && !el.stroke; // faixas de cor podem sangrar
    if (r.x < -page.bleed - 0.01 || r.y < -page.bleed - 0.01 || r.x + r.w > page.width + page.bleed + 0.01 || r.y + r.h > page.height + page.bleed + 0.01) {
      out.push({ elementId: el.id, code: "OUTSIDE_PAGE", message: `“${el.label || el.id}” sai da página.` });
    } else if (!isBackgroundShape && page.safeMargin > 0 && !(r.x >= safe.x - 0.01 && r.y >= safe.y - 0.01 && r.x + r.w <= safe.x + safe.w + 0.01 && r.y + r.h <= safe.y + safe.h + 0.01)) {
      out.push({ elementId: el.id, code: "OUTSIDE_SAFE_AREA", message: `“${el.label || el.id}” invade a margem de segurança e pode ser cortado.` });
    }
    if (!isBackgroundShape && holeRects.some((h) => intersects(r, h))) {
      out.push({ elementId: el.id, code: "OVER_HOLE", message: `“${el.label || el.id}” fica sobre um furo do crachá.` });
    }
    if ((el.type === "field" || el.type === "qrcode" || el.type === "barcode") && !knownField(el.field)) {
      out.push({ elementId: el.id, code: "UNKNOWN_FIELD", message: `Campo “${el.field}” não existe.` });
    }
    if (el.type === "qrcode" && el.size < 12) {
      out.push({ elementId: el.id, code: "TOO_SMALL_QR", message: "QR menor que 12 mm pode falhar na leitura pelo celular." });
    }
  }
  return out;
}
