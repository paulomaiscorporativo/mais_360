import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  BADGE_A6,
  LABEL_80X40,
  MM_TO_PT,
  SAMPLE_REGISTRATION,
  SAMPLE_TRAVELER,
  VOUCHER_A4,
  parseDefinition,
  textStyleSchema,
  type DocumentData,
  type DocumentDefinitionInput,
} from "@mais/core";
import { fontMeasurer } from "./fonts";
import { renderCalibrationHtml, renderPdf, renderThermalHtml } from "./index";
import { layoutText, prepareRecord, type TextItem } from "./prepare";

const mmOf = (pt: number) => Math.round((pt / MM_TO_PT) * 10) / 10;

/** Textos Unicode mapeados nas fontes do PDF (ToUnicode) — prova que não houve troca por "?". */
async function mappedCodepoints(bytes: Uint8Array): Promise<Set<number>> {
  const doc = await PDFDocument.load(bytes);
  const out = new Set<number>();
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(PDFName.of("Type")) !== PDFName.of("Font")) continue;
    const ref = obj.get(PDFName.of("ToUnicode"));
    const stream = ref ? doc.context.lookup(ref) : undefined;
    if (!(stream instanceof PDFRawStream)) continue;
    const cmap = new TextDecoder().decode(decodePDFRawStream(stream).decode());
    for (const m of cmap.matchAll(/<([0-9A-Fa-f]{4})>\s*$/gm)) out.add(parseInt(m[1] ?? "0", 16));
    for (const m of cmap.matchAll(/<[0-9A-Fa-f]+>\s*<([0-9A-Fa-f]{4})>/g))
      out.add(parseInt(m[1] ?? "0", 16));
  }
  return out;
}

function texts(def: DocumentDefinitionInput, data: DocumentData): string[] {
  return prepareRecord(parseDefinition(def), data).flatMap((p) =>
    p.items
      .filter((i): i is TextItem => i.kind === "text")
      .flatMap((i) => i.lines.map((l) => l.text)),
  );
}

describe("PDF", () => {
  it("lote de etiquetas: uma página por inscrição, no tamanho exato", async () => {
    const records = [SAMPLE_REGISTRATION, SAMPLE_REGISTRATION, SAMPLE_REGISTRATION];
    const r = await renderPdf(LABEL_80X40, records);
    const doc = await PDFDocument.load(r.bytes);
    expect(r.pageCount).toBe(3);
    expect(doc.getPageCount()).toBe(3);
    const { width, height } = doc.getPage(0).getSize();
    expect([mmOf(width), mmOf(height)]).toEqual([80, 40]);
  });

  it("crachá com sangria: mídia 111×154 e área de corte 105×148", async () => {
    const r = await renderPdf(BADGE_A6, [SAMPLE_REGISTRATION]);
    const page = (await PDFDocument.load(r.bytes)).getPage(0);
    expect([mmOf(page.getWidth()), mmOf(page.getHeight())]).toEqual([111, 154]);
    const trim = page.getTrimBox();
    expect([mmOf(trim.x), mmOf(trim.width), mmOf(trim.height)]).toEqual([3, 105, 148]);
  });

  it("preserva acentos e caracteres especiais (UTF-8, sem trocar por ?)", async () => {
    const r = await renderPdf(VOUCHER_A4, [SAMPLE_TRAVELER]);
    const cps = await mappedCodepoints(r.bytes);
    for (const ch of "úõçãâ—·") expect(cps.has(ch.codePointAt(0) ?? 0), `falta “${ch}”`).toBe(true);
  });

  it("voucher transborda para novas páginas e numera corretamente", async () => {
    const many: DocumentData = {
      ...SAMPLE_TRAVELER,
      itinerary: Array.from({ length: 60 }, (_, i) => ({
        date: "2027-05-14T12:00:00Z",
        startTime: "09:00",
        title: `Atividade ${i + 1}`,
      })),
    };
    const r = await renderPdf(VOUCHER_A4, [many]);
    expect(r.pageCount).toBeGreaterThanOrEqual(3);
    const all = texts(VOUCHER_A4, many);
    expect(all).toContain(`Página ${r.pageCount} de ${r.pageCount}`);
    expect(all.filter((t) => t === "Voucher de viagem").length).toBe(r.pageCount); // cabeçalho repetido
  });

  it("PDF de fundo multipágina: cada página do arquivo vira uma página, por registro", async () => {
    const bg = await PDFDocument.create();
    bg.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]).drawRectangle({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    bg.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]); // verso em branco: precisa ser tolerado
    const bgBytes = await bg.save();
    const def: DocumentDefinitionInput = {
      kind: "VOUCHER",
      page: { width: 210, height: 297, background: { kind: "pdf", fileId: "bg" } },
      elements: [
        { id: "n", type: "field", field: "person.fullName", x: 20, y: 40, w: 120, h: 8 },
        { id: "h", type: "field", field: "hotel.name", x: 20, y: 40, w: 120, h: 8, page: 1 },
      ],
    };
    const r = await renderPdf(def, [SAMPLE_TRAVELER, SAMPLE_TRAVELER], {
      loadAsset: async (id) =>
        id === "bg" ? { bytes: bgBytes, mimeType: "application/pdf" } : null,
    });
    expect(r.pageCount).toBe(4);
    expect(r.warnings).toEqual([]);
  });

  it("imagem ausente gera aviso, não erro", async () => {
    const r = await renderPdf(
      BADGE_A6,
      [{ ...SAMPLE_REGISTRATION, tenant: { logoFileId: "sumiu" } }],
      { loadAsset: async () => null },
    );
    expect(r.pageCount).toBe(1);
    expect(r.warnings.some((w) => w.includes("sumiu"))).toBe(true);
  });
});

describe("lista de exibição", () => {
  it("condição por categoria oculta o elemento", () => {
    const def: DocumentDefinitionInput = {
      kind: "LABEL",
      page: { width: 80, height: 40 },
      elements: [
        {
          id: "a",
          type: "text",
          text: "Somente expositor",
          x: 2,
          y: 2,
          w: 60,
          h: 6,
          when: { categories: ["EXPOSITOR"] },
        },
        { id: "b", type: "text", text: "Todos", x: 2, y: 10, w: 60, h: 6 },
      ],
    };
    expect(texts(def, SAMPLE_REGISTRATION)).toEqual(["Todos"]);
    expect(texts(def, { registration: { category: "Expositor" } })).toEqual([
      "Somente expositor",
      "Todos",
    ]);
  });

  it("autoFit com métricas reais: reduz a fonte e não ultrapassa a caixa", () => {
    const style = textStyleSchema.parse({ size: 30, weight: "bold", minSize: 8 });
    const item = layoutText(
      "Maria Eduarda de Albuquerque Figueiredo",
      { x: 0, y: 0, w: 60, h: 12 },
      style,
      { color: "#000000" },
    );
    expect(item.size).toBeLessThan(30);
    for (const l of item.lines) {
      expect(fontMeasurer(l.text, item.size, { font: "sans", weight: "bold" })).toBeLessThanOrEqual(
        60.01,
      );
    }
  });

  it("campo vazio com fallback", () => {
    expect(texts(BADGE_A6, { ...SAMPLE_REGISTRATION, registration: { shortCode: "1" } })).toContain(
      "PARTICIPANTE",
    );
  });
});

describe("HTML térmico", () => {
  it("@page no tamanho da etiqueta e uma página por inscrição", () => {
    const { html, pageCount } = renderThermalHtml(LABEL_80X40, [
      SAMPLE_REGISTRATION,
      SAMPLE_REGISTRATION,
    ]);
    expect(pageCount).toBe(2);
    expect(html).toContain("@page{size:80mm 40mm;margin:0}");
    expect(html.match(/<section class="page">/g)?.length).toBe(2);
    expect(html).toContain("Viviane Pinatti");
  });

  it("rotação de 90° troca as dimensões da folha", () => {
    const def = { ...LABEL_80X40, page: { ...LABEL_80X40.page, rotate: 90 as const } };
    expect(renderThermalHtml(def, [SAMPLE_REGISTRATION], { embedFonts: false }).html).toContain(
      "@page{size:40mm 80mm;margin:0}",
    );
  });

  it("escapa HTML vindo dos dados", () => {
    const { html } = renderThermalHtml(
      LABEL_80X40,
      [{ ...SAMPLE_REGISTRATION, person: { badgeName: "<script>x</script>" } }],
      { embedFonts: false },
    );
    expect(html).not.toContain("<script>x");
  });

  it("página de calibração", () => {
    expect(
      renderCalibrationHtml(parseDefinition(LABEL_80X40).page, { embedFonts: false }),
    ).toContain("80 × 40 mm");
  });
});
