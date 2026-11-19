import { describe, expect, it } from "vitest";
import {
  INVITE_STATUS,
  PROJECT_STATUS,
  calendarAt,
  calendarNoon,
  convert,
  convertPlaceholders,
  convertTravelServices,
  deterministicId,
  formatProtocol,
  isBcryptHash,
  legacyKeysOf,
  mergePerson,
  nextProtocolSeq,
  normalizePerson,
  parseBudgetCents,
  planPeople,
  planRooms,
  reaisToCents,
  roomTypeFromLabel,
  wallClockToUtc,
  withLegacyKeys,
  type LegacyTravelServices,
} from ".";

const HASH = "$2b$10$GFP5Gk6ES7Cm5Tt2KPgSGeW7bMLZfAOHcKD8sSoVyfKLdQ/KxvrXq";

describe("ids", () => {
  it("é estável, no formato cuid e depende do cliente", () => {
    const a = deterministicId("t1", "abiec:Passenger:x");
    expect(a).toBe(deterministicId("t1", "abiec:Passenger:x"));
    expect(a).toMatch(/^c[0-9a-z]{24}$/);
    expect(a).not.toBe(deterministicId("t2", "abiec:Passenger:x"));
  });

  it("acumula chaves de origem sem perder o que já havia", () => {
    const j = withLegacyKeys({ mautic: "9", legado: "a" }, ["b", "a"]);
    expect(j).toEqual({ mautic: "9", legado: "a", legadoFundidos: ["b"] });
    expect(legacyKeysOf(j)).toEqual(["a", "b"]);
    expect(legacyKeysOf(null)).toEqual([]);
  });
});

describe("status", () => {
  it("converte e sinaliza valor desconhecido", () => {
    expect(convert(PROJECT_STATUS, "inscricoes", "PLANNING")).toMatchObject({
      value: "REGISTRATION_OPEN",
      known: true,
    });
    expect(convert(PROJECT_STATUS, "RASCUNHO", "PLANNING")).toMatchObject({
      value: "PLANNING",
      known: false,
    });
    expect(convert(INVITE_STATUS, "CREDENCIADO", "PENDING").value).toBe("CONFIRMED");
    expect(convert(INVITE_STATUS, "", "PENDING").known).toBe(true);
  });
});

describe("dinheiro", () => {
  it("reais → centavos", () => {
    expect(reaisToCents(1500.5)).toBe(150050);
    expect(reaisToCents(0.1 + 0.2)).toBe(30);
    expect(reaisToCents(Number.NaN)).toBe(0);
  });

  it("orçamento em texto", () => {
    expect(parseBudgetCents("R$ 15.000,00")).toBe(1_500_000);
    expect(parseBudgetCents("15000")).toBe(1_500_000);
    expect(parseBudgetCents("8.500")).toBe(850_000);
    expect(parseBudgetCents("1234.56")).toBe(123_456);
    expect(parseBudgetCents("até 8 mil")).toBeNull();
    expect(parseBudgetCents("")).toBeNull();
  });
});

describe("datas", () => {
  it("dia de calendário vira meio-dia UTC do mesmo dia", () => {
    expect(calendarNoon(Date.UTC(1985, 4, 12))?.toISOString()).toBe("1985-05-12T12:00:00.000Z");
    expect(calendarNoon(null)).toBeNull();
  });

  it("dia + horário no fuso do projeto", () => {
    expect(calendarAt(Date.UTC(2026, 8, 10), "14:00", "America/Sao_Paulo")?.toISOString()).toBe(
      "2026-09-10T17:00:00.000Z",
    );
    expect(calendarAt(Date.UTC(2026, 8, 10), "23:59", "Europe/Madrid")?.toISOString()).toBe(
      "2026-09-10T21:59:00.000Z",
    );
  });

  it("horário de parede do voo no fuso do aeroporto", () => {
    // Legado: "2026-11-18T22:45" digitado e gravado como UTC; Madri está em UTC+1
    const legacy = Date.UTC(2026, 10, 18, 22, 45);
    expect(wallClockToUtc(legacy, "Europe/Madrid")?.toISOString()).toBe("2026-11-18T21:45:00.000Z");
    expect(wallClockToUtc(Date.UTC(2026, 10, 19, 5, 20), "America/Sao_Paulo")?.toISOString()).toBe(
      "2026-11-19T08:20:00.000Z",
    );
  });
});

describe("pessoas", () => {
  it("normaliza e aponta problemas", () => {
    const n = normalizePerson({
      name: "  maria da silva  ",
      email: "Maria@Exemplo.COM ",
      phone: "(11) 99999-0000",
      cpf: "123",
      passwordHash: "123456",
    });
    expect(n.fields).toMatchObject({
      firstName: "maria",
      lastName: "da silva",
      email: "maria@exemplo.com",
      phone: "5511999990000",
      passwordHash: null,
    });
    expect(n.issues.map((i) => i.field)).toEqual(["cpf"]);
  });

  it("só aceita hash bcrypt como senha", () => {
    expect(isBcryptHash(HASH)).toBe(true);
    expect(isBcryptHash("52998224725")).toBe(false);
  });

  it("fusão preenche lacunas e preserva a conta do associado", () => {
    const assoc = normalizePerson({
      name: "Maria Souza",
      email: "m@x.com",
      isMember: true,
      passwordHash: HASH,
    }).fields;
    const pax = normalizePerson({
      name: "Maria S.",
      email: "m@x.com",
      cpf: "529.982.247-25",
      city: "Curitiba",
    }).fields;
    const merged = mergePerson(assoc, pax);
    expect(merged).toMatchObject({
      firstName: "Maria",
      lastName: "Souza",
      cpf: "52998224725",
      city: "Curitiba",
      isMember: true,
      passwordHash: HASH,
    });
  });

  it("deduplica por CPF, e-mail e telefone e respeita a chave já gravada", () => {
    const f = (name: string, extra: Record<string, string>) =>
      normalizePerson({ name, ...extra }).fields;
    const plan = planPeople(
      [
        { key: "a:Associate:1", fields: f("Ana Lima", { email: "ana@x.com" }) },
        { key: "a:Passenger:1", fields: f("Ana Lima", { email: "ANA@x.com", cpf: "52998224725" }) },
        { key: "a:Passenger:2", fields: f("Ana L", { cpf: "529.982.247-25" }) },
        { key: "a:Invite:1", fields: f("Bruno", { phone: "11 8888-7777" }) },
        { key: "a:Invite:2", fields: f("Bruno Costa", { phone: "+55 11 98888-7777" }) },
        { key: "a:Invite:3", fields: f("Carla", { email: "carla@x.com" }) },
      ],
      [{ id: "existente", cpf: "", email: "outra@x.com", phone: "", legacyKeys: ["a:Invite:3"] }],
      (key) => `novo-${key}`,
    );
    const id = (k: string) => plan.byKey.get(k);
    expect(id("a:Passenger:1")).toBe(id("a:Associate:1"));
    expect(id("a:Passenger:2")).toBe(id("a:Associate:1"));
    expect(id("a:Invite:2")).toBe(id("a:Invite:1"));
    expect(id("a:Invite:3")).toBe("existente");
    expect(plan.people).toHaveLength(3);
    expect(plan.merges.map((m) => m.reason)).toEqual(["EMAIL", "CPF", "PHONE"]);
  });

  it("mesmo e-mail com CPF diferente são pessoas diferentes", () => {
    const plan = planPeople(
      [
        {
          key: "k1",
          fields: normalizePerson({ name: "Mãe", email: "f@x.com", cpf: "52998224725" }).fields,
        },
        {
          key: "k2",
          fields: normalizePerson({ name: "Filha", email: "f@x.com", cpf: "11144477735" }).fields,
        },
      ],
      [],
      (k) => k,
    );
    expect(plan.people).toHaveLength(2);
  });
});

describe("hospedagem", () => {
  it("agrupa por número do quarto e separa quem não tem número", () => {
    const rooms = planRooms([
      { passengerId: "p1", roomNumber: "204", roomType: "DBL" },
      { passengerId: "p2", roomNumber: " 204", roomType: "TWIN" },
      { passengerId: "p3", roomNumber: "", roomType: "" },
      { passengerId: "p4", roomNumber: "", roomType: "Suíte" },
    ]);
    expect(rooms).toHaveLength(3);
    expect(rooms[0]).toMatchObject({ number: "204", type: "DOUBLE", passengerIds: ["p1", "p2"] });
    expect(rooms[0]!.conflictingLabels).toEqual(["TWIN"]);
    expect(rooms[1]).toMatchObject({ type: "SINGLE", typeLabel: "" });
    expect(rooms[2]).toMatchObject({ type: "SUITE", typeLabel: "Suíte" });
  });

  it("tipo pelo rótulo ou pela lotação", () => {
    expect(roomTypeFromLabel("Triplo", 1)).toBe("TRIPLE");
    expect(roomTypeFromLabel("Luxo vista mar", 2)).toBe("OTHER");
    expect(roomTypeFromLabel("", 4)).toBe("QUAD");
  });
});

describe("linha direta", () => {
  it("protocolo continua a sequência do ano", () => {
    expect(nextProtocolSeq(2026, ["VC-2026-000007", "VC-2025-000099", "X"])).toBe(8);
    expect(formatProtocol(2026, 8)).toBe("VC-2026-000008");
  });

  const base: LegacyTravelServices = {
    needsFlight: true,
    cabinClass: "EXECUTIVA",
    preferredAirline: "",
    checkedBaggage: true,
    seatPreference: "JANELA",
    loyaltyProgram: "",
    needsHotel: true,
    hotelCity: "Madrid",
    hotelCheckIn: new Date("2026-10-06T12:00:00Z"),
    hotelCheckOut: new Date("2026-10-07T12:00:00Z"),
    hotelCategory: "4",
    hotelRooms: 1,
    hotelRoomType: "DUPLO",
    hotelChain: "",
    hotelBreakfast: true,
    hotelReference: "",
    needsTransfer: false,
    needsCarRental: false,
    carCategory: "",
    carPickup: "",
    carDropoff: "",
    carExtraDriver: false,
    needsChauffeur: true,
    transferNotes: "Motorista bilíngue",
    needsInsurance: false,
    needsCurrency: false,
    currencyNotes: "",
    needsVisa: false,
    visaNotes: "",
    needsConnectivity: false,
    needsEventTicket: false,
    eventName: "",
  };

  it("blocos de serviço validados pelo esquema novo", () => {
    const r = convertTravelServices(base);
    expect(r.requested).toEqual(["AIR", "HOTEL", "CHAUFFEUR"]);
    expect(r.details).toMatchObject({
      AIR: { cabin: "BUSINESS", seatPreference: "WINDOW" },
      HOTEL: { stars: "4", roomType: "DOUBLE" },
      CHAUFFEUR: { notes: "Motorista bilíngue" },
    });
    expect(r.unknownValues).toEqual([]);
  });

  it("valor desconhecido cai no padrão e é avisado", () => {
    const r = convertTravelServices({ ...base, cabinClass: "LUXO" });
    expect(r.details).toMatchObject({ AIR: { cabin: "ECONOMY" } });
    expect(r.unknownValues).toEqual(["classe: LUXO"]);
  });
});

describe("modelos de mensagem", () => {
  it("troca os campos do legado pelos do catálogo novo", () => {
    const r = convertPlaceholders(
      "Olá {{ nome }}, {{evento}} em {{data}} às {{hora}}: {{link}} {{brinde}}",
    );
    expect(r.text).toBe(
      "Olá {{nome}}, {{projeto}} em {{data_inicio}} às {{hora_inicio}}: {{link_cracha}} {{brinde}}",
    );
    expect(r.unknown).toEqual(["brinde"]);
  });
});
