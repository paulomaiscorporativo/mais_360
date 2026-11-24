import type { PrismaClient } from "@mais/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  automationNextRun,
  automationStats,
  enqueueAutomationEvents,
  previewAutomationAudience,
  processAutomationEvent,
  processAutomationRun,
  runAutomationNow,
  sweepAutomations,
  type AutomationRunPayload,
} from "./automations";
import { QUEUES } from "./jobs";
import { processDeliverySend, type DeliverySendPayload } from "./processor";
import { FakeOutbox, resetDb, seedEvent, testDb, testDeps } from "./testing/fixtures";

const db = testDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const H = 3_600_000;
const LONG_AGO = new Date("2026-01-01T00:00:00Z");
// Evento 24/11/2026 19:30 em São Paulo → D-1 09:00 = 23/11 12:00 UTC
const STARTS = new Date("2026-11-24T22:30:00Z");
const D1 = new Date("2026-11-23T12:00:00Z");

async function template(db: PrismaClient, tenantId: string, body = "Olá, {{primeiro_nome}}!") {
  return db.messageTemplate.create({
    data: {
      tenantId,
      name: "Régua",
      emailSubject: "{{projeto}}",
      emailBody: body,
      whatsappBody: body,
    },
  });
}

async function automation(
  db: PrismaClient,
  s: { tenantId: string; projectId: string },
  data: {
    trigger: Parameters<PrismaClient["messageAutomation"]["create"]>[0]["data"]["trigger"];
    offsetDays?: number;
    offsetHours?: number;
    repeatEveryDays?: number;
    maxSends?: number;
    channels?: ("EMAIL" | "WHATSAPP")[];
    filter?: object;
    activatedAt?: Date;
    body?: string;
  },
) {
  const t = await template(db, s.tenantId, data.body);
  return db.messageAutomation.create({
    data: {
      tenantId: s.tenantId,
      projectId: s.projectId,
      templateId: t.id,
      trigger: data.trigger,
      offsetDays: data.offsetDays ?? 0,
      offsetHours: data.offsetHours ?? 0,
      repeatEveryDays: data.repeatEveryDays ?? 0,
      maxSends: data.maxSends ?? 1,
      sendAt: "09:00",
      channels: data.channels ?? ["EMAIL"],
      filter: data.filter ?? {},
      activatedAt: data.activatedAt ?? LONG_AGO,
    },
  });
}

async function jobs(queue: string) {
  return db.job.findMany({ where: { queue }, orderBy: { createdAt: "asc" } });
}

async function runPendingRuns(now: Date) {
  const out = [];
  for (const j of await jobs(QUEUES.automationRun))
    out.push(await processAutomationRun(db, j.payload as AutomationRunPayload, now));
  return out;
}

describe("réguas por evento", () => {
  it("só enfileira com régua ativa do gatilho; envia uma vez por inscrição", async () => {
    const s = await seedEvent(db, 2, { startsAt: STARTS });
    const now = new Date("2026-11-20T15:00:00Z");
    const scope = { tenantId: s.tenantId, projectId: s.projectId };

    expect(
      await enqueueAutomationEvents(db, {
        ...scope,
        trigger: "REGISTRATION_CONFIRMED",
        registrationIds: s.registrationIds,
        at: now,
      }),
    ).toBe(0);

    const a = await automation(db, scope, { trigger: "REGISTRATION_CONFIRMED" });
    // Lote com repetição: um job por inscrição
    await enqueueAutomationEvents(db, {
      ...scope,
      trigger: "REGISTRATION_CONFIRMED",
      registrationIds: [...s.registrationIds, s.registrationIds[0]!],
      at: now,
    });
    const queued = await jobs(QUEUES.automationEvent);
    expect(queued).toHaveLength(2);

    for (const j of queued) {
      const r = await processAutomationEvent(db, j.payload, now);
      expect(r).toMatchObject({ queued: 1, skipped: 0 });
    }
    // Reprocessar não duplica
    const again = await processAutomationEvent(db, queued[0]!.payload, now);
    expect(again).toMatchObject({ queued: 0, duplicate: 1 });

    const deliveries = await db.messageDelivery.findMany({ where: { automationId: a.id } });
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0]!.dedupeKey).toMatch(/^t:automation:.+:EMAIL$/);

    // O envio de fato renderiza o modelo da régua
    const outbox = new FakeOutbox();
    for (const j of await jobs(QUEUES.deliverySend))
      await processDeliverySend(db, j.payload as DeliverySendPayload, testDeps(outbox, now));
    expect(outbox.sent).toHaveLength(2);
    expect(outbox.sent[0]!.text).toContain("Olá, Pessoa");
    expect((await automationStats(db, s.tenantId, [a.id])).get(a.id)).toMatchObject({ sent: 2 });
  });

  it("régua ligada depois do acontecimento não dispara retroativamente", async () => {
    const s = await seedEvent(db, 1, { startsAt: STARTS });
    const at = new Date("2026-11-20T15:00:00Z");
    const scope = { tenantId: s.tenantId, projectId: s.projectId };
    await automation(db, scope, {
      trigger: "CHECKED_IN",
      activatedAt: new Date(at.getTime() + 7 * H),
    });
    const r = await processAutomationEvent(
      db,
      { ...scope, registrationId: s.registrationIds[0]!, trigger: "CHECKED_IN", at },
      new Date(at.getTime() + 8 * H),
    );
    expect(r.queued).toBe(0);
  });

  it("assinante suspenso não dispara", async () => {
    const s = await seedEvent(db, 1, { startsAt: STARTS });
    const scope = { tenantId: s.tenantId, projectId: s.projectId };
    await automation(db, scope, { trigger: "REGISTRATION_CREATED" });
    const p = await db.project.findUniqueOrThrow({
      where: { id: s.projectId },
      select: { tenant: { select: { workspaceId: true } } },
    });
    await db.workspace.update({
      where: { id: p.tenant.workspaceId },
      data: { status: "SUSPENDED" },
    });
    const now = new Date();
    const r = await processAutomationEvent(
      db,
      { ...scope, registrationId: s.registrationIds[0]!, trigger: "REGISTRATION_CREATED", at: now },
      now,
    );
    expect(r.blocked).toContain("suspenso");
  });
});

describe("réguas por data", () => {
  it("D-1: a varredura enfileira uma vez; processar de novo não duplica", async () => {
    const s = await seedEvent(db, 3, { startsAt: STARTS });
    const a = await automation(db, s, { trigger: "DAYS_BEFORE_START", offsetDays: 1 });

    expect(await sweepAutomations(db, new Date(D1.getTime() - 60_000))).toBe(0);
    const now = new Date(D1.getTime() + 5 * 60_000);
    expect(await sweepAutomations(db, now)).toBe(1);
    expect(await sweepAutomations(db, now)).toBe(0);

    const [first] = await runPendingRuns(now);
    expect(first).toMatchObject({ considered: 3, queued: 3 });
    // Mesmo que o job fosse reprocessado, a dedupeKey impede o segundo envio
    const [second] = await runPendingRuns(now);
    expect(second).toMatchObject({ queued: 0, duplicate: 3 });
    // E concluído não volta para a fila na varredura seguinte
    await db.job.updateMany({ where: { queue: QUEUES.automationRun }, data: { status: "DONE" } });
    expect(await sweepAutomations(db, new Date(now.getTime() + 10 * 60_000))).toBe(0);
    const keys = (await db.messageDelivery.findMany({ where: { automationId: a.id } })).map(
      (d) => d.dedupeKey,
    );
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).toMatch(/:EMAIL:d2026-11-23$/);
  });

  it("anti-avalanche: régua criada horas depois do instante não envia", async () => {
    const s = await seedEvent(db, 2, { startsAt: STARTS });
    const now = new Date(D1.getTime() + 7 * H);
    await automation(db, s, { trigger: "DAYS_BEFORE_START", offsetDays: 1, activatedAt: now });
    expect(await sweepAutomations(db, now)).toBe(0);
  });

  it("projeto arquivado não dispara", async () => {
    const s = await seedEvent(db, 1, { startsAt: STARTS });
    await automation(db, s, { trigger: "DAYS_BEFORE_START", offsetDays: 1 });
    await db.project.update({ where: { id: s.projectId }, data: { archivedAt: new Date() } });
    expect(await sweepAutomations(db, new Date(D1.getTime() + 60_000))).toBe(0);
  });

  it("filtro, falta de contato e recusa de WhatsApp viram entregas puladas", async () => {
    const s = await seedEvent(db, 3, { startsAt: STARTS });
    const [r0, r1, r2] = s.registrationIds as [string, string, string];
    await db.registration.update({ where: { id: r2 }, data: { status: "DECLINED" } });
    const reg1 = await db.registration.findUniqueOrThrow({ where: { id: r1 } });
    await db.consent.create({
      data: { tenantId: s.tenantId, personId: reg1.personId, purpose: "WHATSAPP", granted: false },
    });
    const reg0 = await db.registration.findUniqueOrThrow({ where: { id: r0 } });
    await db.person.update({ where: { id: reg0.personId }, data: { email: "" } });
    const a = await automation(db, s, {
      trigger: "DAYS_BEFORE_START",
      offsetDays: 1,
      channels: ["EMAIL", "WHATSAPP"],
    });
    const now = new Date(D1.getTime() + 60_000);
    await sweepAutomations(db, now);
    const [r] = await runPendingRuns(now);
    // r2 recusou: fora; r0 sem e-mail; r1 recusou WhatsApp
    expect(r).toMatchObject({ considered: 2, queued: 2, skipped: 2 });
    const skipped = await db.messageDelivery.findMany({
      where: { automationId: a.id, status: "SKIPPED" },
      orderBy: { error: "asc" },
    });
    expect(skipped.map((d) => d.error)).toEqual([
      "Não autorizou mensagens por WhatsApp",
      "Sem e-mail cadastrado",
    ]);
    expect((await automationStats(db, s.tenantId, [a.id])).get(a.id)).toMatchObject({
      queued: 2,
      skipped: 2,
    });
  });

  it("próximo disparo, prévia da audiência e antecipação", async () => {
    const s = await seedEvent(db, 2, { startsAt: STARTS });
    const a = await automation(db, s, { trigger: "DAYS_BEFORE_START", offsetDays: 1 });
    const before = new Date("2026-11-20T12:00:00Z");
    const next = await automationNextRun(db, a, before);
    expect(next).toMatchObject({ kind: "scheduled", key: "d2026-11-23" });
    if (next.kind === "scheduled") expect(next.at.toISOString()).toBe(D1.toISOString());

    const preview = await previewAutomationAudience(db, s.tenantId, a.id, before);
    expect(preview).toMatchObject({ total: 2, withoutContact: 0, alreadySent: 0 });

    const run = await runAutomationNow(db, s.tenantId, a.id, before);
    expect(run).toMatchObject({ ok: true, occurrenceKey: "d2026-11-23" });
    expect(await runAutomationNow(db, s.tenantId, a.id, before)).toMatchObject({ ok: false });
    await runPendingRuns(before);
    expect(await previewAutomationAudience(db, s.tenantId, a.id, before)).toMatchObject({
      alreadySent: 2,
    });
    // O horário previsto não envia de novo: o job da ocorrência já existe
    expect(await sweepAutomations(db, new Date(D1.getTime() + 60_000))).toBe(0);
  });
});

describe("réguas de viagem", () => {
  async function trip(n: number) {
    const s = await seedEvent(db, n, { startsAt: new Date("2027-04-10T09:00:00Z") });
    await db.project.update({
      where: { id: s.projectId },
      data: {
        type: "INCENTIVE_TRIP",
        timezone: "Europe/Lisbon",
        endsAt: new Date("2027-04-17T20:00:00Z"),
        settings: { travel: { requiredDocuments: ["PASSPORT"] } },
      },
    });
    return s;
  }

  it("lembrete de voo X horas antes, com os dados do voo na mensagem", async () => {
    const s = await trip(2);
    await db.airport.upsert({
      where: { iata: "GRU" },
      create: { iata: "GRU", name: "Guarulhos", timezone: "America/Sao_Paulo" },
      update: {},
    });
    const departureAt = new Date("2027-04-10T00:40:00Z"); // 21:40 de 09/04 em SP
    const flight = await db.flight.create({
      data: {
        tenantId: s.tenantId,
        projectId: s.projectId,
        airlineCode: "TP",
        flightNumber: "TP88",
        originIata: "GRU",
        destIata: "LIS",
        departureAt,
        defaultLocator: "XPTO12",
        passengers: { create: [{ registrationId: s.registrationIds[0]! }] },
      },
    });
    await automation(db, s, {
      trigger: "FLIGHT_DEPARTURE_BEFORE",
      offsetHours: 24,
      body: "Voo {{voo_numero}} ({{voo_trecho}}) parte {{voo_partida}}. Localizador {{voo_localizador}}.",
    });
    const now = new Date(departureAt.getTime() - 24 * H + 60_000);
    expect(await sweepAutomations(db, new Date(departureAt.getTime() - 25 * H))).toBe(0);
    expect(await sweepAutomations(db, now)).toBe(1);
    const [r] = await runPendingRuns(now);
    expect(r).toMatchObject({ considered: 1, queued: 1 });

    const outbox = new FakeOutbox();
    for (const j of await jobs(QUEUES.deliverySend))
      await processDeliverySend(db, j.payload as DeliverySendPayload, testDeps(outbox, now));
    expect(outbox.sent[0]!.text).toContain(
      "Voo TP 88 (GRU → LIS) parte 09/04/2027 às 21:40. Localizador XPTO12.",
    );
    void flight;
  });

  it("documentos pendentes: só quem tem pendência, repetindo até o teto", async () => {
    const s = await trip(2);
    const ok = await db.registration.findUniqueOrThrow({ where: { id: s.registrationIds[1]! } });
    await db.person.update({
      where: { id: ok.personId },
      data: { passportNumber: "FX1", passportExpiry: new Date("2032-01-01T12:00:00Z") },
    });
    const a = await automation(db, s, {
      trigger: "DOCUMENTS_PENDING",
      offsetDays: 30,
      repeatEveryDays: 7,
      maxSends: 2,
      body: "Falta: {{pendencias}}",
    });
    // 1ª: 11/03/2027 09:00 em Lisboa (+0); 2ª: 18/03
    const first = new Date("2027-03-11T09:01:00Z");
    expect(await sweepAutomations(db, first)).toBe(1);
    expect((await runPendingRuns(first))[0]).toMatchObject({ considered: 1, queued: 1 });
    const second = new Date("2027-03-18T09:01:00Z");
    expect(await sweepAutomations(db, second)).toBe(1);
    expect(await sweepAutomations(db, new Date("2027-03-25T09:01:00Z"))).toBe(0);
    const deliveries = await db.messageDelivery.findMany({ where: { automationId: a.id } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.registrationId).toBe(s.registrationIds[0]);

    const outbox = new FakeOutbox();
    for (const j of await jobs(QUEUES.deliverySend))
      await processDeliverySend(db, j.payload as DeliverySendPayload, testDeps(outbox, first));
    expect(outbox.sent[0]!.text).toContain("Passaporte: falta enviar");
  });
});
