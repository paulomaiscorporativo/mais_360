import {
  decideSend,
  nextSendAfter,
  pacingSchema,
  renderEmail,
  renderWhatsapp,
  startOfZonedDay,
  typingDelayMs,
} from "@mais/core/messaging";
import type { MessageCampaign, PrismaClient } from "@mais/db";
import {
  resolveChannel,
  type ResolvedEmailChannel,
  type ResolvedWhatsappChannel,
} from "./channels";
import { loadPersonContext, loadRegistrationContext, type LoadedContext } from "./context";
import { emailIntervalMs } from "./env";
import {
  asProviderError,
  realProviders,
  type EmailProvider,
  type ProviderFactory,
  type WhatsappProvider,
} from "./providers";
import { templateContentSchema, type TemplateContent } from "./template";

/**
 * Processamento das campanhas e entregas — chamado pelo worker.
 *
 * Garantias:
 *  • uma entrega só é enviada por quem conseguiu trocá-la de QUEUED para
 *    SENDING com FOR UPDATE SKIP LOCKED — dois workers nunca pegam a mesma;
 *  • a entrega só sai de SENDING para SENT/FAILED; resultado incerto nunca
 *    volta para a fila (ver recoverStaleDeliveries);
 *  • janela, limite diário e lotes no fuso da campanha.
 */

export type MessagingDeps = {
  providers: ProviderFactory;
  now: () => Date;
  random: () => number;
  sleep: (ms: number) => Promise<void>;
  workerId: string;
  emailIntervalMs: number;
  /** Máximo de e-mails por execução do job (o resto vai na próxima) */
  emailBatch: number;
};

export function defaultDeps(overrides: Partial<MessagingDeps> = {}): MessagingDeps {
  return {
    providers: realProviders,
    now: () => new Date(),
    random: Math.random,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    workerId: `worker-${process.pid}`,
    emailIntervalMs: emailIntervalMs(),
    emailBatch: 25,
    ...overrides,
  };
}

/** O que o job deve fazer depois: reagendar para um horário ou terminar. */
export type TickOutcome = { reschedule?: Date };

const WA_MAX_CONSECUTIVE_FAILURES = 3;
const EMAIL_MAX_CONSECUTIVE_FAILURES = 5;

type ClaimedDelivery = {
  id: string;
  personId: string | null;
  registrationId: string | null;
  target: string;
  recipientName: string;
  campaignId: string | null;
};

/** Reivindica a próxima entrega da campanha. Atômico entre processos. */
export async function claimNextDelivery(
  db: PrismaClient,
  campaignId: string,
  workerId: string,
): Promise<ClaimedDelivery | null> {
  const rows = await db.$queryRaw<ClaimedDelivery[]>`
    UPDATE "MessageDelivery"
       SET status = 'SENDING', "lockedAt" = now(), "lockedBy" = ${workerId}, attempts = attempts + 1, "updatedAt" = now()
     WHERE id = (
       SELECT id FROM "MessageDelivery"
        WHERE "campaignId" = ${campaignId} AND status = 'QUEUED'
        ORDER BY "createdAt", id
        FOR UPDATE SKIP LOCKED
        LIMIT 1)
    RETURNING id, "personId", "registrationId", target, "recipientName", "campaignId"`;
  return rows[0] ?? null;
}

/** Reivindica uma entrega específica (mensagens transacionais). */
async function claimDelivery(
  db: PrismaClient,
  deliveryId: string,
  workerId: string,
): Promise<ClaimedDelivery | null> {
  const rows = await db.$queryRaw<ClaimedDelivery[]>`
    UPDATE "MessageDelivery"
       SET status = 'SENDING', "lockedAt" = now(), "lockedBy" = ${workerId}, attempts = attempts + 1, "updatedAt" = now()
     WHERE id = (SELECT id FROM "MessageDelivery" WHERE id = ${deliveryId} AND status = 'QUEUED' FOR UPDATE SKIP LOCKED)
    RETURNING id, "personId", "registrationId", target, "recipientName", "campaignId"`;
  return rows[0] ?? null;
}

async function contextFor(
  db: PrismaClient,
  d: ClaimedDelivery,
  projectId: string | null,
): Promise<LoadedContext | null> {
  if (d.registrationId) return loadRegistrationContext(db, d.registrationId);
  if (d.personId) return loadPersonContext(db, d.personId, projectId);
  return null;
}

/** Envios de WhatsApp deste NÚMERO hoje (dia do fuso), para o limite diário. */
export async function sentTodayBySender(
  db: PrismaClient,
  senderKey: string,
  now: Date,
  timeZone: string,
): Promise<number> {
  return db.messageDelivery.count({
    where: {
      channel: "WHATSAPP",
      senderKey,
      status: { in: ["SENT", "DELIVERED", "READ"] },
      sentAt: { gte: startOfZonedDay(now, timeZone) },
    },
  });
}

async function markSent(
  db: PrismaClient,
  id: string,
  r: { providerMessageId: string; senderKey: string; subject?: string; body: string },
  at: Date,
) {
  await db.messageDelivery.update({
    where: { id },
    data: {
      status: "SENT",
      sentAt: at,
      providerMessageId: r.providerMessageId,
      senderKey: r.senderKey,
      subject: r.subject ?? "",
      bodyPreview: r.body.slice(0, 500),
      error: "",
      lockedAt: null,
    },
  });
}

async function markFailed(db: PrismaClient, id: string, error: string) {
  await db.messageDelivery.update({
    where: { id },
    data: { status: "FAILED", error: error.slice(0, 1000), lockedAt: null },
  });
}

async function remaining(db: PrismaClient, campaignId: string) {
  return db.messageDelivery.count({ where: { campaignId, status: { in: ["QUEUED", "SENDING"] } } });
}

async function finishIfDone(db: PrismaClient, c: MessageCampaign, now: Date): Promise<boolean> {
  if ((await remaining(db, c.id)) > 0) return false;
  await db.messageCampaign.updateMany({
    where: { id: c.id, status: { in: ["RUNNING", "WAITING_WINDOW"] } },
    data: { status: "COMPLETED", statusReason: "", nextSendAt: null, finishedAt: now },
  });
  return true;
}

async function setStatus(
  db: PrismaClient,
  id: string,
  data: { status: MessageCampaign["status"]; statusReason: string; nextSendAt: Date | null },
) {
  // Nunca sobrescreve uma decisão do organizador (pausa/cancelamento) tomada durante o envio
  await db.messageCampaign.updateMany({
    where: { id, status: { in: ["RUNNING", "WAITING_WINDOW", "SCHEDULED"] } },
    data,
  });
}

function snapshotOf(c: MessageCampaign): TemplateContent {
  return templateContentSchema.parse(c.snapshot);
}

// ---------------------------------------------------------------------------
// Campanha
// ---------------------------------------------------------------------------

export async function processCampaignTick(
  db: PrismaClient,
  campaignId: string,
  deps: MessagingDeps,
): Promise<TickOutcome> {
  const outcome = await tickInner(db, campaignId, deps);
  if (outcome.reschedule) return outcome;
  // Se o organizador retomou durante a execução, a campanha está ativa sem job agendado: agenda já
  const c = await db.messageCampaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });
  if (
    c &&
    (c.status === "RUNNING" || c.status === "WAITING_WINDOW") &&
    (await remaining(db, campaignId)) > 0
  ) {
    return { reschedule: new Date(deps.now().getTime() + 1000) };
  }
  return {};
}

async function tickInner(
  db: PrismaClient,
  campaignId: string,
  deps: MessagingDeps,
): Promise<TickOutcome> {
  const c = await db.messageCampaign.findUnique({ where: { id: campaignId } });
  if (!c) return {};
  const now = deps.now();

  if (c.status === "SCHEDULED") {
    if (c.scheduledAt && c.scheduledAt > now) return { reschedule: c.scheduledAt };
    await db.messageCampaign.updateMany({
      where: { id: c.id, status: "SCHEDULED" },
      data: { status: "RUNNING", startedAt: now, statusReason: "" },
    });
    c.status = "RUNNING";
  }
  if (c.status !== "RUNNING" && c.status !== "WAITING_WINDOW") return {};

  const channel = await resolveChannel(db, {
    tenantId: c.tenantId,
    projectId: c.projectId,
    kind: c.channel,
    channelId: c.channelId,
  });
  if (!channel) {
    await setStatus(db, c.id, {
      status: "PAUSED",
      statusReason:
        "O canal de envio não está mais configurado. Revise em Comunicação → Canais e retome.",
      nextSendAt: null,
    });
    return {};
  }

  if (channel.kind === "WHATSAPP") return tickWhatsapp(db, c, channel, deps);
  return tickEmail(db, c, channel, deps);
}

async function tickWhatsapp(
  db: PrismaClient,
  c: MessageCampaign,
  channel: ResolvedWhatsappChannel,
  deps: MessagingDeps,
): Promise<TickOutcome> {
  const now = deps.now();
  const pacing = pacingSchema.parse(c.pacing);
  const provider: WhatsappProvider = deps.providers.whatsapp(channel);

  const sentToday = await sentTodayBySender(db, provider.senderKey, now, c.timezone);
  const decision = decideSend({ now, pacing, timeZone: c.timezone, sentToday });
  if (decision.action === "wait") {
    await setStatus(db, c.id, {
      status: "WAITING_WINDOW",
      statusReason: decision.reason,
      nextSendAt: decision.until,
    });
    return { reschedule: decision.until };
  }

  const state = await provider.connectionState();
  if (state !== "open") {
    await setStatus(db, c.id, {
      status: "PAUSED",
      statusReason:
        "O WhatsApp está desconectado. Conecte o número em Comunicação → Canais e clique em “Retomar”.",
      nextSendAt: null,
    });
    return {};
  }

  const d = await claimNextDelivery(db, c.id, deps.workerId);
  if (!d) {
    await finishIfDone(db, c, now);
    return {};
  }

  const tpl = snapshotOf(c);
  const loaded = await contextFor(db, d, c.projectId);
  let succeeded = false;
  if (!loaded) {
    await markFailed(db, d.id, "Cadastro da pessoa não encontrado.");
    await db.messageCampaign.update({ where: { id: c.id }, data: { failed: { increment: 1 } } });
  } else {
    const text = renderWhatsapp(tpl, loaded.ctx, now);
    try {
      const r = await provider.sendText(d.target, text, {
        typingMs: typingDelayMs(deps.random),
        idempotencyKey: d.id,
      });
      await markSent(
        db,
        d.id,
        { providerMessageId: r.providerMessageId, senderKey: provider.senderKey, body: text },
        deps.now(),
      );
      await db.messageCampaign.update({
        where: { id: c.id },
        data: { sent: { increment: 1 }, consecutiveFailures: 0 },
      });
      succeeded = true;
    } catch (e) {
      const err = asProviderError(e);
      await markFailed(db, d.id, err.message);
      // Número inexistente é problema do cadastro, não do envio: não conta para a pausa automática
      const counts = err.kind !== "RECIPIENT";
      const updated = await db.messageCampaign.update({
        where: { id: c.id },
        data: {
          failed: { increment: 1 },
          ...(counts ? { consecutiveFailures: { increment: 1 } } : {}),
        },
        select: { consecutiveFailures: true },
      });
      if (err.kind === "CONFIG" || updated.consecutiveFailures >= WA_MAX_CONSECUTIVE_FAILURES) {
        await setStatus(db, c.id, {
          status: "PAUSED",
          statusReason: `Pausado após ${err.kind === "CONFIG" ? "erro de configuração" : `${updated.consecutiveFailures} falhas seguidas`} (último erro: ${err.message}). Verifique o WhatsApp e clique em “Retomar”.`,
          nextSendAt: null,
        });
        return {};
      }
    }
  }

  if (await finishIfDone(db, c, deps.now())) return {};
  const fresh = await db.messageCampaign.findUnique({
    where: { id: c.id },
    select: { sent: true },
  });
  const next = nextSendAfter({
    now: deps.now(),
    pacing,
    timeZone: c.timezone,
    sentInCampaign: fresh?.sent ?? 0,
    lastSucceeded: succeeded,
    random: deps.random,
  });
  await setStatus(db, c.id, { status: "RUNNING", statusReason: next.reason, nextSendAt: next.at });
  return { reschedule: next.at };
}

function emailFor(
  channel: ResolvedEmailChannel,
  rendered: { subject: string; html: string; text: string },
  to: string,
  deliveryId: string,
) {
  return {
    from: channel.from,
    replyTo: channel.replyTo,
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: { "X-Comitiva-Delivery": deliveryId },
  };
}

async function tickEmail(
  db: PrismaClient,
  c: MessageCampaign,
  channel: ResolvedEmailChannel,
  deps: MessagingDeps,
): Promise<TickOutcome> {
  const provider: EmailProvider = deps.providers.email(channel, { pool: true });
  const tpl = snapshotOf(c);
  try {
    for (let i = 0; i < deps.emailBatch; i++) {
      const status = await db.messageCampaign.findUnique({
        where: { id: c.id },
        select: { status: true },
      });
      if (status?.status !== "RUNNING") return {};
      const d = await claimNextDelivery(db, c.id, deps.workerId);
      if (!d) break;
      const loaded = await contextFor(db, d, c.projectId);
      if (!loaded) {
        await markFailed(db, d.id, "Cadastro da pessoa não encontrado.");
        await db.messageCampaign.update({
          where: { id: c.id },
          data: { failed: { increment: 1 } },
        });
        continue;
      }
      const rendered = renderEmail(tpl, loaded.ctx, loaded.branding, deps.now());
      try {
        const r = await provider.send(emailFor(channel, rendered, d.target, d.id));
        await markSent(
          db,
          d.id,
          {
            providerMessageId: r.providerMessageId,
            senderKey: provider.senderKey,
            subject: rendered.subject,
            body: rendered.text,
          },
          deps.now(),
        );
        await db.messageCampaign.update({
          where: { id: c.id },
          data: { sent: { increment: 1 }, consecutiveFailures: 0 },
        });
      } catch (e) {
        const err = asProviderError(e);
        await markFailed(db, d.id, err.message);
        const counts = err.kind !== "RECIPIENT";
        const updated = await db.messageCampaign.update({
          where: { id: c.id },
          data: {
            failed: { increment: 1 },
            ...(counts ? { consecutiveFailures: { increment: 1 } } : {}),
          },
          select: { consecutiveFailures: true },
        });
        if (
          err.kind === "CONFIG" ||
          updated.consecutiveFailures >= EMAIL_MAX_CONSECUTIVE_FAILURES
        ) {
          await setStatus(db, c.id, {
            status: "PAUSED",
            statusReason: `Envio pausado após ${err.kind === "CONFIG" ? "erro de autenticação" : `${updated.consecutiveFailures} falhas seguidas`} (possível limite diário do provedor ou problema na conta). Último erro: ${err.message}`,
            nextSendAt: null,
          });
          return {};
        }
      }
      if (deps.emailIntervalMs) await deps.sleep(deps.emailIntervalMs);
    }
  } finally {
    provider.close?.();
  }
  if (await finishIfDone(db, c, deps.now())) return {};
  const at = new Date(deps.now().getTime() + Math.max(250, deps.emailIntervalMs));
  await setStatus(db, c.id, { status: "RUNNING", statusReason: "", nextSendAt: at });
  return { reschedule: at };
}

// ---------------------------------------------------------------------------
// Entrega avulsa (transacional)
// ---------------------------------------------------------------------------

export type DeliverySendPayload = {
  deliveryId: string;
  template: TemplateContent;
  projectId: string | null;
};

/**
 * Envia uma mensagem transacional. Falha temporária → devolve à fila e lança
 * (o worker tenta de novo com backoff). Demais falhas → FAILED.
 */
export async function processDeliverySend(
  db: PrismaClient,
  payload: DeliverySendPayload,
  deps: MessagingDeps,
): Promise<TickOutcome> {
  const existing = await db.messageDelivery.findUnique({ where: { id: payload.deliveryId } });
  if (!existing || existing.status !== "QUEUED") return {};
  const now = deps.now();
  const channel = await resolveChannel(db, {
    tenantId: existing.tenantId,
    projectId: payload.projectId,
    kind: existing.channel,
  });
  if (!channel) {
    await markFailed(db, existing.id, "Nenhum canal de envio configurado.");
    return {};
  }

  let whatsapp: WhatsappProvider | null = null;
  if (channel.kind === "WHATSAPP") {
    whatsapp = deps.providers.whatsapp(channel);
    // Mensagem avulsa também respeita a janela e o limite do número (padrão cauteloso)
    const loadedTz = existing.registrationId
      ? (
          await db.registration.findUnique({
            where: { id: existing.registrationId },
            select: {
              project: { select: { timezone: true, tenant: { select: { timezone: true } } } },
            },
          })
        )?.project
      : null;
    const tz = loadedTz?.timezone || loadedTz?.tenant.timezone || "America/Sao_Paulo";
    const decision = decideSend({
      now,
      pacing: pacingSchema.parse({}),
      timeZone: tz,
      sentToday: await sentTodayBySender(db, whatsapp.senderKey, now, tz),
    });
    if (decision.action === "wait") return { reschedule: decision.until };
    if ((await whatsapp.connectionState()) !== "open")
      return { reschedule: new Date(now.getTime() + 10 * 60_000) };
  }

  const d = await claimDelivery(db, existing.id, deps.workerId);
  if (!d) return {};
  const loaded = await contextFor(db, d, payload.projectId);
  if (!loaded) {
    await markFailed(db, d.id, "Cadastro da pessoa não encontrado.");
    return {};
  }
  try {
    if (channel.kind === "EMAIL") {
      const provider = deps.providers.email(channel);
      try {
        const rendered = renderEmail(payload.template, loaded.ctx, loaded.branding, now);
        const r = await provider.send(emailFor(channel, rendered, d.target, d.id));
        await markSent(
          db,
          d.id,
          {
            providerMessageId: r.providerMessageId,
            senderKey: provider.senderKey,
            subject: rendered.subject,
            body: rendered.text,
          },
          deps.now(),
        );
      } finally {
        provider.close?.();
      }
    } else if (whatsapp) {
      const text = renderWhatsapp(payload.template, loaded.ctx, now);
      const r = await whatsapp.sendText(d.target, text, {
        typingMs: typingDelayMs(deps.random),
        idempotencyKey: d.id,
      });
      await markSent(
        db,
        d.id,
        { providerMessageId: r.providerMessageId, senderKey: whatsapp.senderKey, body: text },
        deps.now(),
      );
    }
  } catch (e) {
    const err = asProviderError(e);
    if (err.kind === "TRANSIENT") {
      // Ainda não saiu: devolve para a fila e deixa o worker tentar de novo
      await db.messageDelivery.update({
        where: { id: d.id },
        data: { status: "QUEUED", error: err.message, lockedAt: null },
      });
      throw err;
    }
    await markFailed(db, d.id, err.message);
  }
  return {};
}

// ---------------------------------------------------------------------------
// Manutenção
// ---------------------------------------------------------------------------

/**
 * Entregas presas em SENDING (o worker caiu no meio do envio). Não sabemos se
 * a mensagem saiu: marcamos como FAILED com explicação em vez de reenviar —
 * duplicar uma mensagem no WhatsApp custa mais do que perder uma.
 */
export async function recoverStaleDeliveries(
  db: PrismaClient,
  olderThanMs = 10 * 60_000,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanMs);
  const rows = await db.$queryRaw<{ campaignId: string | null }[]>`
    UPDATE "MessageDelivery"
       SET status = 'FAILED', "lockedAt" = NULL, "updatedAt" = now(),
           error = 'Envio interrompido (o processo parou durante o envio). Pode ter sido entregue; não foi reenviado para evitar duplicidade.'
     WHERE status = 'SENDING' AND "lockedAt" < ${cutoff}
    RETURNING "campaignId"`;
  const perCampaign = new Map<string, number>();
  for (const r of rows)
    if (r.campaignId) perCampaign.set(r.campaignId, (perCampaign.get(r.campaignId) ?? 0) + 1);
  for (const [id, n] of perCampaign)
    await db.messageCampaign.update({ where: { id }, data: { failed: { increment: n } } });
  return rows.length;
}
