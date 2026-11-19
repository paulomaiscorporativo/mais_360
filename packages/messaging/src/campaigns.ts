import {
  audienceSchema,
  campaignDeliveryKey,
  estimateDuration,
  pacingSchema,
  planRecipients,
  SKIP_REASON_LABELS,
  type Audience,
  type Candidate,
  type Pacing,
  type SkipReason,
} from "@mais/core/messaging";
import type { CampaignStatus, Prisma, PrismaClient } from "@mais/db";
import { z } from "zod";
import { resolveChannel } from "./channels";
import { defaultTimeZone } from "./env";
import { enqueueCampaignTick } from "./jobs";
import { fail, ok, type Result } from "./result";
import { templateContentSchema, validateForChannel, type TemplateContent } from "./template";

export const ACTIVE_STATUSES: CampaignStatus[] = [
  "SCHEDULED",
  "RUNNING",
  "WAITING_WINDOW",
  "PAUSED",
];

export const createCampaignSchema = z
  .object({
    tenantId: z.string().min(1),
    projectId: z.string().min(1).nullish(),
    channel: z.enum(["EMAIL", "WHATSAPP"]),
    name: z.string().trim().max(160).optional(),
    templateId: z.string().min(1).optional(),
    template: templateContentSchema.optional(),
    audience: audienceSchema,
    pacing: pacingSchema.optional(),
    scheduledAt: z.coerce.date().optional(),
    createdBy: z.string().default(""),
  })
  .refine((v) => v.templateId || v.template, {
    message: "Escolha um modelo ou escreva a mensagem.",
    path: ["template"],
  })
  .refine((v) => v.audience.kind === "members" || v.projectId, {
    message: "Selecione o evento ou viagem do público.",
    path: ["projectId"],
  });

export type CreateCampaignInput = z.input<typeof createCampaignSchema>;

export type CampaignCreated = {
  campaignId: string;
  total: number;
  skipped: number;
  skippedByReason: Partial<Record<SkipReason, number>>;
  estimate?: { days: number; activeMinutes: number };
};

/** Pessoas que negaram explicitamente mensagens por WhatsApp (último consentimento registrado). */
async function whatsappOptOuts(
  db: PrismaClient,
  tenantId: string,
  personIds: string[],
): Promise<Set<string>> {
  if (!personIds.length) return new Set();
  const rows = await db.consent.findMany({
    where: { tenantId, personId: { in: personIds }, purpose: "WHATSAPP" },
    orderBy: { createdAt: "desc" },
    select: { personId: true, granted: true },
  });
  const latest = new Map<string, boolean>();
  for (const r of rows) if (!latest.has(r.personId)) latest.set(r.personId, r.granted);
  return new Set([...latest].filter(([, granted]) => !granted).map(([id]) => id));
}

/** Expande o público em candidatos (ainda sem decidir canal). */
export async function expandAudience(
  db: PrismaClient,
  scope: { tenantId: string; projectId?: string | null },
  audience: Audience,
): Promise<Candidate[]> {
  if (audience.kind === "members") {
    const people = await db.person.findMany({
      where: {
        tenantId: scope.tenantId,
        isMember: true,
        archivedAt: null,
        ...(audience.memberTypes?.length ? { memberType: { in: audience.memberTypes } } : {}),
        ...(audience.personIds?.length ? { id: { in: audience.personIds } } : {}),
      },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      orderBy: [{ firstName: "asc" }, { id: "asc" }],
    });
    return people.map((p) => ({
      recipientId: p.id,
      personId: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      email: p.email,
      phone: p.phone,
    }));
  }

  const where: Prisma.RegistrationWhereInput = {
    tenantId: scope.tenantId,
    projectId: scope.projectId ?? "__none__",
  };
  if (audience.kind === "explicit") {
    where.id = { in: audience.registrationIds };
    where.status = { not: "CANCELED" };
  } else {
    if (audience.statuses?.length) where.status = { in: audience.statuses };
    else if (!audience.includeCanceled) where.status = { not: "CANCELED" };
    if (audience.roles?.length) where.role = { in: audience.roles };
    if (audience.categoryIds?.length) where.categoryId = { in: audience.categoryIds };
    if (audience.groupIds?.length) where.groupId = { in: audience.groupIds };
    if (audience.checkedIn === true) where.checkedInAt = { not: null };
    if (audience.checkedIn === false) where.checkedInAt = null;
  }
  const regs = await db.registration.findMany({
    where,
    select: {
      id: true,
      personId: true,
      person: { select: { firstName: true, lastName: true, email: true, phone: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return regs.map((r) => ({
    recipientId: r.id,
    personId: r.personId,
    registrationId: r.id,
    name: `${r.person.firstName} ${r.person.lastName}`.trim(),
    email: r.person.email,
    phone: r.person.phone,
  }));
}

async function loadTemplate(
  db: PrismaClient,
  tenantId: string,
  templateId: string,
): Promise<TemplateContent | null> {
  const t = await db.messageTemplate.findFirst({
    where: { id: templateId, tenantId, archivedAt: null },
  });
  return t
    ? {
        name: t.name,
        emailSubject: t.emailSubject,
        emailBody: t.emailBody,
        whatsappBody: t.whatsappBody,
        includeActions: t.includeActions,
      }
    : null;
}

export async function createCampaign(
  db: PrismaClient,
  raw: CreateCampaignInput,
): Promise<Result<CampaignCreated>> {
  const parsed = createCampaignSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const input = parsed.data;

  const template =
    input.template ??
    (input.templateId ? await loadTemplate(db, input.tenantId, input.templateId) : null);
  if (!template) return fail("Modelo de mensagem não encontrado.");
  const invalid = validateForChannel(template, input.channel);
  if (invalid) return fail(invalid);

  if (input.projectId) {
    const project = await db.project.findFirst({
      where: { id: input.projectId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!project) return fail("Evento ou viagem não encontrado neste cliente.");
  }

  const channel = await resolveChannel(db, {
    tenantId: input.tenantId,
    projectId: input.projectId,
    kind: input.channel,
  });
  if (!channel) {
    return fail(
      input.channel === "EMAIL"
        ? "Nenhum servidor de e-mail configurado para este cliente. Configure em Comunicação → Canais."
        : "Nenhum WhatsApp configurado para este cliente. Conecte um número em Comunicação → Canais.",
    );
  }

  // Um envio de WhatsApp por vez por cliente: dois disparos simultâneos somariam
  // o ritmo e derrubariam a proteção contra bloqueio do número.
  if (input.channel === "WHATSAPP") {
    const active = await db.messageCampaign.findFirst({
      where: { tenantId: input.tenantId, channel: "WHATSAPP", status: { in: ACTIVE_STATUSES } },
      select: { name: true },
    });
    if (active) {
      return fail(
        `Já existe um envio por WhatsApp em andamento (“${active.name}”). Para proteger o número, só um acontece por vez — aguarde terminar ou cancele-o.`,
      );
    }
  }

  const candidates = await expandAudience(db, input, input.audience);
  if (!candidates.length) return fail("Nenhuma pessoa corresponde ao público selecionado.");
  if (input.channel === "WHATSAPP") {
    const optOut = await whatsappOptOuts(db, input.tenantId, [
      ...new Set(candidates.map((c) => c.personId)),
    ]);
    for (const c of candidates) c.whatsappOptOut = optOut.has(c.personId);
  }

  const planned = planRecipients(candidates, input.channel);
  const sendable = planned.filter((p) => !p.skip);
  if (!sendable.length) {
    return fail(
      input.channel === "EMAIL"
        ? "Nenhuma das pessoas selecionadas tem e-mail válido."
        : "Nenhuma das pessoas selecionadas tem WhatsApp válido (ou autorização para recebê-lo).",
    );
  }

  const skippedByReason: Partial<Record<SkipReason, number>> = {};
  for (const p of planned) if (p.skip) skippedByReason[p.skip] = (skippedByReason[p.skip] ?? 0) + 1;

  const project = input.projectId
    ? await db.project.findUnique({ where: { id: input.projectId }, select: { timezone: true } })
    : null;
  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId },
    select: { timezone: true },
  });
  const timeZone = project?.timezone || tenant?.timezone || defaultTimeZone();
  const pacing: Pacing | null =
    input.channel === "WHATSAPP" ? (input.pacing ?? pacingSchema.parse({})) : null;
  const scheduled =
    input.scheduledAt && input.scheduledAt.getTime() > Date.now() ? input.scheduledAt : null;

  const campaign = await db.$transaction(async (tx) => {
    const c = await tx.messageCampaign.create({
      data: {
        tenantId: input.tenantId,
        projectId: input.projectId ?? null,
        templateId: input.templateId ?? null,
        channelId: channel.channelId,
        channel: input.channel,
        name: input.name?.trim() || template.name,
        snapshot: template,
        audience: input.audience,
        pacing: pacing ?? {},
        timezone: timeZone,
        status: scheduled ? "SCHEDULED" : "RUNNING",
        scheduledAt: scheduled,
        nextSendAt: scheduled ?? new Date(),
        startedAt: scheduled ? null : new Date(),
        total: sendable.length,
        skipped: planned.length - sendable.length,
        createdBy: input.createdBy,
      },
    });
    await tx.messageDelivery.createMany({
      data: planned.map((p) => ({
        tenantId: input.tenantId,
        campaignId: c.id,
        channel: input.channel,
        personId: p.candidate.personId,
        registrationId: p.candidate.registrationId ?? null,
        recipientName: p.candidate.name,
        target: p.target,
        dedupeKey: campaignDeliveryKey(c.id, p.candidate.recipientId, input.channel),
        status: p.skip ? "SKIPPED" : "QUEUED",
        error: p.skip ? SKIP_REASON_LABELS[p.skip] : "",
      })),
      skipDuplicates: true,
    });
    await enqueueCampaignTick(tx, c.id, scheduled ?? new Date());
    return c;
  });

  return ok({
    campaignId: campaign.id,
    total: sendable.length,
    skipped: planned.length - sendable.length,
    skippedByReason,
    ...(pacing ? { estimate: estimateDuration(sendable.length, pacing) } : {}),
  });
}

// ---------------------------------------------------------------------------
// Controle
// ---------------------------------------------------------------------------

type Scope = { tenantId: string; campaignId: string; actor?: string };

async function findCampaign(db: PrismaClient, s: Scope) {
  return db.messageCampaign.findFirst({ where: { id: s.campaignId, tenantId: s.tenantId } });
}

export async function pauseCampaign(db: PrismaClient, s: Scope): Promise<Result<null>> {
  const c = await findCampaign(db, s);
  if (!c) return fail("Envio não encontrado.");
  if (!["RUNNING", "WAITING_WINDOW", "SCHEDULED"].includes(c.status))
    return fail("Este envio não está em andamento.");
  await db.messageCampaign.update({
    where: { id: c.id },
    data: {
      status: "PAUSED",
      statusReason: `Pausado${s.actor ? ` por ${s.actor}` : " pelo organizador"}.`,
      nextSendAt: null,
    },
  });
  return ok(null);
}

export async function resumeCampaign(db: PrismaClient, s: Scope): Promise<Result<null>> {
  const c = await findCampaign(db, s);
  if (!c) return fail("Envio não encontrado.");
  if (c.status !== "PAUSED") return fail("Este envio não está pausado.");
  await db.$transaction(async (tx) => {
    await tx.messageCampaign.update({
      where: { id: c.id },
      data: {
        status: "RUNNING",
        statusReason: "",
        consecutiveFailures: 0,
        nextSendAt: new Date(),
        startedAt: c.startedAt ?? new Date(),
      },
    });
    await enqueueCampaignTick(tx, c.id);
  });
  return ok(null);
}

export async function cancelCampaign(
  db: PrismaClient,
  s: Scope,
): Promise<Result<{ canceled: number }>> {
  const c = await findCampaign(db, s);
  if (!c) return fail("Envio não encontrado.");
  if (!ACTIVE_STATUSES.includes(c.status)) return fail("Este envio já terminou.");
  const r = await db.$transaction(async (tx) => {
    // Só cancela o que ainda está na fila; o que está saindo agora termina normalmente
    const canceled = await tx.messageDelivery.updateMany({
      where: { campaignId: c.id, status: "QUEUED" },
      data: { status: "CANCELED" },
    });
    await tx.messageCampaign.update({
      where: { id: c.id },
      data: {
        status: "CANCELED",
        statusReason: `Cancelado${s.actor ? ` por ${s.actor}` : " pelo organizador"}.`,
        nextSendAt: null,
        finishedAt: new Date(),
      },
    });
    return canceled.count;
  });
  return ok({ canceled: r });
}

// ---------------------------------------------------------------------------
// Acompanhamento
// ---------------------------------------------------------------------------

export type CampaignSummary = {
  id: string;
  name: string;
  channel: "EMAIL" | "WHATSAPP";
  status: CampaignStatus;
  statusReason: string;
  total: number;
  counts: Record<
    "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "SKIPPED" | "CANCELED",
    number
  >;
  progress: number;
  nextSendAt: Date | null;
  batch?: { current: number; total: number };
  startedAt: Date | null;
  finishedAt: Date | null;
  createdBy: string;
};

export async function campaignSummary(db: PrismaClient, s: Scope): Promise<CampaignSummary | null> {
  const c = await findCampaign(db, s);
  if (!c) return null;
  const grouped = await db.messageDelivery.groupBy({
    by: ["status"],
    where: { campaignId: c.id },
    _count: { _all: true },
  });
  const counts = {
    QUEUED: 0,
    SENDING: 0,
    SENT: 0,
    DELIVERED: 0,
    READ: 0,
    FAILED: 0,
    SKIPPED: 0,
    CANCELED: 0,
  };
  for (const g of grouped) counts[g.status] = g._count._all;
  const sent = counts.SENT + counts.DELIVERED + counts.READ;
  const processed = sent + counts.FAILED + counts.CANCELED;
  const pacing = c.channel === "WHATSAPP" ? pacingSchema.safeParse(c.pacing) : null;
  const batchSize = pacing?.success ? pacing.data.batchSize : 0;
  return {
    id: c.id,
    name: c.name,
    channel: c.channel,
    status: c.status,
    statusReason: c.statusReason,
    total: c.total,
    counts,
    progress: c.total ? Math.round((processed / c.total) * 100) : 100,
    nextSendAt: ["RUNNING", "WAITING_WINDOW", "SCHEDULED"].includes(c.status) ? c.nextSendAt : null,
    ...(batchSize
      ? {
          batch: {
            current: Math.min(Math.floor(sent / batchSize) + 1, Math.ceil(c.total / batchSize)),
            total: Math.ceil(c.total / batchSize),
          },
        }
      : {}),
    startedAt: c.startedAt,
    finishedAt: c.finishedAt,
    createdBy: c.createdBy,
  };
}

// ---------------------------------------------------------------------------
// Pré-visualização do público (assistente de campanha)
// ---------------------------------------------------------------------------

export type AudiencePreview = {
  /** Pessoas que correspondem ao filtro */
  matched: number;
  /** Quantas receberão de fato neste canal */
  sendable: number;
  skippedByReason: Partial<Record<SkipReason, number>>;
  /** Amostra de quem será pulado, para o organizador corrigir cadastros */
  skippedSample: { name: string; reason: string }[];
  /** Amostra de destinatários (nome + destino mascarado) */
  sample: { name: string; target: string }[];
  estimate?: { days: number; activeMinutes: number };
};

/** Mesma expansão e as mesmas regras de pulo da criação — sem gravar nada. */
export async function previewAudience(
  db: PrismaClient,
  input: {
    tenantId: string;
    projectId?: string | null;
    channel: "EMAIL" | "WHATSAPP";
    audience: Audience;
    pacing?: z.input<typeof pacingSchema>;
  },
): Promise<Result<AudiencePreview>> {
  const audience = audienceSchema.safeParse(input.audience);
  if (!audience.success) return fail(audience.error.issues[0]?.message ?? "Público inválido.");
  if (audience.data.kind !== "members" && !input.projectId)
    return fail("Selecione o evento ou viagem do público.");
  const candidates = await expandAudience(db, input, audience.data);
  if (input.channel === "WHATSAPP") {
    const optOut = await whatsappOptOuts(db, input.tenantId, [
      ...new Set(candidates.map((c) => c.personId)),
    ]);
    for (const c of candidates) c.whatsappOptOut = optOut.has(c.personId);
  }
  const planned = planRecipients(candidates, input.channel);
  const skippedByReason: Partial<Record<SkipReason, number>> = {};
  for (const p of planned) if (p.skip) skippedByReason[p.skip] = (skippedByReason[p.skip] ?? 0) + 1;
  const sendable = planned.filter((p) => !p.skip);
  const pacing = input.channel === "WHATSAPP" ? pacingSchema.safeParse(input.pacing ?? {}) : null;
  return ok({
    matched: planned.length,
    sendable: sendable.length,
    skippedByReason,
    skippedSample: planned
      .filter((p) => p.skip)
      .slice(0, 8)
      .map((p) => ({ name: p.candidate.name, reason: SKIP_REASON_LABELS[p.skip!] })),
    sample: sendable.slice(0, 5).map((p) => ({ name: p.candidate.name, target: p.target })),
    ...(pacing?.success ? { estimate: estimateDuration(sendable.length, pacing.data) } : {}),
  });
}
