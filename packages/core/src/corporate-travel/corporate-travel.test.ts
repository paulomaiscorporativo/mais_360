import { describe, expect, it } from "vitest";
import {
  advanceDays,
  approvalModeOf,
  approvalOutcome,
  canBook,
  canChooseQuote,
  canRequesterEdit,
  compareQuotes,
  conditionsForMode,
  currentApproval,
  evaluatePolicy,
  formatCents,
  formatProtocol,
  justificationProblem,
  nextProtocol,
  normalizeQuoteLines,
  normalizeTravelRequest,
  parseMoneyToCents,
  perPaxCents,
  quoteInputSchema,
  requiredApprovalSteps,
  routeLabel,
  selectPolicy,
  statusAfterAssign,
  travelRequestInputSchema,
  type ApprovalFlowDef,
  type ApprovalStepDef,
  type Policy,
  type PolicySubject,
} from "./index";

describe("dinheiro", () => {
  it("lê valores digitados em formato brasileiro e internacional", () => {
    expect(parseMoneyToCents("1.234,56")).toBe(123456);
    expect(parseMoneyToCents("R$ 980")).toBe(98000);
    expect(parseMoneyToCents("1234.5")).toBe(123450);
    expect(parseMoneyToCents("1.234")).toBe(123400);
    expect(parseMoneyToCents("1,234.56")).toBe(123456);
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("12,345")).toBeNaN();
    expect(parseMoneyToCents("-10")).toBeNaN();
  });

  it("formata centavos com a moeda", () => {
    expect(formatCents(123456, "BRL").replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(formatCents(null)).toBe("");
  });
});

describe("protocolo", () => {
  it("gera a sequência anual com seis dígitos", () => {
    expect(formatProtocol(2026, 7)).toBe("VC-2026-000007");
    expect(nextProtocol(2026, "VC-2026-000041")).toBe("VC-2026-000042");
    expect(nextProtocol(2027, "VC-2026-000041")).toBe("VC-2027-000001");
    expect(nextProtocol(2026, null)).toBe("VC-2026-000001");
  });
});

describe("status", () => {
  it("assumir tira a solicitação de nova; outras etapas não mudam", () => {
    expect(statusAfterAssign("NEW")).toBe("IN_PROGRESS");
    expect(statusAfterAssign("QUOTED")).toBe("QUOTED");
  });
  it("define quem pode o quê em cada etapa", () => {
    expect(canRequesterEdit("NEW")).toBe(true);
    expect(canRequesterEdit("IN_PROGRESS")).toBe(false);
    expect(canChooseQuote("QUOTED")).toBe(true);
    expect(canChooseQuote("REJECTED")).toBe(true);
    expect(canChooseQuote("AWAITING_APPROVAL")).toBe(false);
    expect(canBook("APPROVED")).toBe(true);
    expect(canBook("QUOTED")).toBe(false);
  });
});

const baseInput = {
  tripType: "ROUND_TRIP" as const,
  purpose: "Reunião com importadores",
  segments: [
    { origin: "São Paulo (GRU)", destination: "Lisboa (LIS)", date: "2026-12-10" },
    { origin: "Lisboa (LIS)", destination: "São Paulo (GRU)", date: "2026-12-15" },
  ],
  passengers: [{ name: "Carlos Pereira", type: "HOLDER" as const }],
  services: ["AIR", "HOTEL"],
  serviceDetails: { AIR: { cabin: "BUSINESS" }, HOTEL: { city: "Lisboa", stars: "4" } },
  budget: "18.000,00",
};

describe("normalizeTravelRequest", () => {
  const parse = (over: Record<string, unknown> = {}) =>
    normalizeTravelRequest(travelRequestInputSchema.parse({ ...baseInput, ...over }), "2026-11-19");

  it("resume trechos, datas, serviços e orçamento", () => {
    const r = parse();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.origin).toBe("São Paulo (GRU)");
    expect(r.data.destination).toBe("Lisboa (LIS)");
    expect(r.data.departDate.toISOString()).toBe("2026-12-10T12:00:00.000Z");
    expect(r.data.returnDate?.toISOString()).toBe("2026-12-15T12:00:00.000Z");
    expect(r.data.kind).toBe("PACKAGE");
    expect(r.data.budgetCents).toBe(1_800_000);
    expect(r.data.pax).toBe(1);
  });

  it("confere a quantidade de trechos por tipo de viagem", () => {
    const r = parse({ tripType: "ONE_WAY" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.segments).toMatch(/um trecho/);
  });

  it("recusa datas passadas ou fora de ordem", () => {
    const past = parse({
      segments: [
        { origin: "AA", destination: "BB", date: "2026-11-01" },
        { origin: "BB", destination: "AA", date: "2026-11-02" },
      ],
    });
    expect(past.ok).toBe(false);
    const order = parse({
      segments: [
        { origin: "AA", destination: "BB", date: "2026-12-10" },
        { origin: "BB", destination: "AA", date: "2026-12-01" },
      ],
    });
    expect(order.ok).toBe(false);
    if (!order.ok) expect(order.fieldErrors["segments.1.date"]).toBeTruthy();
  });

  it("multitrecho usa o último destino e só aceita um titular", () => {
    const r = parse({
      tripType: "MULTI_CITY",
      segments: [
        { origin: "GRU", destination: "LIS", date: "2026-12-10" },
        { origin: "LIS", destination: "MAD", date: "2026-12-12" },
        { origin: "MAD", destination: "GRU", date: "2026-12-15" },
      ],
    });
    expect(r.ok && r.data.destination).toBe("GRU");
    const two = parse({
      passengers: [
        { name: "Carlos Pereira", type: "HOLDER" },
        { name: "Marina Pereira", type: "HOLDER" },
      ],
    });
    expect(two.ok).toBe(false);
  });

  it("orçamento ilegível vira erro de campo", () => {
    const r = parse({ budget: "muito" });
    expect(r.ok).toBe(true); // sem dígitos = sem orçamento
    const bad = parse({ budget: "12,345" });
    expect(bad.ok).toBe(false);
  });

  it("monta a rota resumida", () => {
    expect(
      routeLabel([
        { origin: "GRU", destination: "LIS" },
        { origin: "LIS", destination: "MAD" },
      ]),
    ).toBe("GRU → LIS → MAD");
  });
});

const general: Policy = {
  id: "p1",
  name: "Política geral",
  active: true,
  priority: 0,
  appliesTo: {},
  minAdvanceDays: 14,
  requireInsuranceInternational: true,
  requireJustification: true,
  rules: [
    {
      serviceType: "AIR",
      scope: "ANY",
      destination: "",
      maxAmountCents: 300_000,
      unit: "trecho",
      currency: "BRL",
      maxCabin: "ECONOMY",
      maxHotelStars: null,
    },
    {
      serviceType: "HOTEL",
      scope: "ANY",
      destination: "",
      maxAmountCents: 90_000,
      unit: "noite",
      currency: "BRL",
      maxCabin: null,
      maxHotelStars: 4,
    },
  ],
};
const board: Policy = {
  ...general,
  id: "p2",
  name: "Diretoria",
  priority: 10,
  appliesTo: { memberTypes: ["Diretor"] },
  rules: [{ ...general.rules[0]!, maxCabin: "BUSINESS", maxAmountCents: 1_500_000 }],
};

describe("selectPolicy", () => {
  it("escolhe a de maior prioridade cujo público inclui a pessoa", () => {
    expect(selectPolicy([general, board], { memberType: "diretor", jobTitle: "" })?.id).toBe("p2");
    expect(selectPolicy([general, board], { memberType: "Associado", jobTitle: "" })?.id).toBe(
      "p1",
    );
    expect(
      selectPolicy([{ ...general, active: false }], { memberType: "", jobTitle: "" }),
    ).toBeNull();
  });
});

const subject = (over: Partial<PolicySubject> = {}): PolicySubject => ({
  scope: "INTERNATIONAL",
  destinations: ["Lisboa (LIS)"],
  departDate: new Date("2026-12-10T12:00:00Z"),
  at: new Date("2026-11-19T15:00:00Z"),
  segments: 2,
  pax: 2,
  requestedServices: ["AIR", "HOTEL", "TRAVEL_INSURANCE"],
  requestedCabin: "ECONOMY",
  requestedStars: null,
  ...over,
});

describe("evaluatePolicy", () => {
  it("dentro da política não gera violação", () => {
    expect(evaluatePolicy(general, subject())).toEqual([]);
    expect(evaluatePolicy(null, subject({ requestedCabin: "FIRST" }))).toEqual([]);
  });

  it("antecedência mínima conta dias de calendário", () => {
    expect(advanceDays(new Date("2026-11-19T23:00:00Z"), new Date("2026-11-20T12:00:00Z"))).toBe(1);
    const v = evaluatePolicy(general, subject({ departDate: new Date("2026-11-25T12:00:00Z") }));
    expect(v.map((x) => x.code)).toEqual(["ADVANCE"]);
    expect(v[0]!.message).toMatch(/6 dias de antecedência; a política pede pelo menos 14/);
  });

  it("classe acima da permitida e hotel acima da categoria", () => {
    const v = evaluatePolicy(general, subject({ requestedCabin: "BUSINESS", requestedStars: 5 }));
    expect(v.map((x) => x.code).sort()).toEqual(["CABIN", "HOTEL_STARS"]);
    expect(evaluatePolicy(board, subject({ requestedCabin: "BUSINESS" }))).toEqual([]);
  });

  it("seguro obrigatório em viagem internacional", () => {
    const v = evaluatePolicy(general, subject({ requestedServices: ["AIR"] }));
    expect(v.map((x) => x.code)).toEqual(["INSURANCE"]);
    expect(
      evaluatePolicy(general, subject({ scope: "DOMESTIC", requestedServices: ["AIR"] })),
    ).toEqual([]);
  });

  it("limite de valor por trecho e por noite, por passageiro", () => {
    // Aéreo: 2 pax × 2 trechos → R$ 13.200 ÷ 4 = R$ 3.300 por trecho (limite R$ 3.000)
    // Hotel: R$ 4.000 em 5 noites = R$ 800/noite (limite R$ 900)
    const v = evaluatePolicy(
      general,
      subject({
        quote: {
          currency: "BRL",
          items: [
            { type: "AIR", saleCents: 1_320_000, quantity: 1, cabin: "ECONOMY" },
            { type: "HOTEL", saleCents: 400_000, quantity: 5, stars: 4 },
          ],
        },
      }),
    );
    expect(v.map((x) => x.code)).toEqual(["AMOUNT"]);
    expect(v[0]!.found.replace(/\s/g, " ")).toBe("R$ 3.300,00");
  });

  it("não compara valores em moeda diferente da regra", () => {
    const v = evaluatePolicy(
      general,
      subject({
        quote: { currency: "EUR", items: [{ type: "AIR", saleCents: 9_999_999, quantity: 1 }] },
      }),
    );
    expect(v).toEqual([]);
  });

  it("regra por destino só vale para aquele destino", () => {
    const p: Policy = {
      ...general,
      minAdvanceDays: null,
      rules: [{ ...general.rules[1]!, destination: "São Paulo", maxHotelStars: 3 }],
    };
    expect(evaluatePolicy(p, subject({ requestedStars: 5 }))).toEqual([]);
    expect(
      evaluatePolicy(p, subject({ requestedStars: 5, destinations: ["Sao Paulo"] })),
    ).toHaveLength(1);
  });
});

const step: ApprovalStepDef = {
  id: "s1",
  sortOrder: 0,
  name: "Aprovador do cliente",
  approverType: "TENANT_ROLE",
  approverUserId: null,
  approverPersonId: null,
  thresholdCents: null,
  onlyOutOfPolicy: false,
};
const flow = (conditions: object, steps = [step]): ApprovalFlowDef => ({
  id: "f1",
  name: "Aprovação",
  active: true,
  priority: 0,
  conditions,
  steps,
});

describe("aprovação", () => {
  it("só fora da política: dentro segue direto", () => {
    const f = [flow(conditionsForMode("OUT_OF_POLICY"))];
    expect(
      requiredApprovalSteps(f, { outOfPolicy: false, totalCents: 1, scope: "DOMESTIC" }),
    ).toBeNull();
    expect(
      requiredApprovalSteps(f, { outOfPolicy: true, totalCents: 1, scope: "DOMESTIC" })?.steps,
    ).toHaveLength(1);
    expect(approvalModeOf(f)).toBe("OUT_OF_POLICY");
  });

  it("sempre: toda escolha passa pelo aprovador", () => {
    const f = [flow(conditionsForMode("ALWAYS"))];
    expect(
      requiredApprovalSteps(f, { outOfPolicy: false, totalCents: 1, scope: "DOMESTIC" }),
    ).not.toBeNull();
    expect(approvalModeOf(f)).toBe("ALWAYS");
    expect(approvalModeOf([])).toBe("NEVER");
  });

  it("alçada por valor filtra etapas (vários níveis)", () => {
    const f = [
      flow({}, [
        step,
        { ...step, id: "s2", sortOrder: 1, name: "Diretoria", thresholdCents: 2_000_000 },
      ]),
    ];
    expect(
      requiredApprovalSteps(f, {
        outOfPolicy: false,
        totalCents: 500_000,
        scope: "DOMESTIC",
      })?.steps.map((s) => s.id),
    ).toEqual(["s1"]);
    expect(
      requiredApprovalSteps(f, { outOfPolicy: false, totalCents: 2_500_000, scope: "DOMESTIC" })
        ?.steps,
    ).toHaveLength(2);
  });

  it("etapas em sequência e recusa encerra", () => {
    const rows = [
      { id: "a", sortOrder: 0, decision: "APPROVED" as const },
      { id: "b", sortOrder: 1, decision: "PENDING" as const },
    ];
    expect(currentApproval(rows)?.id).toBe("b");
    expect(approvalOutcome(rows)).toBe("PENDING");
    expect(approvalOutcome([{ ...rows[1]!, decision: "APPROVED" }, rows[0]!])).toBe("APPROVED");
    expect(approvalOutcome([{ ...rows[0]!, decision: "REJECTED" }, rows[1]!])).toBe("REJECTED");
    expect(currentApproval([{ ...rows[0]!, decision: "REJECTED" }, rows[1]!])).toBeNull();
  });

  it("justificativa só quando fora da política e exigida", () => {
    expect(justificationProblem(false, true, "")).toBeNull();
    expect(justificationProblem(true, false, "")).toBeNull();
    expect(justificationProblem(true, true, "curto")).toMatch(/fora da política/);
    expect(justificationProblem(true, true, "Único voo que chega antes da feira")).toBeNull();
  });
});

describe("cotações", () => {
  it("soma as linhas e calcula o valor por passageiro", () => {
    const q = quoteInputSchema.parse({
      title: "Opção 1",
      lines: [
        { type: "AIR", title: "TAP direto", amount: "8.400,00", cabin: "ECONOMY" },
        { type: "HOTEL", title: "Hotel Avenida", amount: "3.600,00", quantity: 5, stars: "4" },
      ],
    });
    const r = normalizeQuoteLines(q.lines);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.totalCents).toBe(1_200_000);
    expect(r.lines[1]!.stars).toBe(4);
    expect(r.lines[0]!.stars).toBeNull();
    expect(perPaxCents(r.totalCents, 3)).toBe(400_000);
  });

  it("linha sem valor é erro de campo", () => {
    const r = normalizeQuoteLines([
      { type: "AIR", title: "Voo", description: "", amount: "", quantity: 1, cabin: "", stars: "" },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("lines.0.amount");
  });

  it("destaca a mais barata entre as válidas e avisa moedas misturadas", () => {
    const now = new Date("2026-11-19T12:00:00Z");
    const c = compareQuotes(
      [
        { id: "a", currency: "BRL", totalCents: 900_000, validUntil: null, inPolicy: true },
        {
          id: "b",
          currency: "BRL",
          totalCents: 700_000,
          validUntil: new Date("2026-11-01"),
          inPolicy: true,
        },
        { id: "c", currency: "BRL", totalCents: 800_000, validUntil: null, inPolicy: false },
        { id: "d", currency: "EUR", totalCents: 100_000, validUntil: null, inPolicy: null },
      ],
      now,
    );
    expect(c.cheapestId).toBe("c");
    expect(c.expiredIds).toEqual(["b"]);
    expect(c.mixedCurrencies).toBe(true);
  });
});
