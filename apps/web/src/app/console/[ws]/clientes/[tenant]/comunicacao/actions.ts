"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enabledProjectFeatures } from "@mais/core";
import { AUTOMATION_LIMITS, AUTOMATION_TRIGGERS, scheduleChanged } from "@mais/core/automations";
import { audienceSchema } from "@mais/core/messaging";
import {
  previewAutomationAudience,
  runAutomationNow,
  campaignSummary,
  cancelCampaign,
  createCampaign,
  evolutionAdmin,
  globalEvolution,
  globalSmtp,
  openSecret,
  pauseCampaign,
  previewAudience,
  previewTemplate,
  resumeCampaign,
  sealSecret,
  sendTest,
  templateContentSchema,
  verifySmtpConnection,
  createEvolutionProvider,
} from "@mais/messaging";
import { defineAction, v } from "@/server/action";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { modulesForTenant } from "@/server/modules";
import { STARTERS } from "@/components/communication/starters";
import {
  defaultInstanceName,
  requireCommunication,
  type CommunicationContext,
} from "@/server/communication";

const ref = { tenant: z.string().min(1) };
const optionalId = z.string().min(1).nullish();

function unwrap<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new AppError(r.error);
  return r.data;
}

function revalidate(ctx: CommunicationContext) {
  revalidatePath(
    `/console/${ctx.workspace.slug}/clientes/${ctx.tenant.slug}/comunicacao`,
    "layout",
  );
}

async function ensureProject(ctx: CommunicationContext, projectId?: string | null) {
  if (!projectId) return null;
  const p = await ctx.db.project.findFirst({ where: { id: projectId }, select: { id: true } });
  if (!p) throw new AppError("Evento ou viagem não encontrado neste cliente.");
  return p.id;
}

const actor = (ctx: CommunicationContext) => ({
  userId: ctx.viewer.user.id,
  actorLabel: ctx.viewer.user.name,
  tenantId: ctx.tenantId,
});

function parseCfg(sealed: string): Record<string, string> {
  if (!sealed) return {};
  try {
    return JSON.parse(openSecret(sealed)) as Record<string, string>;
  } catch {
    return {};
  }
}

// ===========================================================================
// Canais
// ===========================================================================

const emailChannelSchema = z.object({
  ...ref,
  id: optionalId,
  projectId: optionalId,
  name: v.text("o nome do canal", 80),
  fromName: v.optionalText(120),
  fromEmail: z.union([v.email(), z.literal("")]).default(""),
  replyTo: z.union([v.email(), z.literal("")]).default(""),
  mode: z.enum(["global", "own"]),
  smtpHost: v.optionalText(200),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(587),
  smtpSecure: z.boolean().default(false),
  smtpUser: v.optionalText(200),
  /** Em branco ao editar = mantém a senha gravada */
  smtpPass: z.string().max(500).default(""),
});

function smtpFrom(input: z.infer<typeof emailChannelSchema>, storedPass: string) {
  return {
    host: input.smtpHost,
    port: input.smtpPort,
    secure: input.smtpSecure,
    user: input.smtpUser,
    pass: input.smtpPass || storedPass,
  };
}

export const saveEmailChannel = defineAction(emailChannelSchema, async (input) => {
  const ctx = await requireCommunication(input.tenant, "ADMIN");
  const projectId = await ensureProject(ctx, input.projectId);
  if (input.mode === "own" && !input.smtpHost) throw new AppError("Informe o servidor SMTP.");
  if (input.mode === "global" && !globalSmtp())
    throw new AppError("Não há servidor de e-mail global configurado. Use um servidor próprio.");
  const existing = input.id
    ? await ctx.db.messagingChannel.findFirst({ where: { id: input.id, kind: "EMAIL" } })
    : null;
  if (input.id && !existing) throw new AppError("Canal não encontrado.");
  const own = input.mode === "own";
  const data = {
    projectId,
    name: input.name,
    fromName: input.fromName,
    fromEmail: input.fromEmail,
    replyTo: input.replyTo,
    smtpHost: own ? input.smtpHost : "",
    smtpPort: own ? input.smtpPort : 587,
    smtpSecure: own ? input.smtpSecure : false,
    smtpUser: own ? input.smtpUser : "",
    smtpPassEnc: own
      ? input.smtpPass
        ? sealSecret(input.smtpPass)
        : (existing?.smtpPassEnc ?? "")
      : "",
  };
  const saved = existing
    ? await ctx.db.messagingChannel.update({ where: { id: existing.id }, data })
    : await ctx.db.messagingChannel.create({
        data: { ...data, tenantId: ctx.tenantId, kind: "EMAIL" },
      });
  await audit({
    ...actor(ctx),
    action: existing ? "messaging.channel.update" : "messaging.channel.create",
    entityType: "MessagingChannel",
    entityId: saved.id,
    data: { kind: "EMAIL", mode: input.mode, name: input.name },
  });
  revalidate(ctx);
  return { id: saved.id };
});

export const testEmailConnection = defineAction(
  emailChannelSchema,
  async (input) => {
    const ctx = await requireCommunication(input.tenant, "ADMIN");
    let stored = "";
    if (input.id && !input.smtpPass) {
      const c = await ctx.db.messagingChannel.findFirst({ where: { id: input.id } });
      stored = c ? openSecret(c.smtpPassEnc) : "";
    }
    const smtp = input.mode === "own" ? smtpFrom(input, stored) : globalSmtp()?.smtp;
    if (!smtp?.host) throw new AppError("Informe o servidor SMTP.");
    try {
      await verifySmtpConnection(smtp);
    } catch (e) {
      throw new AppError(`O servidor recusou a conexão: ${(e as Error).message}`);
    }
    return { host: smtp.host };
  },
  { readOnly: true },
);

const whatsappChannelSchema = z.object({
  ...ref,
  id: optionalId,
  projectId: optionalId,
  name: v.text("o nome do canal", 80),
  provider: z.enum(["EVOLUTION", "META_CLOUD", "WEBHOOK"]),
  waNumber: v.optionalText(30),
  instance: v.optionalText(60),
  evolutionMode: z.enum(["global", "own"]).default("global"),
  evolutionUrl: v.optionalText(300),
  evolutionApiKey: z.string().max(300).default(""),
  metaToken: z.string().max(1000).default(""),
  metaPhoneNumberId: v.optionalText(60),
  webhookUrl: v.optionalText(500),
  webhookToken: z.string().max(500).default(""),
});

export const saveWhatsappChannel = defineAction(whatsappChannelSchema, async (input) => {
  const ctx = await requireCommunication(input.tenant, "ADMIN");
  const projectId = await ensureProject(ctx, input.projectId);
  const existing = input.id
    ? await ctx.db.messagingChannel.findFirst({ where: { id: input.id, kind: "WHATSAPP" } })
    : null;
  if (input.id && !existing) throw new AppError("Canal não encontrado.");
  const prev = parseCfg(existing?.waConfigEnc ?? "");

  let cfg: Record<string, string> = {};
  let instance = "";
  if (input.provider === "EVOLUTION") {
    if (input.evolutionMode === "global" && !globalEvolution())
      throw new AppError(
        "A plataforma não tem servidor de WhatsApp configurado. Informe o endereço do seu servidor Evolution.",
      );
    if (input.evolutionMode === "own") {
      if (!/^https?:\/\//.test(input.evolutionUrl))
        throw new AppError("Informe o endereço do servidor Evolution (https://…).");
      cfg = {
        url: input.evolutionUrl.replace(/\/+$/, ""),
        apiKey: input.evolutionApiKey || prev.apiKey || "",
      };
      if (!cfg.apiKey) throw new AppError("Informe a chave de API do servidor Evolution.");
    }
    instance =
      input.instance.replace(/[^A-Za-z0-9_-]/g, "") ||
      existing?.waInstance ||
      defaultInstanceName(ctx.tenant.slug, projectId);
  } else if (input.provider === "META_CLOUD") {
    cfg = {
      token: input.metaToken || prev.token || "",
      phoneNumberId: input.metaPhoneNumberId,
    };
    if (!cfg.token || !cfg.phoneNumberId)
      throw new AppError("Informe o token de acesso e o ID do número da API oficial.");
  } else {
    if (!/^https?:\/\//.test(input.webhookUrl))
      throw new AppError("Informe a URL do webhook de envio (https://…).");
    cfg = { url: input.webhookUrl, token: input.webhookToken || prev.token || "" };
  }

  const data = {
    projectId,
    name: input.name,
    waProvider: input.provider,
    waNumber: input.waNumber,
    waInstance: instance,
    waConfigEnc: Object.keys(cfg).length ? sealSecret(JSON.stringify(cfg)) : "",
  };
  const saved = existing
    ? await ctx.db.messagingChannel.update({ where: { id: existing.id }, data })
    : await ctx.db.messagingChannel.create({
        data: { ...data, tenantId: ctx.tenantId, kind: "WHATSAPP" },
      });
  await audit({
    ...actor(ctx),
    action: existing ? "messaging.channel.update" : "messaging.channel.create",
    entityType: "MessagingChannel",
    entityId: saved.id,
    data: { kind: "WHATSAPP", provider: input.provider, name: input.name },
  });
  revalidate(ctx);
  return { id: saved.id };
});

/** Configuração Evolution do canal (própria ou global). */
async function evolutionOf(ctx: CommunicationContext, id: string) {
  const c = await ctx.db.messagingChannel.findFirst({ where: { id, kind: "WHATSAPP" } });
  if (!c) throw new AppError("Canal não encontrado.");
  const cfg = parseCfg(c.waConfigEnc);
  const g = globalEvolution();
  const url = cfg.url || g?.url;
  const apiKey = cfg.apiKey || g?.apiKey;
  return { channel: c, url, apiKey, instance: c.waInstance };
}

export type WhatsappLiveState = {
  state: "open" | "connecting" | "closed" | "not_found" | "unavailable" | "not_applicable";
  qr: string | null;
  message?: string;
};

async function liveState(ctx: CommunicationContext, id: string, connect: boolean) {
  const e = await evolutionOf(ctx, id);
  if (e.channel.waProvider !== "EVOLUTION") {
    return { state: "not_applicable", qr: null } satisfies WhatsappLiveState;
  }
  if (!e.url || !e.apiKey || !e.instance)
    return {
      state: "unavailable",
      qr: null,
      message: "Servidor de WhatsApp não configurado.",
    } satisfies WhatsappLiveState;
  const admin = evolutionAdmin({ url: e.url, apiKey: e.apiKey });
  const provider = createEvolutionProvider({ url: e.url, apiKey: e.apiKey, instance: e.instance });
  try {
    let state = await provider.connectionState();
    if (connect && state === "not_found") {
      await admin.createInstance(e.instance);
      state = "connecting";
    }
    if (state === "open") return { state, qr: null } satisfies WhatsappLiveState;
    if (connect || state === "connecting") {
      const qr = await admin.qrCode(e.instance);
      return { state: qr ? "connecting" : state, qr } satisfies WhatsappLiveState;
    }
    return { state, qr: null } satisfies WhatsappLiveState;
  } catch (err) {
    return {
      state: "unavailable",
      qr: null,
      message: (err as Error).message,
    } satisfies WhatsappLiveState;
  }
}

export const whatsappConnect = defineAction(
  z.object({ ...ref, id: z.string().min(1) }),
  async ({ tenant, id }) => {
    const ctx = await requireCommunication(tenant, "ADMIN");
    const r: WhatsappLiveState = await liveState(ctx, id, true);
    if (r.state === "open")
      await audit({
        ...actor(ctx),
        action: "messaging.whatsapp.connected",
        entityType: "MessagingChannel",
        entityId: id,
      });
    return r;
  },
);

export const whatsappStatus = defineAction(
  z.object({ ...ref, id: z.string().min(1) }),
  async ({ tenant, id }): Promise<WhatsappLiveState> => {
    const ctx = await requireCommunication(tenant, "VIEWER");
    return liveState(ctx, id, false);
  },
  { readOnly: true },
);

export const whatsappDisconnect = defineAction(
  z.object({ ...ref, id: z.string().min(1) }),
  async ({ tenant, id }) => {
    const ctx = await requireCommunication(tenant, "ADMIN");
    const e = await evolutionOf(ctx, id);
    if (e.url && e.apiKey && e.instance)
      await evolutionAdmin({ url: e.url, apiKey: e.apiKey }).logout(e.instance);
    await audit({
      ...actor(ctx),
      action: "messaging.whatsapp.disconnected",
      entityType: "MessagingChannel",
      entityId: id,
    });
    revalidate(ctx);
    return null;
  },
);

export const setChannelActive = defineAction(
  z.object({ ...ref, id: z.string().min(1), active: z.boolean() }),
  async ({ tenant, id, active }) => {
    const ctx = await requireCommunication(tenant, "ADMIN");
    const r = await ctx.db.messagingChannel.updateMany({ where: { id }, data: { active } });
    if (!r.count) throw new AppError("Canal não encontrado.");
    await audit({
      ...actor(ctx),
      action: active ? "messaging.channel.enable" : "messaging.channel.disable",
      entityType: "MessagingChannel",
      entityId: id,
    });
    revalidate(ctx);
    return null;
  },
);

export const deleteChannel = defineAction(
  z.object({ ...ref, id: z.string().min(1) }),
  async ({ tenant, id }) => {
    const ctx = await requireCommunication(tenant, "ADMIN");
    const running = await ctx.db.messageCampaign.count({
      where: {
        channelId: id,
        status: { in: ["RUNNING", "WAITING_WINDOW", "PAUSED", "SCHEDULED"] },
      },
    });
    if (running)
      throw new AppError("Há envios em andamento por este canal. Cancele-os antes de remover.");
    const r = await ctx.db.messagingChannel.deleteMany({ where: { id } });
    if (!r.count) throw new AppError("Canal não encontrado.");
    await audit({
      ...actor(ctx),
      action: "messaging.channel.delete",
      entityType: "MessagingChannel",
      entityId: id,
    });
    revalidate(ctx);
    return null;
  },
);

// ===========================================================================
// Modelos
// ===========================================================================

const purpose = z.enum([
  "CUSTOM",
  "INVITE",
  "INVITE_CANCEL",
  "REGISTRATION_CONFIRMED",
  "REMINDER",
  "CHECKIN_WELCOME",
  "VOUCHER",
  "TRAVEL_REQUEST_RECEIPT",
  "TRAVEL_QUOTE_READY",
  "APPROVAL_REQUEST",
  "PASSWORD_ACCESS",
  "SURVEY",
  "FLIGHT_REMINDER",
  "TRAVEL_DOCUMENTS",
]);

const templateSchema = z.object({
  ...ref,
  id: optionalId,
  projectId: optionalId,
  purpose: purpose.default("CUSTOM"),
  template: templateContentSchema,
});

export const saveTemplate = defineAction(templateSchema, async (input) => {
  const ctx = await requireCommunication(input.tenant, "MANAGER");
  const projectId = await ensureProject(ctx, input.projectId);
  const t = input.template;
  if (!t.emailBody.trim() && !t.whatsappBody.trim())
    throw new AppError("Escreva o texto do e-mail ou do WhatsApp.");
  const data = {
    projectId,
    purpose: input.purpose,
    name: t.name,
    emailSubject: t.emailSubject,
    emailBody: t.emailBody,
    whatsappBody: t.whatsappBody,
    includeActions: t.includeActions,
  };
  const existing = input.id
    ? await ctx.db.messageTemplate.findFirst({ where: { id: input.id, archivedAt: null } })
    : null;
  if (input.id && !existing) throw new AppError("Modelo não encontrado.");
  const saved = existing
    ? await ctx.db.messageTemplate.update({ where: { id: existing.id }, data })
    : await ctx.db.messageTemplate.create({ data: { ...data, tenantId: ctx.tenantId } });
  await audit({
    ...actor(ctx),
    action: existing ? "messaging.template.update" : "messaging.template.create",
    entityType: "MessageTemplate",
    entityId: saved.id,
    data: { name: t.name },
  });
  revalidate(ctx);
  return { id: saved.id };
});

export const duplicateTemplate = defineAction(
  z.object({ ...ref, id: z.string().min(1) }),
  async ({ tenant, id }) => {
    const ctx = await requireCommunication(tenant, "MANAGER");
    const t = await ctx.db.messageTemplate.findFirst({ where: { id, archivedAt: null } });
    if (!t) throw new AppError("Modelo não encontrado.");
    const copy = await ctx.db.messageTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        projectId: t.projectId,
        purpose: t.purpose,
        name: `${t.name} (cópia)`.slice(0, 120),
        emailSubject: t.emailSubject,
        emailBody: t.emailBody,
        whatsappBody: t.whatsappBody,
        includeActions: t.includeActions,
      },
    });
    revalidate(ctx);
    return { id: copy.id };
  },
);

export const archiveTemplate = defineAction(
  z.object({ ...ref, id: z.string().min(1) }),
  async ({ tenant, id }) => {
    const ctx = await requireCommunication(tenant, "MANAGER");
    const inUse = await ctx.db.messageAutomation.count({ where: { templateId: id, active: true } });
    if (inUse)
      throw new AppError(
        `Este modelo é usado por ${inUse} régua(s) ativa(s). Desative-as antes de arquivar.`,
      );
    const r = await ctx.db.messageTemplate.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!r.count) throw new AppError("Modelo não encontrado.");
    await audit({
      ...actor(ctx),
      action: "messaging.template.archive",
      entityType: "MessageTemplate",
      entityId: id,
    });
    revalidate(ctx);
    return null;
  },
);

export const previewTemplateAction = defineAction(
  z.object({
    ...ref,
    projectId: optionalId,
    registrationId: optionalId,
    template: z.object({
      name: z.string().default(""),
      emailSubject: z.string().default(""),
      emailBody: z.string().default(""),
      whatsappBody: z.string().default(""),
      includeActions: z.boolean().default(true),
    }),
  }),
  async ({ tenant, projectId, registrationId, template }) => {
    const ctx = await requireCommunication(tenant, "VIEWER");
    const r = unwrap(
      await previewTemplate(prisma, {
        tenantId: ctx.tenantId,
        projectId: projectId ?? null,
        registrationId: registrationId ?? null,
        template: { ...template, name: template.name || "Pré-visualização" },
      }),
    );
    return {
      subject: r.email.subject,
      html: r.email.html,
      whatsapp: r.whatsapp,
      sample: r.sample,
      unknownFields: r.unknownFields,
    };
  },
  { readOnly: true },
);

export const sendTestAction = defineAction(
  z.object({
    ...ref,
    projectId: optionalId,
    channel: z.enum(["EMAIL", "WHATSAPP"]),
    to: z.string().trim().min(1, "Informe para onde enviar o teste."),
    template: templateContentSchema,
  }),
  async ({ tenant, projectId, channel, to, template }) => {
    const ctx = await requireCommunication(tenant, "MANAGER");
    return unwrap(
      await sendTest(prisma, {
        tenantId: ctx.tenantId,
        projectId: projectId ?? null,
        channel,
        to,
        template,
      }),
    );
  },
);

// ===========================================================================
// Campanhas
// ===========================================================================

const pacingInput = z
  .object({
    preset: z.enum(["cauteloso", "moderado", "personalizado"]),
    intervalMinS: z.number().optional(),
    intervalMaxS: z.number().optional(),
    batchSize: z.number().optional(),
    batchPauseMinM: z.number().optional(),
    batchPauseMaxM: z.number().optional(),
    dailyLimit: z.number().optional(),
    windowStart: z.string().optional(),
    windowEnd: z.string().optional(),
  })
  .optional();

const campaignBase = {
  ...ref,
  projectId: optionalId,
  channel: z.enum(["EMAIL", "WHATSAPP"]),
  audience: audienceSchema,
  pacing: pacingInput,
};

export const previewAudienceAction = defineAction(
  z.object(campaignBase),
  async ({ tenant, projectId, channel, audience, pacing }) => {
    const ctx = await requireCommunication(tenant, "VIEWER");
    return unwrap(
      await previewAudience(prisma, {
        tenantId: ctx.tenantId,
        projectId: projectId ?? null,
        channel,
        audience,
        pacing,
      }),
    );
  },
  { readOnly: true },
);

export const createCampaignAction = defineAction(
  z.object({
    ...campaignBase,
    name: z.string().trim().max(160).optional(),
    templateId: z.string().min(1),
    scheduledAt: z.string().datetime().nullish(),
  }),
  async (input) => {
    const ctx = await requireCommunication(input.tenant, "MANAGER");
    await ensureProject(ctx, input.projectId);
    const r = unwrap(
      await createCampaign(prisma, {
        tenantId: ctx.tenantId,
        projectId: input.projectId ?? null,
        channel: input.channel,
        name: input.name,
        templateId: input.templateId,
        audience: input.audience,
        pacing: input.channel === "WHATSAPP" ? input.pacing : undefined,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        createdBy: ctx.viewer.user.name,
      }),
    );
    await audit({
      ...actor(ctx),
      projectId: input.projectId ?? null,
      action: "messaging.campaign.create",
      entityType: "MessageCampaign",
      entityId: r.campaignId,
      data: { channel: input.channel, total: r.total, skipped: r.skipped },
    });
    revalidate(ctx);
    return r;
  },
);

const campaignRef = z.object({ ...ref, id: z.string().min(1) });

export const pauseCampaignAction = defineAction(campaignRef, async ({ tenant, id }) => {
  const ctx = await requireCommunication(tenant, "MANAGER");
  unwrap(
    await pauseCampaign(prisma, {
      tenantId: ctx.tenantId,
      campaignId: id,
      actor: ctx.viewer.user.name,
    }),
  );
  await audit({
    ...actor(ctx),
    action: "messaging.campaign.pause",
    entityType: "MessageCampaign",
    entityId: id,
  });
  revalidate(ctx);
  return null;
});

export const resumeCampaignAction = defineAction(campaignRef, async ({ tenant, id }) => {
  const ctx = await requireCommunication(tenant, "MANAGER");
  unwrap(await resumeCampaign(prisma, { tenantId: ctx.tenantId, campaignId: id }));
  await audit({
    ...actor(ctx),
    action: "messaging.campaign.resume",
    entityType: "MessageCampaign",
    entityId: id,
  });
  revalidate(ctx);
  return null;
});

export const cancelCampaignAction = defineAction(campaignRef, async ({ tenant, id }) => {
  const ctx = await requireCommunication(tenant, "MANAGER");
  const r = unwrap(
    await cancelCampaign(prisma, {
      tenantId: ctx.tenantId,
      campaignId: id,
      actor: ctx.viewer.user.name,
    }),
  );
  await audit({
    ...actor(ctx),
    action: "messaging.campaign.cancel",
    entityType: "MessageCampaign",
    entityId: id,
    data: r,
  });
  revalidate(ctx);
  return r;
});

type DeliveryStatusName =
  "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "SKIPPED" | "CANCELED";

export type LiveDelivery = {
  id: string;
  name: string;
  target: string;
  status: DeliveryStatusName;
  error: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
};

/** Acompanhamento ao vivo: resumo + página de destinatários filtrada. */
export const campaignLive = defineAction(
  z.object({
    ...ref,
    id: z.string().min(1),
    filter: z.enum(["ALL", "SENT", "PENDING", "PROBLEM"]).default("ALL"),
    q: z.string().trim().max(120).default(""),
    take: z.number().int().min(10).max(500).default(100),
  }),
  async ({ tenant, id, filter, q, take }) => {
    const ctx = await requireCommunication(tenant, "VIEWER");
    const summary = await campaignSummary(prisma, { tenantId: ctx.tenantId, campaignId: id });
    if (!summary) throw new AppError("Envio não encontrado.");
    const statusIn: Record<typeof filter, DeliveryStatusName[] | undefined> = {
      ALL: undefined,
      SENT: ["SENT", "DELIVERED", "READ"],
      PENDING: ["QUEUED", "SENDING"],
      PROBLEM: ["FAILED", "SKIPPED", "CANCELED"],
    };
    const where = {
      campaignId: id,
      ...(statusIn[filter] ? { status: { in: statusIn[filter] } } : {}),
      ...(q
        ? {
            OR: [
              { recipientName: { contains: q, mode: "insensitive" as const } },
              { target: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [rows, matched] = await Promise.all([
      ctx.db.messageDelivery.findMany({
        where,
        orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
        take,
        select: {
          id: true,
          recipientName: true,
          target: true,
          status: true,
          error: true,
          sentAt: true,
          deliveredAt: true,
          readAt: true,
        },
      }),
      ctx.db.messageDelivery.count({ where }),
    ]);
    return {
      summary: {
        ...summary,
        nextSendAt: summary.nextSendAt?.toISOString() ?? null,
        startedAt: summary.startedAt?.toISOString() ?? null,
        finishedAt: summary.finishedAt?.toISOString() ?? null,
      },
      matched,
      rows: rows.map((d): LiveDelivery => ({
        id: d.id,
        name: d.recipientName,
        target: d.target,
        status: d.status,
        error: d.error,
        sentAt: d.sentAt?.toISOString() ?? null,
        deliveredAt: d.deliveredAt?.toISOString() ?? null,
        readAt: d.readAt?.toISOString() ?? null,
      })),
    };
  },
  { readOnly: true },
);

/** Inscrições de um projeto para a seleção manual de destinatários. */
export const searchRegistrations = defineAction(
  z.object({ ...ref, projectId: z.string().min(1), q: z.string().trim().max(120).default("") }),
  async ({ tenant, projectId, q }) => {
    const ctx = await requireCommunication(tenant, "VIEWER");
    await ensureProject(ctx, projectId);
    const rows = await ctx.db.registration.findMany({
      where: {
        projectId,
        status: { not: "CANCELED" },
        ...(q
          ? {
              person: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      take: 50,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        displayCompany: true,
        person: { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: `${r.person.firstName} ${r.person.lastName}`.trim(),
      detail: r.person.email || r.person.phone || r.displayCompany,
    }));
  },
  { readOnly: true },
);

/** Opções de filtro de público de um projeto (categorias e grupos). */
export const projectAudienceOptions = defineAction(
  z.object({ ...ref, projectId: z.string().min(1) }),
  async ({ tenant, projectId }) => {
    const ctx = await requireCommunication(tenant, "VIEWER");
    await ensureProject(ctx, projectId);
    const [categories, groups] = await Promise.all([
      ctx.db.registrationCategory.findMany({
        where: { projectId },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, color: true },
      }),
      ctx.db.projectGroup.findMany({
        where: { projectId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, color: true },
      }),
    ]);
    return { categories, groups };
  },
  { readOnly: true },
);

// ===========================================================================
// Réguas automáticas
// ===========================================================================

const automationSchema = z.object({
  ...ref,
  id: optionalId,
  projectId: z.string().min(1, "Escolha o evento ou viagem."),
  templateId: z.string().min(1, "Escolha o modelo da mensagem."),
  trigger: z.enum(AUTOMATION_TRIGGERS),
  offsetDays: z.coerce.number().int().min(0).max(AUTOMATION_LIMITS.offsetDays).default(0),
  offsetHours: z.coerce
    .number()
    .int()
    .min(0)
    .max(AUTOMATION_LIMITS.offsetHours, "No máximo 14 dias (336 horas) antes do voo.")
    .default(0),
  sendAt: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM.")
    .default("09:00"),
  repeatEveryDays: z.coerce
    .number()
    .int()
    .min(0)
    .max(AUTOMATION_LIMITS.repeatEveryDays, "Repita no máximo a cada 30 dias.")
    .default(0),
  maxSends: z.coerce
    .number()
    .int()
    .min(1, "Envie ao menos uma vez.")
    .max(AUTOMATION_LIMITS.maxSends, "No máximo 10 envios por pessoa.")
    .default(1),
  channels: z.array(z.enum(["EMAIL", "WHATSAPP"])).min(1, "Escolha ao menos um canal."),
  filter: z
    .object({
      roles: z.array(z.string()).optional(),
      statuses: z.array(z.string()).optional(),
      categoryIds: z.array(z.string()).optional(),
    })
    .default({}),
  active: z.boolean().default(true),
});

/** Recurso do projeto exigido por cada gatilho (checado no servidor, não só na tela). */
const TRIGGER_FEATURE: Partial<
  Record<string, { feature: "FLIGHTS" | "DOCUMENTS" | "INVITES"; label: string }>
> = {
  FLIGHT_DEPARTURE_BEFORE: { feature: "FLIGHTS", label: "voos" },
  PASSPORT_EXPIRING: { feature: "DOCUMENTS", label: "documentos do viajante" },
  DOCUMENTS_PENDING: { feature: "DOCUMENTS", label: "documentos do viajante" },
  INVITE_DEADLINE_BEFORE: { feature: "INVITES", label: "convites com cota" },
};

async function assertTriggerFits(ctx: CommunicationContext, projectId: string, trigger: string) {
  const need = TRIGGER_FEATURE[trigger];
  if (!need) return;
  const project = await ctx.db.project.findFirst({
    where: { id: projectId },
    select: { features: { select: { feature: true, enabled: true } } },
  });
  const features = enabledProjectFeatures(
    project?.features ?? [],
    await modulesForTenant(ctx.tenant),
  );
  if (!features.has(need.feature))
    throw new AppError(`Este gatilho precisa do recurso de ${need.label} ligado no projeto.`);
}

export const saveAutomation = defineAction(automationSchema, async (input) => {
  const ctx = await requireCommunication(input.tenant, "MANAGER");
  await ensureProject(ctx, input.projectId);
  await assertTriggerFits(ctx, input.projectId, input.trigger);
  const tpl = await ctx.db.messageTemplate.findFirst({
    where: { id: input.templateId, archivedAt: null },
    select: { id: true, emailSubject: true, emailBody: true, whatsappBody: true },
  });
  if (!tpl) throw new AppError("Modelo não encontrado.");
  if (input.channels.includes("EMAIL") && (!tpl.emailSubject.trim() || !tpl.emailBody.trim()))
    throw new AppError("O modelo escolhido não tem a versão de e-mail completa (assunto e texto).");
  if (input.channels.includes("WHATSAPP") && !tpl.whatsappBody.trim() && !tpl.emailBody.trim())
    throw new AppError("O modelo escolhido não tem texto para WhatsApp.");
  const flight = input.trigger === "FLIGHT_DEPARTURE_BEFORE";
  if (flight && input.offsetHours < 1)
    throw new AppError("Informe com quantas horas de antecedência o lembrete sai.");
  const repeats = input.trigger === "PASSPORT_EXPIRING" || input.trigger === "DOCUMENTS_PENDING";
  const schedule = {
    trigger: input.trigger,
    offsetDays: flight ? 0 : input.offsetDays,
    offsetHours: flight ? input.offsetHours : 0,
    sendAt: input.sendAt,
    repeatEveryDays: repeats ? input.repeatEveryDays : 0,
    maxSends: repeats && input.repeatEveryDays > 0 ? input.maxSends : 1,
  };
  const existing = input.id
    ? await ctx.db.messageAutomation.findFirst({ where: { id: input.id } })
    : null;
  if (input.id && !existing) throw new AppError("Régua não encontrada.");
  // Ligada ou reagendada agora: vale daqui em diante (nada retroativo)
  const renew = scheduleChanged(existing, { ...schedule, active: input.active });
  const data = {
    projectId: input.projectId,
    templateId: input.templateId,
    ...schedule,
    channels: input.channels,
    filter: input.filter,
    active: input.active,
    ...(renew ? { activatedAt: new Date() } : {}),
  };
  const saved = existing
    ? await ctx.db.messageAutomation.update({ where: { id: existing.id }, data })
    : await ctx.db.messageAutomation.create({ data: { ...data, tenantId: ctx.tenantId } });
  await audit({
    ...actor(ctx),
    projectId: input.projectId,
    action: existing ? "messaging.automation.update" : "messaging.automation.create",
    entityType: "MessageAutomation",
    entityId: saved.id,
    data: { ...schedule, channels: input.channels, active: input.active },
  });
  revalidate(ctx);
  return { id: saved.id };
});

export const setAutomationActive = defineAction(
  z.object({ ...ref, id: z.string().min(1), active: z.boolean() }),
  async ({ tenant, id, active }) => {
    const ctx = await requireCommunication(tenant, "MANAGER");
    const before = await ctx.db.messageAutomation.findFirst({
      where: { id },
      select: { active: true, projectId: true },
    });
    if (!before) throw new AppError("Régua não encontrada.");
    // Religar vale daqui em diante: o que passou enquanto estava desligada não sai
    await ctx.db.messageAutomation.updateMany({
      where: { id },
      data: { active, ...(active && !before.active ? { activatedAt: new Date() } : {}) },
    });
    await audit({
      ...actor(ctx),
      projectId: before.projectId,
      action: active ? "messaging.automation.activate" : "messaging.automation.deactivate",
      entityType: "MessageAutomation",
      entityId: id,
    });
    revalidate(ctx);
    return null;
  },
);

/** Prévia: quem receberia o próximo disparo (nas réguas por evento, quem se encaixa hoje). */
export const previewAutomation = defineAction(
  z.object({ ...ref, id: z.string().min(1) }),
  async ({ tenant, id }) => {
    const ctx = await requireCommunication(tenant);
    const p = await previewAutomationAudience(prisma, ctx.tenantId, id);
    if (!p) throw new AppError("Régua não encontrada.");
    return p;
  },
  { readOnly: true },
);

/** Antecipa o próximo disparo de uma régua por data (registrado na auditoria). */
export const runAutomationNowAction = defineAction(
  z.object({ ...ref, id: z.string().min(1) }),
  async ({ tenant, id }) => {
    const ctx = await requireCommunication(tenant, "MANAGER");
    const a = await ctx.db.messageAutomation.findFirst({
      where: { id },
      select: { projectId: true },
    });
    if (!a) throw new AppError("Régua não encontrada.");
    const r = await runAutomationNow(prisma, ctx.tenantId, id);
    if (!r.ok) throw new AppError(r.error);
    await audit({
      ...actor(ctx),
      projectId: a.projectId,
      action: "messaging.automation.run_now",
      entityType: "MessageAutomation",
      entityId: id,
      data: { occurrence: r.occurrenceKey },
    });
    revalidate(ctx);
    return { occurrenceKey: r.occurrenceKey };
  },
);

/** Cria um modelo a partir de um modelo inicial (cliente ainda sem modelo da finalidade). */
export const createStarterTemplate = defineAction(
  z.object({ ...ref, starterId: z.string().min(1), projectId: optionalId }),
  async ({ tenant, starterId, projectId }) => {
    const ctx = await requireCommunication(tenant, "MANAGER");
    const starter = STARTERS.find((s) => s.id === starterId && s.id !== "blank");
    if (!starter) throw new AppError("Modelo inicial não encontrado.");
    const pid = await ensureProject(ctx, projectId);
    const saved = await ctx.db.messageTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        projectId: pid,
        purpose: purpose.parse(starter.purpose),
        name: starter.name,
        emailSubject: starter.emailSubject,
        emailBody: starter.emailBody,
        whatsappBody: starter.whatsappBody,
        includeActions: starter.includeActions,
      },
    });
    await audit({
      ...actor(ctx),
      action: "messaging.template.create",
      entityType: "MessageTemplate",
      entityId: saved.id,
      data: { name: saved.name, starter: starter.id },
    });
    revalidate(ctx);
    return { id: saved.id, name: saved.name, projectId: saved.projectId };
  },
);

export const deleteAutomation = defineAction(
  z.object({ ...ref, id: z.string().min(1) }),
  async ({ tenant, id }) => {
    const ctx = await requireCommunication(tenant, "MANAGER");
    const r = await ctx.db.messageAutomation.deleteMany({ where: { id } });
    if (!r.count) throw new AppError("Régua não encontrada.");
    await audit({
      ...actor(ctx),
      action: "messaging.automation.delete",
      entityType: "MessageAutomation",
      entityId: id,
    });
    revalidate(ctx);
    return null;
  },
);
