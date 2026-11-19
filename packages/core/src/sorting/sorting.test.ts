import { describe, expect, it } from "vitest";
import {
  PLATFORM_DEFAULT_SORT,
  availableSortOptions,
  companyOf,
  describeSortSpec,
  effectiveSortSpec,
  groupRegistrations,
  matchPreset,
  parseSortSpec,
  presetSpec,
  readSortingSettings,
  resolveSortSpec,
  sortBy,
  sortRegistrations,
  sortSpecSchema,
  type SortAvailability,
  type SortRow,
  type SortSpec,
} from "./index";

const full: SortAvailability = {
  features: ["INVITES", "TABLES"],
  hasCategories: true,
  hasGroups: true,
  customFields: { setor: "Setor" },
};
const bare: SortAvailability = { features: [], hasCategories: false, hasGroups: false };

const names = (rows: SortRow[]) => rows.map((r) => r.fullName);
const spec = (levels: SortSpec["levels"], extra: Partial<SortSpec> = {}): SortSpec => ({
  levels,
  groupBy: null,
  pageBreakPerGroup: false,
  ...extra,
});

describe("SortSpec", () => {
  it("aceita até 3 níveis com defaults", () => {
    const s = sortSpecSchema.parse({ levels: [{ field: "company" }] });
    expect(s).toEqual({
      levels: [{ field: "company", direction: "asc" }],
      groupBy: null,
      pageBreakPerGroup: false,
    });
    expect(
      sortSpecSchema.safeParse({
        levels: [
          { field: "company" },
          { field: "fullName" },
          { field: "seat" },
          { field: "status" },
        ],
      }).success,
    ).toBe(false);
    expect(sortSpecSchema.safeParse({ levels: [] }).success).toBe(false);
  });

  it("aceita campos personalizados e recusa campos desconhecidos", () => {
    expect(parseSortSpec({ levels: [{ field: "custom:setor" }] })).not.toBeNull();
    expect(parseSortSpec({ levels: [{ field: "salario" }] })).toBeNull();
    expect(parseSortSpec({ levels: [{ field: "custom:<script>" }] })).toBeNull();
  });

  it("lê da URL e das configurações de forma tolerante", () => {
    expect(parseSortSpec(JSON.stringify(PLATFORM_DEFAULT_SORT))).toEqual(PLATFORM_DEFAULT_SORT);
    expect(parseSortSpec("{quebrado")).toBeNull();
    expect(readSortingSettings({ sorting: presetSpec("name") })).toEqual(presetSpec("name"));
    expect(readSortingSettings({ form: {} })).toBeNull();
    expect(readSortingSettings(null)).toBeNull();
    expect(readSortingSettings({ sorting: "x" })).toBeNull();
  });

  it("reconhece presets e descreve personalizados", () => {
    expect(matchPreset(PLATFORM_DEFAULT_SORT)).toBe("company_name");
    expect(describeSortSpec(presetSpec("seat"))).toBe("Mesa › cadeira");
    expect(
      describeSortSpec(
        spec([{ field: "custom:setor", direction: "desc" }], { groupBy: "company" }),
        { setor: "Setor" },
      ),
    ).toBe("Setor (decrescente), agrupado por empresa");
  });
});

describe("sortRegistrations", () => {
  const rows: SortRow[] = [
    { id: "1", fullName: "Zélia Prado", company: "Beta" },
    { id: "2", fullName: "álvaro Lima", company: "Ágil" },
    { id: "3", fullName: "Bruno Reis", company: "" },
    { id: "4", fullName: "Carla Dias", company: "beta" },
    { id: "5", fullName: "Ana Souza", company: "Agil" },
  ];

  it("empresa › nome em português, acento e caixa não mudam a ordem", () => {
    const out = sortRegistrations(rows, PLATFORM_DEFAULT_SORT);
    expect(names(out)).toEqual([
      "álvaro Lima",
      "Ana Souza",
      "Carla Dias",
      "Zélia Prado",
      "Bruno Reis", // sem empresa: fim
    ]);
  });

  it("vazios ficam no fim também em ordem decrescente", () => {
    const out = sortRegistrations(rows, spec([{ field: "company", direction: "desc" }]));
    expect(out.at(-1)?.fullName).toBe("Bruno Reis");
    expect(out[0]?.company?.toLowerCase()).toBe("beta");
  });

  it("não altera a entrada", () => {
    const copy = [...rows];
    sortRegistrations(rows, PLATFORM_DEFAULT_SORT);
    expect(rows).toEqual(copy);
  });

  it("mesa e cadeira são numéricas: mesa 2 antes de mesa 10", () => {
    const seats: SortRow[] = [
      { id: "a", fullName: "A", table: 10, seat: 1 },
      { id: "b", fullName: "B", table: 2, seat: 3 },
      { id: "c", fullName: "C", table: 2, seat: 1 },
      { id: "d", fullName: "D", table: null },
      { id: "e", fullName: "E", table: 2, seat: null },
    ];
    expect(names(sortRegistrations(seats, presetSpec("seat")))).toEqual(["C", "B", "E", "A", "D"]);
  });

  it("texto com números usa ordem natural", () => {
    const r: SortRow[] = [
      { id: "1", fullName: "x", group: "Ônibus 10" },
      { id: "2", fullName: "y", group: "Ônibus 2" },
    ];
    expect(sortRegistrations(r, spec([{ field: "group", direction: "asc" }]))[0]?.group).toBe(
      "Ônibus 2",
    );
  });

  it("categoria respeita a ordem definida pelo cliente", () => {
    const r: SortRow[] = [
      { id: "1", fullName: "A", category: "Convidado", categoryOrder: 2 },
      { id: "2", fullName: "B", category: "VIP", categoryOrder: 0 },
      { id: "3", fullName: "C" },
    ];
    expect(names(sortRegistrations(r, spec([{ field: "category", direction: "asc" }])))).toEqual([
      "B",
      "A",
      "C",
    ]);
  });

  it("status segue o ciclo da inscrição; data e código", () => {
    const r: SortRow[] = [
      { id: "1", fullName: "A", status: "CANCELED", createdAt: "2026-01-03", shortCode: "900" },
      { id: "2", fullName: "B", status: "PENDING", createdAt: "2026-01-01", shortCode: "100" },
      { id: "3", fullName: "C", status: "CONFIRMED", createdAt: new Date("2026-01-02") },
    ];
    expect(names(sortRegistrations(r, spec([{ field: "status", direction: "asc" }])))).toEqual([
      "B",
      "C",
      "A",
    ]);
    expect(names(sortRegistrations(r, presetSpec("created")))).toEqual(["B", "C", "A"]);
    expect(names(sortRegistrations(r, spec([{ field: "shortCode", direction: "asc" }])))).toEqual([
      "B",
      "A",
      "C",
    ]);
  });

  it("crachá volta para o nome completo; sobrenome e campos personalizados", () => {
    const r: SortRow[] = [
      {
        id: "1",
        fullName: "Maria Souza",
        badgeName: "Mari",
        lastName: "Souza",
        custom: { setor: "TI" },
      },
      { id: "2", fullName: "Joana Alves", lastName: "Alves", custom: { setor: "Comercial" } },
    ];
    expect(names(sortRegistrations(r, spec([{ field: "badgeName", direction: "asc" }])))).toEqual([
      "Joana Alves",
      "Maria Souza",
    ]);
    expect(
      names(sortRegistrations(r, spec([{ field: "custom:setor", direction: "desc" }]))),
    ).toEqual(["Maria Souza", "Joana Alves"]);
  });

  it("desempate final por nome e depois id", () => {
    const r: SortRow[] = [
      { id: "b", fullName: "Ana", company: "X" },
      { id: "a", fullName: "Ana", company: "X" },
      { id: "c", fullName: "Aaron", company: "X" },
    ];
    expect(
      sortRegistrations(r, spec([{ field: "company", direction: "asc" }])).map((x) => x.id),
    ).toEqual(["c", "a", "b"]);
  });

  it("sortBy ordena qualquer item pela linha normalizada", () => {
    const items = [{ n: "Zé" }, { n: "Ana" }];
    expect(sortBy(items, (i) => ({ id: i.n, fullName: i.n }), presetSpec("name"))).toEqual([
      { n: "Ana" },
      { n: "Zé" },
    ]);
  });

  it("companyOf usa a empresa exibida e volta para a do cadastro", () => {
    expect(companyOf("  ", "Frigorífico")).toBe("Frigorífico");
    expect(companyOf("ABIEC", "Outra")).toBe("ABIEC");
    expect(companyOf(null, null)).toBe("");
  });
});

describe("groupRegistrations", () => {
  const rows: SortRow[] = [
    { id: "1", fullName: "Zé", company: "Beta", table: 3 },
    { id: "2", fullName: "Ana", company: "Ágil", table: 1, tableLabel: "Mesa de honra" },
    { id: "3", fullName: "Bia", company: "" },
    { id: "4", fullName: "Caio", company: "agil" },
  ];

  it("agrupa pela empresa, com o grupo vazio no fim", () => {
    const g = groupRegistrations(
      rows,
      spec([{ field: "fullName", direction: "asc" }], { groupBy: "company" }),
    );
    expect(g.map((x) => x.label)).toEqual(["Ágil", "Beta", "Sem empresa"]);
    expect(g[0]?.rows.map((r) => r.fullName)).toEqual(["Ana", "Caio"]);
  });

  it("sem agrupamento devolve um grupo só", () => {
    const g = groupRegistrations(rows, PLATFORM_DEFAULT_SORT);
    expect(g).toHaveLength(1);
    expect(g[0]?.label).toBe("");
  });

  it("rótulos de mesa e status", () => {
    const g = groupRegistrations(
      rows,
      spec([{ field: "fullName", direction: "asc" }], { groupBy: "seat" }),
    );
    expect(g.map((x) => x.label)).toEqual(["Mesa de honra", "Mesa 3", "Sem mesa"]);
    const s = groupRegistrations(
      [{ id: "1", fullName: "A", status: "CONFIRMED" }],
      spec([{ field: "fullName", direction: "asc" }], { groupBy: "status" }),
      { statusLabels: { CONFIRMED: "Confirmada" } },
    );
    expect(s[0]?.label).toBe("Confirmada");
  });

  it("direção do agrupamento vem do nível correspondente", () => {
    const g = groupRegistrations(
      rows,
      spec([{ field: "company", direction: "desc" }], { groupBy: "company" }),
    );
    expect(g.map((x) => x.label)).toEqual(["Beta", "Ágil", "Sem empresa"]);
  });
});

describe("recursos do projeto", () => {
  it("descarta mesa sem o recurso TABLES e mantém o resto, com aviso", () => {
    const r = resolveSortSpec(
      spec([
        { field: "seat", direction: "asc" },
        { field: "company", direction: "asc" },
        { field: "fullName", direction: "asc" },
      ]),
      bare,
    );
    expect(r.spec.levels.map((l) => l.field)).toEqual(["company", "fullName"]);
    expect(r.dropped).toEqual(["seat"]);
    expect(r.warnings[0]).toContain("mapa de mesas");
  });

  it("descarta empresa da cota sem convites, categoria e grupo inexistentes", () => {
    const r = resolveSortSpec(
      spec(
        [
          { field: "inviter", direction: "asc" },
          { field: "category", direction: "asc" },
          { field: "custom:nada", direction: "asc" },
        ],
        { groupBy: "group", pageBreakPerGroup: true },
      ),
      { ...bare, customFields: {} },
    );
    expect(r.dropped).toEqual(["inviter", "category", "custom:nada", "group"]);
    // nada sobrou: usa o padrão da plataforma
    expect(r.spec).toEqual(PLATFORM_DEFAULT_SORT);
    expect(r.warnings.at(-1)).toContain("Empresa › nome");
  });

  it("mantém o spec quando tudo existe e remove níveis repetidos", () => {
    const r = resolveSortSpec(
      spec(
        [
          { field: "seat", direction: "asc" },
          { field: "seat", direction: "desc" },
        ],
        { groupBy: "category", pageBreakPerGroup: true },
      ),
      full,
    );
    expect(r.warnings).toEqual([]);
    expect(r.spec.levels).toHaveLength(1);
    expect(r.spec.pageBreakPerGroup).toBe(true);
  });

  it("lista campos e presets disponíveis", () => {
    const b = availableSortOptions(bare);
    expect(b.fields.map((f) => f.value)).not.toContain("seat");
    expect(b.fields.map((f) => f.value)).not.toContain("category");
    expect(b.presets.map((p) => p.id)).toEqual(["company_name", "name", "created"]);
    const f = availableSortOptions(full);
    expect(f.presets).toHaveLength(5);
    expect(f.fields.find((x) => x.value === "custom:setor")?.label).toBe("Setor");
  });
});

describe("cascata", () => {
  it("escolha na hora › projeto › cliente › plataforma", () => {
    const name = presetSpec("name");
    const created = presetSpec("created");
    expect(effectiveSortSpec({ availability: full }).source).toBe("platform");
    expect(effectiveSortSpec({ tenant: name, availability: full })).toMatchObject({
      source: "tenant",
      spec: name,
    });
    expect(effectiveSortSpec({ tenant: name, project: created, availability: full }).source).toBe(
      "project",
    );
    expect(
      effectiveSortSpec({
        tenant: name,
        project: created,
        override: JSON.stringify(presetSpec("seat")),
        availability: full,
      }).source,
    ).toBe("override");
  });

  it("valor inválido em um nível passa para o próximo", () => {
    const r = effectiveSortSpec({
      override: "lixo",
      project: { levels: [] },
      tenant: presetSpec("name"),
      availability: bare,
    });
    expect(r.source).toBe("tenant");
  });

  it("o padrão herdado também é ajustado aos recursos", () => {
    const r = effectiveSortSpec({ tenant: presetSpec("seat"), availability: bare });
    expect(r.spec).toEqual(PLATFORM_DEFAULT_SORT);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
