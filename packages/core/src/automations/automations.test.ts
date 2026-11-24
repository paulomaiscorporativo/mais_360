import { describe, expect, it } from "vitest";
import {
  automationEventJobKey,
  automationReason,
  automationRunJobKey,
  dispatchBlock,
  DUE_TOLERANCE_MS,
  eventDispatchable,
  flightOccurrence,
  formatPendencies,
  isDue,
  matchesAutomationFilter,
  nextOccurrence,
  passportPendency,
  projectOccurrences,
  quotaHasRoom,
  readAutomationFilter,
  scheduleChanged,
  travelerPendingDocuments,
  wallTimeToUtc,
  type AutomationSchedule,
} from "./index";
import { transactionalKey } from "../messaging/dedupe";

const BRT = "America/Sao_Paulo";
const LIS = "Europe/Lisbon";
const NY = "America/New_York";
const H = 3_600_000;
const D = 86_400_000;

const base: AutomationSchedule = {
  trigger: "DAYS_BEFORE_START",
  offsetDays: 1,
  offsetHours: 0,
  sendAt: "09:00",
  repeatEveryDays: 0,
  maxSends: 1,
};

describe("horário de parede no fuso", () => {
  it("09:00 em São Paulo é 12:00 UTC", () => {
    const at = wallTimeToUtc({ year: 2026, month: 11, day: 23, hour: 9, minute: 0 }, BRT);
    expect(at.toISOString()).toBe("2026-11-23T12:00:00.000Z");
  });

  it("Lisboa no verão (+1) e no inverno (+0)", () => {
    expect(
      wallTimeToUtc({ year: 2027, month: 7, day: 1, hour: 9, minute: 0 }, LIS).toISOString(),
    ).toBe("2027-07-01T08:00:00.000Z");
    expect(
      wallTimeToUtc({ year: 2027, month: 1, day: 10, hour: 9, minute: 0 }, LIS).toISOString(),
    ).toBe("2027-01-10T09:00:00.000Z");
  });

  it("horário inexistente (relógio adianta) vai para depois do salto", () => {
    // Nova York, 08/03/2026: 02:00 → 03:00. 02:30 não existe; vira 03:30 EDT (07:30 UTC)
    const at = wallTimeToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, NY);
    expect(at.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("horário repetido (relógio volta) usa a primeira ocorrência", () => {
    // Nova York, 01/11/2026: 01:30 acontece duas vezes; a primeira é EDT (05:30 UTC)
    const at = wallTimeToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, NY);
    expect(at.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe("ocorrências por data", () => {
  // Evento às 19:30 de 24/11/2026 em São Paulo
  const startsAt = new Date("2026-11-24T22:30:00Z");
  const dates = { timeZone: BRT, startsAt, endsAt: new Date("2026-11-25T03:00:00Z") };

  it("D-1 às 09:00 no fuso do projeto", () => {
    const [o] = projectOccurrences(base, dates);
    expect(o?.at.toISOString()).toBe("2026-11-23T12:00:00.000Z");
    expect(o?.key).toBe("d2026-11-23");
    expect(o?.windowEnd.getTime()).toBe(o!.at.getTime() + DUE_TOLERANCE_MS);
  });

  it("usa o dia de calendário do fuso, não o de UTC", () => {
    // 22:30 UTC de 24/11 ainda é 24/11 em SP; em UTC seria o mesmo, mas 02:00 UTC de 25/11 é 24/11 em SP
    const late = { ...dates, startsAt: new Date("2026-11-25T02:00:00Z") };
    const [o] = projectOccurrences(base, late);
    expect(o?.at.toISOString()).toBe("2026-11-23T12:00:00.000Z");
  });

  it("D-7 atravessando a mudança de horário de Lisboa", () => {
    // Viagem começa 01/04/2027 10:00 em Lisboa (+1); D-7 = 25/03 às 09:00 (+0)
    const trip = { timeZone: LIS, startsAt: new Date("2027-04-01T09:00:00Z"), endsAt: null };
    const [o] = projectOccurrences({ ...base, offsetDays: 7 }, trip);
    expect(o?.at.toISOString()).toBe("2027-03-25T09:00:00.000Z");
  });

  it("no dia do início não passa do próprio início", () => {
    const [o] = projectOccurrences({ ...base, offsetDays: 0, sendAt: "18:00" }, dates);
    // 18:00 SP = 21:00 UTC; o evento começa 22:30 UTC: janela fecha no início
    expect(o?.windowEnd.toISOString()).toBe(startsAt.toISOString());
  });

  it("pós-evento usa o término (ou o início, sem término)", () => {
    const [o] = projectOccurrences({ ...base, trigger: "DAYS_AFTER_END", offsetDays: 2 }, dates);
    // término 25/11 00:00 em SP → +2 = 27/11 09:00
    expect(o?.at.toISOString()).toBe("2026-11-27T12:00:00.000Z");
    const [s] = projectOccurrences(
      { ...base, trigger: "DAYS_AFTER_END", offsetDays: 1 },
      { ...dates, endsAt: null },
    );
    expect(s?.at.toISOString()).toBe("2026-11-25T12:00:00.000Z");
  });

  it("data-limite das cotas", () => {
    const occ = projectOccurrences(
      { ...base, trigger: "INVITE_DEADLINE_BEFORE", offsetDays: 3 },
      { ...dates, inviteDeadline: new Date("2026-11-10T15:00:00Z") },
    );
    expect(occ[0]?.at.toISOString()).toBe("2026-11-07T12:00:00.000Z");
    expect(projectOccurrences({ ...base, trigger: "INVITE_DEADLINE_BEFORE" }, dates)).toEqual([]);
  });

  it("sem data no projeto não há disparo", () => {
    expect(projectOccurrences(base, { timeZone: BRT, startsAt: null, endsAt: null })).toEqual([]);
  });

  it("gatilhos de evento e de voo não têm ocorrência de projeto", () => {
    expect(projectOccurrences({ ...base, trigger: "CHECKED_IN" }, dates)).toEqual([]);
    expect(projectOccurrences({ ...base, trigger: "FLIGHT_DEPARTURE_BEFORE" }, dates)).toEqual([]);
  });
});

describe("lembretes que repetem até resolver", () => {
  const trip = {
    timeZone: LIS,
    startsAt: new Date("2027-04-10T09:00:00Z"),
    endsAt: new Date("2027-04-17T20:00:00Z"),
  };
  const docs: AutomationSchedule = {
    ...base,
    trigger: "DOCUMENTS_PENDING",
    offsetDays: 30,
    repeatEveryDays: 7,
    maxSends: 3,
  };

  it("semanal a partir de D-30, com teto de envios", () => {
    const occ = projectOccurrences(docs, trip);
    expect(occ.map((o) => o.key)).toEqual(["r2027-03-11:1", "r2027-03-11:2", "r2027-03-11:3"]);
    // 11/03 09:00 em Lisboa (+0) e 25/03 09:00 (+0); 18/03 também +0
    expect(occ.map((o) => o.at.toISOString())).toEqual([
      "2027-03-11T09:00:00.000Z",
      "2027-03-18T09:00:00.000Z",
      "2027-03-25T09:00:00.000Z",
    ]);
  });

  it("para no embarque mesmo sem atingir o teto", () => {
    const occ = projectOccurrences({ ...docs, offsetDays: 10, maxSends: 10 }, trip);
    // 31/03 e 07/04 (+1 → 08:00 UTC); 14/04 já é depois do início
    expect(occ.map((o) => o.at.toISOString())).toEqual([
      "2027-03-31T08:00:00.000Z",
      "2027-04-07T08:00:00.000Z",
    ]);
  });

  it("sem repetição, um envio só", () => {
    const occ = projectOccurrences({ ...docs, repeatEveryDays: 0, maxSends: 5 }, trip);
    expect(occ).toHaveLength(1);
  });
});

describe("voos", () => {
  const flight = { id: "f1", departureAt: new Date("2026-12-01T00:40:00Z") };

  it("X horas antes da partida, com janela até a partida", () => {
    const o = flightOccurrence({ offsetDays: 0, offsetHours: 24 }, flight);
    expect(o.at.toISOString()).toBe("2026-11-30T00:40:00.000Z");
    expect(o.windowEnd.toISOString()).toBe("2026-11-30T06:40:00.000Z");
    const close = flightOccurrence({ offsetDays: 0, offsetHours: 3 }, flight);
    expect(close.windowEnd.toISOString()).toBe(flight.departureAt.toISOString());
  });

  it("a chave muda se o voo for remarcado", () => {
    const a = flightOccurrence({ offsetDays: 0, offsetHours: 24 }, flight);
    const b = flightOccurrence(
      { offsetDays: 0, offsetHours: 24 },
      { ...flight, departureAt: new Date("2026-12-02T00:40:00Z") },
    );
    expect(a.key).not.toBe(b.key);
  });
});

describe("devida agora e anti-avalanche", () => {
  const startsAt = new Date("2026-11-24T22:30:00Z");
  const [o] = projectOccurrences(base, { timeZone: BRT, startsAt, endsAt: null });
  const at = o!.at;
  const long = new Date("2026-01-01T00:00:00Z");

  it("dispara a partir do instante e até a tolerância", () => {
    expect(isDue(o!, new Date(at.getTime() - 60_000), long)).toBe(false);
    expect(isDue(o!, at, long)).toBe(true);
    expect(isDue(o!, new Date(at.getTime() + 5 * H), long)).toBe(true);
    expect(isDue(o!, new Date(at.getTime() + 6 * H), long)).toBe(false);
  });

  it("régua ligada pouco depois do instante ainda envia (tolerância curta)", () => {
    const activated = new Date(at.getTime() + 2 * H);
    expect(isDue(o!, new Date(at.getTime() + 2 * H + 60_000), activated)).toBe(true);
  });

  it("régua ligada muito depois não envia o que passou", () => {
    const activated = new Date(at.getTime() + 7 * H);
    expect(isDue(o!, new Date(at.getTime() + 7 * H), activated)).toBe(false);
  });

  it("próximo disparo ignora o que já fechou", () => {
    expect(nextOccurrence([o!], new Date(at.getTime() - D))?.key).toBe(o!.key);
    expect(nextOccurrence([o!], new Date(at.getTime() + H))?.key).toBe(o!.key);
    expect(nextOccurrence([o!], new Date(at.getTime() + 7 * H))).toBeNull();
  });

  it("gatilho por evento respeita ativação e idade do acontecimento", () => {
    const ev = new Date("2026-11-23T12:00:00Z");
    expect(eventDispatchable("CHECKED_IN", ev, ev, long)).toEqual({ ok: true });
    expect(
      eventDispatchable("REGISTRATION_CONFIRMED", ev, ev, new Date(ev.getTime() + 7 * H)),
    ).toEqual({ ok: false, reason: "ACTIVATED_LATER" });
    expect(eventDispatchable("CHECKED_IN", ev, new Date(ev.getTime() + 7 * H), long)).toEqual({
      ok: false,
      reason: "TOO_OLD",
    });
    expect(eventDispatchable("REGISTRATION_CREATED", ev, new Date(ev.getTime() + D), long)).toEqual(
      { ok: true },
    );
  });

  it("renova a ativação ao ligar ou reagendar, não ao trocar só o texto", () => {
    const on = { ...base, active: true };
    expect(scheduleChanged(null, on)).toBe(true);
    expect(scheduleChanged({ ...on, active: false }, on)).toBe(true);
    expect(scheduleChanged(on, { ...on })).toBe(false);
    expect(scheduleChanged(on, { ...on, offsetDays: 2 })).toBe(true);
    expect(scheduleChanged(on, { ...on, active: false })).toBe(false);
  });
});

describe("filtro da régua", () => {
  const reg = { role: "ATTENDEE", status: "CONFIRMED", categoryId: "vip" };

  it("sem filtro: todos menos cancelados e recusados", () => {
    expect(matchesAutomationFilter(reg, "DAYS_BEFORE_START", {})).toBe(true);
    for (const status of ["CANCELED", "DECLINED"])
      expect(matchesAutomationFilter({ ...reg, status }, "DAYS_BEFORE_START", {})).toBe(false);
  });

  it("papéis, situações e categorias", () => {
    expect(matchesAutomationFilter(reg, "DAYS_BEFORE_START", { roles: ["TRAVELER"] })).toBe(false);
    expect(matchesAutomationFilter(reg, "DAYS_BEFORE_START", { statuses: ["PENDING"] })).toBe(
      false,
    );
    expect(matchesAutomationFilter(reg, "DAYS_BEFORE_START", { categoryIds: ["vip"] })).toBe(true);
    expect(
      matchesAutomationFilter({ ...reg, categoryId: null }, "DAYS_BEFORE_START", {
        categoryIds: ["vip"],
      }),
    ).toBe(false);
  });

  it("cancelado nunca recebe, mesmo se escolhido", () => {
    expect(
      matchesAutomationFilter({ ...reg, status: "CANCELED" }, "DAYS_BEFORE_START", {
        statuses: ["CANCELED"],
      }),
    ).toBe(false);
  });

  it("lê Json antigo descartando valores desconhecidos", () => {
    expect(readAutomationFilter(null)).toEqual({});
    expect(readAutomationFilter({ roles: ["TRAVELER", "XX"], statuses: "x" })).toEqual({
      roles: ["TRAVELER"],
      statuses: undefined,
      categoryIds: undefined,
    });
  });
});

describe("pendências de viagem", () => {
  const now = new Date("2027-01-10T12:00:00Z");
  const tripEnd = new Date("2027-04-17T20:00:00Z");
  const doc = (kind: "PASSPORT" | "VISA", expiresAt: string | null) => ({
    id: kind,
    kind,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    createdAt: new Date("2026-12-01T00:00:00Z"),
  });

  it("passaporte ausente, vencendo antes de 6 meses da volta, ou em dia", () => {
    const s = { required: ["PASSPORT" as const], uploaded: [], tripEnd };
    expect(passportPendency(s, now)?.status).toBe("MISSING");
    expect(
      passportPendency({ ...s, uploaded: [doc("PASSPORT", "2027-08-01T12:00:00Z")] }, now)?.status,
    ).toBe("EXPIRING");
    expect(
      passportPendency({ ...s, uploaded: [doc("PASSPORT", "2030-01-01T12:00:00Z")] }, now),
    ).toBeNull();
  });

  it("passaporte digitado no cadastro conta como enviado", () => {
    const s = {
      required: ["PASSPORT" as const],
      uploaded: [],
      tripEnd,
      passportNumber: "FX123",
      passportExpiry: new Date("2031-01-01T12:00:00Z"),
    };
    expect(passportPendency(s, now)).toBeNull();
  });

  it("passaporte não exigido não gera pendência", () => {
    expect(passportPendency({ required: ["RG"], uploaded: [], tripEnd }, now)).toBeNull();
  });

  it("lista as pendências com rótulo legível", () => {
    const list = travelerPendingDocuments(
      {
        required: ["PASSPORT", "VISA"],
        uploaded: [doc("VISA", "2026-12-31T12:00:00Z")],
        tripEnd,
      },
      now,
    );
    expect(list.map((p) => p.status)).toEqual(["MISSING", "EXPIRED"]);
    expect(formatPendencies(list)).toBe("• Passaporte: falta enviar\n• Visto: vencido");
  });

  it("cota com espaço e não travada", () => {
    expect(quotaHasRoom({ quota: 4, used: 2, lockedAt: null })).toBe(true);
    expect(quotaHasRoom({ quota: 4, used: 4, lockedAt: null })).toBe(false);
    expect(quotaHasRoom({ quota: 4, used: 0, lockedAt: now })).toBe(false);
  });
});

describe("quem pode disparar e chaves", () => {
  const ok = {
    project: { archivedAt: null, status: "IN_PROGRESS" },
    tenant: { status: "ACTIVE" },
    workspace: { status: "ACTIVE" },
  };

  it("bloqueia projeto arquivado, cliente inativo e assinante suspenso/cancelado", () => {
    expect(dispatchBlock(ok)).toBeNull();
    expect(dispatchBlock({ ...ok, workspace: { status: "PAST_DUE" } })).toBeNull();
    expect(dispatchBlock({ ...ok, workspace: { status: "TRIAL" } })).toBeNull();
    expect(dispatchBlock({ ...ok, project: { archivedAt: new Date(), status: "COMPLETED" } })).toBe(
      "PROJECT_ARCHIVED",
    );
    expect(dispatchBlock({ ...ok, project: { archivedAt: null, status: "ARCHIVED" } })).toBe(
      "PROJECT_ARCHIVED",
    );
    expect(dispatchBlock({ ...ok, tenant: { status: "SUSPENDED" } })).toBe("TENANT_INACTIVE");
    expect(dispatchBlock({ ...ok, workspace: { status: "SUSPENDED" } })).toBe(
      "WORKSPACE_SUSPENDED",
    );
    expect(dispatchBlock({ ...ok, workspace: { status: "CANCELED" } })).toBe("WORKSPACE_CANCELED");
  });

  it("chave de envio estável por régua, inscrição, canal e ocorrência", () => {
    const k = transactionalKey(automationReason("a1"), "r1", "EMAIL", "d2026-11-23");
    expect(k).toBe("t:automation:a1:r1:EMAIL:d2026-11-23");
    expect(automationRunJobKey("a1", "d2026-11-23")).toBe("automation:a1:d2026-11-23");
    expect(automationEventJobKey("CHECKED_IN", "r1")).toBe("automation-event:CHECKED_IN:r1");
  });
});
