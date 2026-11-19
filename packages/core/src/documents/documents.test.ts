import { describe, expect, it } from "vitest";
import {
  BADGE_A6,
  DEFAULT_TEMPLATES,
  LABEL_80X40,
  SAMPLE_REGISTRATION,
  SAMPLE_TRAVELER,
  approximateMeasurer,
  contrastRatio,
  encodeCode128,
  fieldsForKind,
  fitText,
  formatPeriod,
  getField,
  interpolate,
  isElementVisible,
  pageGeometry,
  parseDefinition,
  readableOn,
  resolveColor,
  resolveField,
  safeParseDefinition,
  validateLayout,
  wrapText,
  type DocumentElement,
} from "./index";

const sans = { font: "sans", weight: "regular" } as const;
const box = {
  w: 50,
  h: 10,
  size: 20,
  minSize: 6,
  maxLines: 1,
  lineHeight: 1.15,
  autoFit: true,
  letterSpacing: 0,
};

describe("schema", () => {
  it("aplica padrões e valida os modelos padrão", () => {
    for (const tpl of Object.values(DEFAULT_TEMPLATES)) {
      const r = safeParseDefinition(tpl);
      expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    }
    const def = parseDefinition(LABEL_80X40);
    const name = def.elements.find((e) => e.id === "name");
    expect(name?.type === "field" && name.style.font).toBe("sans");
    expect(def.page.rotate).toBe(0);
  });

  it("rejeita cor inválida com mensagem em português", () => {
    const r = safeParseDefinition({
      kind: "LABEL",
      page: { width: 80, height: 40 },
      elements: [{ id: "b", type: "box", x: 0, y: 0, w: 1, h: 1, fill: "vermelho" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("campos", () => {
  it("resolve nome do crachá, empresa exibida e telefone formatado", () => {
    expect(resolveField(SAMPLE_REGISTRATION, "person.badgeName")).toBe("Viviane Pinatti");
    expect(resolveField(SAMPLE_REGISTRATION, "person.phone")).toBe("(18) 99876-5432");
    expect(
      resolveField(
        { ...SAMPLE_REGISTRATION, registration: { displayCompany: "Mitte" } },
        "organization.name",
      ),
    ).toBe("Mitte");
  });

  it("formata datas no fuso do projeto (não no do servidor)", () => {
    // 02:55 UTC do dia 13 = 23:55 do dia 12 em Brasília
    expect(resolveField(SAMPLE_TRAVELER, "flights.first")).toContain("12/05/2027 às 23h55");
  });

  it("período em português", () => {
    expect(formatPeriod("2026-11-10T12:00:00Z", "2026-11-11T12:00:00Z")).toBe(
      "10 a 11 de novembro de 2026",
    );
    expect(formatPeriod("2026-11-30T12:00:00Z", "2026-12-02T12:00:00Z")).toBe(
      "30 de novembro a 2 de dezembro de 2026",
    );
  });

  it("campo desconhecido não derruba a impressão", () => {
    expect(resolveField(SAMPLE_REGISTRATION, "nao.existe")).toBe("");
    expect(interpolate("Olá {{person.firstName}}{{x.y}}!", SAMPLE_REGISTRATION)).toBe(
      "Olá Viviane!",
    );
  });

  it("interpola valores do renderizador", () => {
    expect(
      interpolate(
        "Página {{page.number}} de {{page.count}}",
        {},
        { "page.number": "2", "page.count": "3" },
      ),
    ).toBe("Página 2 de 3");
  });

  it("catálogo filtrado por tipo de documento", () => {
    const badge = fieldsForKind("BADGE").map((f) => f.key);
    expect(badge).toContain("registration.category");
    expect(badge).not.toContain("hotel.name");
    expect(fieldsForKind("VOUCHER").map((f) => f.key)).toContain("hotel.name");
    expect(getField("person.badgeName")?.label).toBe("Nome no crachá");
  });
});

describe("ajuste de texto", () => {
  it("reduz a fonte até caber", () => {
    const r = fitText("Maria Eduarda de Albuquerque", box, sans, approximateMeasurer);
    expect(r.size).toBeLessThan(20);
    expect(r.overflow).toBe(false);
    expect(approximateMeasurer(r.lines[0] ?? "", r.size, sans)).toBeLessThanOrEqual(50.01);
  });

  it("sem autoFit mantém o tamanho e trunca com reticências", () => {
    const r = fitText(
      "Maria Eduarda de Albuquerque",
      { ...box, autoFit: false },
      sans,
      approximateMeasurer,
    );
    expect(r.size).toBe(20);
    expect(r.overflow).toBe(true);
    expect(r.lines[0]?.endsWith("…")).toBe(true);
  });

  it("quebra em várias linhas respeitando maxLines", () => {
    const r = fitText(
      "Frigorífico Exemplo Indústria e Comércio de Carnes",
      { ...box, h: 12, size: 10, maxLines: 2 },
      sans,
      approximateMeasurer,
    );
    expect(r.lines.length).toBeLessThanOrEqual(2);
  });

  it("quebra palavra maior que a linha", () => {
    const lines = wrapText(
      "Pneumoultramicroscopicossilicovulcanoconiose",
      20,
      10,
      sans,
      approximateMeasurer,
    );
    expect(lines.length).toBeGreaterThan(1);
  });
});

describe("condições", () => {
  const el = (when: object): DocumentElement =>
    ({
      id: "x",
      type: "box",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      page: 0,
      hidden: false,
      repeat: false,
      rotate: 0,
      strokeWidth: 0.3,
      radius: 0,
      opacity: 1,
      label: "",
      when,
    }) as DocumentElement;

  it("categoria oculta/exibe elemento (sem diferenciar maiúsculas)", () => {
    expect(isElementVisible(el({ categories: ["EXPOSITOR"] }), SAMPLE_REGISTRATION)).toBe(false);
    expect(isElementVisible(el({ categories: ["VISITANTE"] }), SAMPLE_REGISTRATION)).toBe(true);
  });

  it("papel e campos obrigatórios/ausentes", () => {
    expect(isElementVisible(el({ roles: ["ATTENDEE"] }), SAMPLE_REGISTRATION)).toBe(true);
    expect(isElementVisible(el({ requiresField: "registration.table" }), SAMPLE_REGISTRATION)).toBe(
      false,
    );
    expect(isElementVisible(el({ unlessField: "project.logo" }), SAMPLE_REGISTRATION)).toBe(true);
    expect(
      isElementVisible(el({ unlessField: "project.logo" }), { tenant: { logoFileId: "f1" } }),
    ).toBe(false);
  });
});

describe("cores", () => {
  it("texto sobre a marca sempre com contraste legível", () => {
    for (const bg of ["#002042", "#6ba63d", "#a0bf27", "#ffd400", "#1690d0", "#ffffff"]) {
      expect(contrastRatio(bg, readableOn(bg))).toBeGreaterThanOrEqual(3);
    }
  });

  it("tokens resolvem pelo projeto, depois pelo cliente", () => {
    expect(resolveColor("brand", { tenant: { primaryColor: "#123f6d" } })).toBe("#123f6d");
    expect(
      resolveColor("brand", {
        tenant: { primaryColor: "#123f6d" },
        project: { primaryColor: "#aa0000" },
      }),
    ).toBe("#aa0000");
    expect(resolveColor("category", SAMPLE_REGISTRATION)).toBe("#1d6b52");
  });

  it("modo monocromático força preto ou branco", () => {
    expect(resolveColor("#1d6b52", {}, true)).toBe("#000000");
    expect(resolveColor("#f4f4f4", {}, true)).toBe("#ffffff");
  });
});

describe("CODE128", () => {
  it("gera estrutura válida (cada símbolo 11 módulos; stop 13)", () => {
    const { widths, modules } = encodeCode128("ABC-123");
    // start + 7 caracteres + checksum = 9 símbolos × 11 + stop 13
    expect(modules).toBe(9 * 11 + 13);
    expect(widths.length % 6).toBe(1);
  });

  it("usa o subconjunto C para numéricos pares (mais compacto)", () => {
    expect(encodeCode128("482913").modules).toBeLessThan(encodeCode128("A82913").modules);
  });
});

describe("layout", () => {
  it("geometria com sangria e rotação", () => {
    expect(pageGeometry({ ...parseDefinition(BADGE_A6).page })).toMatchObject({
      mediaW: 111,
      mediaH: 154,
    });
    const rotated = pageGeometry({ ...parseDefinition(LABEL_80X40).page, rotate: 90 });
    expect([rotated.sheetW, rotated.sheetH]).toEqual([40, 80]);
  });

  it("crachá padrão não invade furos nem margem de segurança", () => {
    const warnings = validateLayout(parseDefinition(BADGE_A6), (k) => !!getField(k));
    expect(warnings).toEqual([]);
  });

  it("aponta elemento sobre furo e campo inexistente", () => {
    const def = parseDefinition({
      ...BADGE_A6,
      elements: [
        { id: "t", label: "Teste", type: "field", field: "nao.existe", x: 12, y: 6, w: 10, h: 5 },
      ],
    });
    const codes = validateLayout(def, (k) => !!getField(k)).map((w) => w.code);
    expect(codes).toContain("OVER_HOLE");
    expect(codes).toContain("UNKNOWN_FIELD");
  });
});

describe("espelho do banco", () => {
  it("DOCUMENT_KINDS = enum DocumentKind do Prisma", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { DOCUMENT_KINDS } = await import("./schema");
    const src = readFileSync(
      fileURLToPath(new URL("../../../db/prisma/schema/documents.prisma", import.meta.url)),
      "utf8",
    );
    const body = /enum DocumentKind \{([^}]*)\}/.exec(src)?.[1] ?? "";
    const values = body
      .split("\n")
      .map((l) => l.replace(/\/\/.*/, "").trim())
      .filter(Boolean);
    expect([...DOCUMENT_KINDS].sort()).toEqual(values.sort());
  });
});
