import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  campaignSummary,
} from "./campaigns";
import { enqueueJob } from "./jobs";
import { claimNextDelivery, processCampaignTick, recoverStaleDeliveries } from "./processor";
import { sendTransactional } from "./transactional";
import { applyStatusUpdates, parseEvolutionWebhook } from "./webhooks";
import { realProviders } from "./providers";
import { defaultDeps } from "./processor";
import {
  FakeOutbox,
  INSIDE_WINDOW,
  resetDb,
  seedEvent,
  testDb,
  testDeps,
} from "./testing/fixtures";

const db = testDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const tpl = {
  name: "Lembrete",
  emailSubject: "Faltam {{dias_restantes}} dias para o {{projeto}}",
  emailBody: "Olá, **{{primeiro_nome}}**!\n\nNos vemos em {{local}}.",
  whatsappBody: "Olá, **{{primeiro_nome}}**! Faltam {{dias_restantes}} dias.",
  includeActions: true,
};

const fastPacing = {
  preset: "personalizado" as const,
  intervalMinS: 10,
  intervalMaxS: 10,
  batchSize: 100,
  dailyLimit: 1000,
};

async function newWhatsappCampaign(
  seed: Awaited<ReturnType<typeof seedEvent>>,
  pacing: object = fastPacing,
) {
  const r = await createCampaign(db, {
    tenantId: seed.tenantId,
    projectId: seed.projectId,
    channel: "WHATSAPP",
    template: tpl,
    audience: { kind: "registrations" },
    pacing,
  });
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

describe("concorrência — o incidente das mensagens triplicadas", () => {
  it("dois workers processando a mesma campanha ao mesmo tempo nunca enviam a mesma entrega", async () => {
    const seed = await seedEvent(db, 30);
    const { campaignId, total } = await newWhatsappCampaign(seed);
    expect(total).toBe(30);

    const outbox = new FakeOutbox();
    outbox.latencyMs = 15; // alarga a janela de corrida
    const workerA = testDeps(outbox, INSIDE_WINDOW, { workerId: "A" });
    const workerB = testDeps(outbox, INSIDE_WINDOW, { workerId: "B" });
    const worker3 = testDeps(outbox, INSIDE_WINDOW, { workerId: "C" });

    // Cada "worker" ignora o reagendamento e martela o tick — pior caso possível
    const hammer = async (deps: typeof workerA) => {
      for (let i = 0; i < 40; i++) await processCampaignTick(db, campaignId, deps);
    };
    await Promise.all([hammer(workerA), hammer(workerB), hammer(worker3)]);

    expect(outbox.sent).toHaveLength(30);
    for (const phone of seed.phones) expect(outbox.countTo(phone), phone).toBe(1);

    const summary = await campaignSummary(db, { tenantId: seed.tenantId, campaignId });
    expect(summary?.status).toBe("COMPLETED");
    expect(summary?.counts.SENT).toBe(30);
    const c = await db.messageCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(c.sent).toBe(30);
  });

  it("claim com SKIP LOCKED: chamadas simultâneas recebem entregas diferentes", async () => {
    const seed = await seedEvent(db, 20);
    const { campaignId } = await newWhatsappCampaign(seed);
    const claims = await Promise.all(
      Array.from({ length: 20 }, (_, i) => claimNextDelivery(db, campaignId, `w${i}`)),
    );
    const ids = claims.map((c) => c?.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(20);
    expect(await claimNextDelivery(db, campaignId, "late")).toBeNull();
  });

  it("a mesma campanha não pode ser criada com o mesmo destinatário duas vezes (dedupeKey)", async () => {
    const seed = await seedEvent(db, 1);
    const { campaignId } = await newWhatsappCampaign(seed);
    const d = await db.messageDelivery.findFirstOrThrow({ where: { campaignId } });
    await expect(
      db.messageDelivery.create({
        data: {
          tenantId: seed.tenantId,
          campaignId,
          channel: "WHATSAPP",
          target: d.target,
          dedupeKey: d.dedupeKey,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("janela de horário no fuso do evento", () => {
  it("às 05:00 de Brasília (08:00 UTC) não envia e agenda para 08:00 de Brasília", async () => {
    const seed = await seedEvent(db, 3);
    const { campaignId } = await newWhatsappCampaign(seed);
    const outbox = new FakeOutbox();
    const out = await processCampaignTick(
      db,
      campaignId,
      testDeps(outbox, new Date("2026-11-17T08:00:08Z")),
    );

    expect(outbox.sent).toHaveLength(0);
    expect(out.reschedule?.toISOString()).toBe("2026-11-17T11:00:00.000Z");
    const c = await db.messageCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(c.status).toBe("WAITING_WINDOW");
    expect(c.statusReason).toContain("Fora do horário permitido");
  });

  it("projeto em Lisboa usa o fuso de Lisboa", async () => {
    const seed = await seedEvent(db, 1, { timezone: "Europe/Lisbon" });
    const { campaignId } = await newWhatsappCampaign(seed);
    const outbox = new FakeOutbox();
    await processCampaignTick(db, campaignId, testDeps(outbox, new Date("2026-11-17T08:00:08Z")));
    expect(outbox.sent).toHaveLength(1);
  });
});

describe("limite diário por número", () => {
  it("para no limite e retoma no dia seguinte", async () => {
    const seed = await seedEvent(db, 5);
    const { campaignId } = await newWhatsappCampaign(seed, { ...fastPacing, dailyLimit: 3 });
    const outbox = new FakeOutbox();
    const deps = testDeps(outbox, INSIDE_WINDOW);
    let last = {};
    for (let i = 0; i < 6; i++) last = await processCampaignTick(db, campaignId, deps);

    expect(outbox.sent).toHaveLength(3);
    const c = await db.messageCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(c.status).toBe("WAITING_WINDOW");
    expect(c.statusReason).toContain("Limite de 3");
    expect((last as { reschedule?: Date }).reschedule?.toISOString()).toBe(
      "2026-11-18T11:00:00.000Z",
    );
  });
});

describe("falhas", () => {
  it("número sem WhatsApp não pausa; falhas de servidor seguidas pausam", async () => {
    const seed = await seedEvent(db, 6);
    const { campaignId } = await newWhatsappCampaign(seed);
    const outbox = new FakeOutbox();
    outbox.failFor.set(seed.phones[0]!, "RECIPIENT");
    const deps = testDeps(outbox, INSIDE_WINDOW);
    await processCampaignTick(db, campaignId, deps);
    expect((await db.messageCampaign.findUniqueOrThrow({ where: { id: campaignId } })).status).toBe(
      "RUNNING",
    );

    outbox.failAll = "TRANSIENT";
    for (let i = 0; i < 3; i++) await processCampaignTick(db, campaignId, deps);
    const c = await db.messageCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(c.status).toBe("PAUSED");
    expect(c.statusReason).toContain("3 falhas seguidas");

    // Organizador retoma: zera o contador e continua de onde parou
    outbox.failAll = null;
    expect((await resumeCampaign(db, { tenantId: seed.tenantId, campaignId })).ok).toBe(true);
    for (let i = 0; i < 5; i++) await processCampaignTick(db, campaignId, deps);
    expect(outbox.sent).toHaveLength(2);
    expect((await db.messageCampaign.findUniqueOrThrow({ where: { id: campaignId } })).status).toBe(
      "COMPLETED",
    );
  });

  it("WhatsApp desconectado pausa sem consumir a fila", async () => {
    const seed = await seedEvent(db, 2);
    const { campaignId } = await newWhatsappCampaign(seed);
    const outbox = new FakeOutbox();
    outbox.state = "closed";
    await processCampaignTick(db, campaignId, testDeps(outbox, INSIDE_WINDOW));
    const s = await campaignSummary(db, { tenantId: seed.tenantId, campaignId });
    expect(s?.status).toBe("PAUSED");
    expect(s?.counts.QUEUED).toBe(2);
  });

  it("entrega presa em SENDING vira FAILED (nunca é reenviada)", async () => {
    const seed = await seedEvent(db, 1);
    const { campaignId } = await newWhatsappCampaign(seed);
    await claimNextDelivery(db, campaignId, "morreu");
    expect(await recoverStaleDeliveries(db, 10 * 60_000, new Date(Date.now() + 11 * 60_000))).toBe(
      1,
    );
    const d = await db.messageDelivery.findFirstOrThrow({ where: { campaignId } });
    expect(d.status).toBe("FAILED");
    expect(d.error).toContain("não foi reenviado");
  });
});

describe("controle e público", () => {
  it("pula sem telefone e duplicados, e não deixa dois WhatsApp simultâneos no cliente", async () => {
    const seed = await seedEvent(db, 3);
    const p = await db.registration.findFirstOrThrow({
      where: { id: seed.registrationIds[1] },
      select: { personId: true },
    });
    await db.person.update({ where: { id: p.personId }, data: { phone: "+55 (11) 91000-0000" } }); // mesmo número de seed.phones[0], digitado de outro jeito
    const p3 = await db.registration.findFirstOrThrow({
      where: { id: seed.registrationIds[2] },
      select: { personId: true },
    });
    await db.person.update({ where: { id: p3.personId }, data: { phone: "" } });

    const r = await createCampaign(db, {
      tenantId: seed.tenantId,
      projectId: seed.projectId,
      channel: "WHATSAPP",
      template: tpl,
      audience: { kind: "registrations" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.total).toBe(1);
    expect(r.data.skippedByReason).toEqual({ DUPLICATE: 1, NO_PHONE: 1 });

    const again = await createCampaign(db, {
      tenantId: seed.tenantId,
      projectId: seed.projectId,
      channel: "WHATSAPP",
      template: tpl,
      audience: { kind: "registrations" },
    });
    expect(again.ok).toBe(false);

    expect(
      (await pauseCampaign(db, { tenantId: seed.tenantId, campaignId: r.data.campaignId })).ok,
    ).toBe(true);
    const cancel = await cancelCampaign(db, {
      tenantId: seed.tenantId,
      campaignId: r.data.campaignId,
    });
    expect(cancel.ok && cancel.data.canceled).toBe(1);
  });

  it("respeita a recusa de WhatsApp registrada no consentimento", async () => {
    const seed = await seedEvent(db, 2);
    const reg = await db.registration.findFirstOrThrow({ where: { id: seed.registrationIds[0] } });
    await db.consent.create({
      data: {
        tenantId: seed.tenantId,
        personId: reg.personId,
        purpose: "WHATSAPP",
        granted: false,
      },
    });
    const r = await createCampaign(db, {
      tenantId: seed.tenantId,
      projectId: seed.projectId,
      channel: "WHATSAPP",
      template: tpl,
      audience: { kind: "registrations" },
    });
    expect(r.ok && r.data.skippedByReason).toEqual({ OPT_OUT: 1 });
  });

  it("outro cliente não acessa a campanha", async () => {
    const seed = await seedEvent(db, 1);
    const { campaignId } = await newWhatsappCampaign(seed);
    expect(await campaignSummary(db, { tenantId: "outro-cliente", campaignId })).toBeNull();
    expect((await pauseCampaign(db, { tenantId: "outro-cliente", campaignId })).ok).toBe(false);
  });
});

describe("transacional, jobs e webhooks", () => {
  it("mensagem transacional não duplica e enfileira um job único", async () => {
    const seed = await seedEvent(db, 1);
    const input = {
      tenantId: seed.tenantId,
      registrationId: seed.registrationIds[0]!,
      channels: ["EMAIL" as const, "WHATSAPP" as const],
      reason: "registration.confirmed",
      template: tpl,
    };
    const first = await sendTransactional(db, input);
    const second = await sendTransactional(db, input);
    expect(first.ok && first.data.map((o) => o.status)).toEqual(["QUEUED", "QUEUED"]);
    expect(second.ok && second.data.map((o) => o.status)).toEqual(["DUPLICATE", "DUPLICATE"]);
    expect(await db.job.count({ where: { queue: "messaging.delivery.send" } })).toBe(2);
  });

  it("enqueueJob com uniqueKey: pendente mantém o horário mais cedo; terminado volta à fila", async () => {
    const early = new Date("2026-01-01T00:00:00Z");
    const late = new Date("2026-06-01T00:00:00Z");
    await enqueueJob(db, { queue: "x", uniqueKey: "k", runAt: late });
    await enqueueJob(db, { queue: "x", uniqueKey: "k", runAt: early });
    let j = await db.job.findUniqueOrThrow({ where: { uniqueKey: "k" } });
    expect(j.runAt.toISOString()).toBe(early.toISOString());
    await db.job.update({ where: { id: j.id }, data: { status: "DONE", attempts: 3 } });
    await enqueueJob(db, { queue: "x", uniqueKey: "k", runAt: late });
    j = await db.job.findUniqueOrThrow({ where: { uniqueKey: "k" } });
    expect([j.status, j.attempts, j.runAt.toISOString()]).toEqual([
      "PENDING",
      0,
      late.toISOString(),
    ]);
    expect(await db.job.count()).toBe(1);
  });

  it("status do webhook só avança (lido não volta a entregue)", async () => {
    const seed = await seedEvent(db, 1);
    const { campaignId } = await newWhatsappCampaign(seed);
    const outbox = new FakeOutbox();
    await processCampaignTick(db, campaignId, testDeps(outbox, INSIDE_WINDOW));
    const d = await db.messageDelivery.findFirstOrThrow({ where: { campaignId, status: "SENT" } });
    await applyStatusUpdates(
      db,
      parseEvolutionWebhook({
        event: "messages.update",
        data: { keyId: d.providerMessageId, status: "READ" },
      }),
    );
    await applyStatusUpdates(
      db,
      parseEvolutionWebhook({
        event: "messages.update",
        data: { keyId: d.providerMessageId, status: "DELIVERY_ACK" },
      }),
    );
    expect((await db.messageDelivery.findUniqueOrThrow({ where: { id: d.id } })).status).toBe(
      "READ",
    );
  });
});

describe("e-mail real no Mailpit", async () => {
  const api = process.env.MAILPIT_API!;
  const reachable = await fetch(`${api}/api/v1/info`)
    .then((r) => r.ok)
    .catch(() => false);

  it.skipIf(!reachable)(
    "envia a campanha pelo SMTP e a mensagem chega com acentos e botões",
    async () => {
      const seed = await seedEvent(db, 2);
      const marker = `itest-${Date.now()}`;
      const r = await createCampaign(db, {
        tenantId: seed.tenantId,
        projectId: seed.projectId,
        channel: "EMAIL",
        template: {
          ...tpl,
          emailSubject: `${marker} — Faltam {{dias_restantes}} dias para o {{projeto}}`,
        },
        audience: { kind: "registrations" },
      });
      if (!r.ok) throw new Error(r.error);
      const deps = defaultDeps({
        providers: realProviders,
        now: () => new Date("2026-11-17T17:00:00Z"),
        emailIntervalMs: 0,
        workerId: "mailpit",
      });
      await processCampaignTick(db, r.data.campaignId, deps);

      const found = (await (
        await fetch(`${api}/api/v1/search?query=${encodeURIComponent(`subject:"${marker}"`)}`)
      ).json()) as {
        messages: {
          ID: string;
          Subject: string;
          To: { Address: string }[];
          From: { Address: string; Name: string };
        }[];
      };
      expect(found.messages).toHaveLength(2);
      expect(found.messages[0]?.Subject).toContain("Faltam 7 dias para o Jantar ABIEC 2026");
      expect(found.messages[0]?.From.Name).toBe("ABIEC Eventos");
      const full = (await (
        await fetch(`${api}/api/v1/message/${found.messages[0]!.ID}`)
      ).json()) as { HTML: string; Text: string };
      expect(full.HTML).toContain("Confirmar minha presença");
      expect(full.HTML).toContain("<strong>Pessoa");
      expect(full.Text).toContain("https://plataforma.teste/c/");
      expect(
        (await db.messageCampaign.findUniqueOrThrow({ where: { id: r.data.campaignId } })).status,
      ).toBe("COMPLETED");
    },
  );
});
