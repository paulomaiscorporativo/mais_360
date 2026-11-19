"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enabledProjectFeatures, splitFullName } from "@mais/core";
import type { Channel } from "@mais/core/messaging";
import { defineAction, v } from "@/server/action";
import { audit } from "@/server/audit";
import { AppError } from "@/server/errors";
import {
  cancelInvite,
  checkInByScan,
  createCompany,
  dispatchInvite,
  expireQuotas,
  issueInvite,
  openPassword,
  requireEventWriter,
  resetCompanyPassword,
  undoCheckIn,
} from "@/server/events";
import { requireTenant } from "@/server/auth";
import { modulesForTenant } from "@/server/modules";
import { tenantDb } from "@/server/tenant-db";

const ref = { tenant: z.string(), projectId: z.string() };
const channels = z.array(z.enum(["EMAIL", "WHATSAPP"])).min(1, "Escolha ao menos um canal.");

function refresh(tenant: string) {
  revalidatePath(`/console/[ws]/clientes/${tenant}/projetos/[project]`, "layout");
}

// ---------------------------------------------------------------------------
// Configurações do evento
// ---------------------------------------------------------------------------

const hotel = z.object({
  nome: z.string().trim().max(120),
  endereco: z.string().trim().max(200).default(""),
  telefone: z.string().trim().max(40).default(""),
  distancia: z.string().trim().max(40).default(""),
  link: z.string().trim().max(300).default(""),
});
const amenity = z.object({
  titulo: z.string().trim().max(80),
  descricao: z.string().trim().max(240).default(""),
});

export const saveEventSettings = defineAction(
  z.object({
    ...ref,
    eventTime: z
      .string()
      .trim()
      .regex(/^(|([01]\d|2[0-3]):[0-5]\d)$/, "Use o formato HH:MM.")
      .default(""),
    dressCode: v.optionalText(80),
    inviteDeadline: z.string().trim().default(""), // YYYY-MM-DD no fuso do projeto
    defaultQuota: z.coerce.number().int().min(1, "Cota mínima de 1.").max(200),
    autoSendOnCompanyRegistration: z.boolean(),
    allowCompanion: z.boolean(),
    venueName: v.optionalText(160),
    venueAddress: v.optionalText(240),
    description: v.optionalText(2000),
    hotels: z.array(hotel).max(20),
    amenities: z.array(amenity).max(20),
  }),
  async (i) => {
    const p = await requireEventWriter(i.tenant, i.projectId);
    const tz = p.project.timezone ?? p.tenant.timezone;
    // Data-limite vale até o fim do dia no fuso do projeto
    const deadline = i.inviteDeadline ? endOfDay(i.inviteDeadline, tz) : null;
    const data = {
      eventTime: i.eventTime,
      dressCode: i.dressCode,
      inviteDeadline: deadline,
      defaultQuota: i.defaultQuota,
      autoSendOnCompanyRegistration: i.autoSendOnCompanyRegistration,
      allowCompanion: i.allowCompanion,
      nearbyHotels: i.hotels.filter((h) => h.nome),
      amenities: i.amenities.filter((a) => a.titulo),
    };
    await p.db.eventInviteSettings.upsert({
      where: { projectId: p.projectId },
      create: { projectId: p.projectId, tenantId: p.tenantId, ...data },
      update: data,
    });
    await p.db.project.update({
      where: { id: p.projectId },
      data: { venueName: i.venueName, venueAddress: i.venueAddress, description: i.description },
    });
    await audit({
      action: "event.settings.update",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "Project",
      entityId: p.projectId,
    });
    refresh(i.tenant);
    return null;
  },
);

/** "2026-11-30" → 23:59:59 daquele dia no fuso informado. */
function endOfDay(ymd: string, tz: string): Date {
  const utc = new Date(`${ymd}T23:59:59Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(utc);
  const g = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  const local = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return new Date(utc.getTime() - (local - utc.getTime()));
}

/** Mensagem do convite: modelo do projeto com finalidade INVITE (editável também em Comunicação). */
export const saveInviteMessage = defineAction(
  z.object({
    ...ref,
    emailSubject: v.text("o assunto", 200),
    emailBody: v.text("o texto do e-mail", 20000),
    whatsappBody: v.text("o texto do WhatsApp", 4000),
  }),
  async (i) => {
    const p = await requireEventWriter(i.tenant, i.projectId);
    const existing = await p.db.messageTemplate.findFirst({
      where: { projectId: p.projectId, purpose: "INVITE", archivedAt: null },
    });
    const data = {
      emailSubject: i.emailSubject,
      emailBody: i.emailBody,
      whatsappBody: i.whatsappBody,
      includeActions: true,
    };
    if (existing) await p.db.messageTemplate.update({ where: { id: existing.id }, data });
    else
      await p.db.messageTemplate.create({
        data: {
          tenantId: p.tenantId,
          projectId: p.projectId,
          purpose: "INVITE",
          name: `Convite · ${p.project.name}`,
          ...data,
        },
      });
    refresh(i.tenant);
    return null;
  },
);

// ---------------------------------------------------------------------------
// Empresas com cota
// ---------------------------------------------------------------------------

const companyFields = z.object({
  companyName: v.text("o nome da empresa", 160),
  contactName: v.optionalText(120),
  contactRole: v.optionalText(120),
  email: z.union([v.email(), z.literal("")]).default(""),
  phone: z.string().trim().max(40).default(""),
  quota: z.coerce.number().int().min(1, "Cota mínima de 1.").max(500),
});

export const addCompany = defineAction(
  z.object({ ...ref, data: companyFields, sendInvite: z.boolean().default(false) }),
  async (i) => {
    const p = await requireEventWriter(i.tenant, i.projectId);
    const { company, password } = await createCompany(
      p.db,
      { tenantId: p.tenantId, projectId: p.projectId },
      i.data,
    );
    if (i.sendInvite) {
      const resp = await p.db.eventInvite.findFirst({
        where: { companyQuotaId: company.id, kind: "RESPONSIBLE" },
      });
      if (resp) await dispatchInvite(p, resp.registrationId, ["EMAIL", "WHATSAPP"]);
    }
    await audit({
      action: "event.company.create",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "CompanyQuota",
      entityId: company.id,
    });
    refresh(i.tenant);
    return { login: company.login, password };
  },
);

export const updateCompany = defineAction(
  z.object({ ...ref, id: z.string(), data: companyFields }),
  async (i) => {
    const p = await requireEventWriter(i.tenant, i.projectId);
    const c = await p.db.companyQuota.findFirst({
      where: { id: i.id, projectId: p.projectId },
      include: {
        _count: {
          select: { invites: { where: { registration: { status: { not: "CANCELED" } } } } },
        },
      },
    });
    if (!c) throw new AppError("Empresa não encontrada.");
    if (i.data.quota < c._count.invites)
      throw new AppError(
        `A empresa já usou ${c._count.invites} convite(s). A cota não pode ficar abaixo disso.`,
      );
    await p.db.companyQuota.update({
      where: { id: c.id },
      data: {
        companyName: i.data.companyName,
        contactName: i.data.contactName,
        contactRole: i.data.contactRole,
        email: i.data.email,
        phone: i.data.phone,
        quota: i.data.quota,
      },
    });
    refresh(i.tenant);
    return null;
  },
);

export const revealCompanyPassword = defineAction(
  z.object({ ...ref, id: z.string() }),
  async (i) => {
    const p = await requireEventWriter(i.tenant, i.projectId);
    const c = await p.db.companyQuota.findFirst({ where: { id: i.id, projectId: p.projectId } });
    if (!c) throw new AppError("Empresa não encontrada.");
    if (c.passwordChangedAt)
      throw new AppError("A empresa já trocou a senha. Gere uma nova se precisar.");
    await audit({
      action: "event.company.password.reveal",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "CompanyQuota",
      entityId: c.id,
    });
    return { login: c.login, password: openPassword(c.provisionalPasswordEnc) };
  },
);

export const regenerateCompanyPassword = defineAction(
  z.object({ ...ref, id: z.string() }),
  async (i) => {
    const p = await requireEventWriter(i.tenant, i.projectId);
    const c = await p.db.companyQuota.findFirst({ where: { id: i.id, projectId: p.projectId } });
    if (!c) throw new AppError("Empresa não encontrada.");
    const password = await resetCompanyPassword(p.db, c.id);
    await audit({
      action: "event.company.password.reset",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "CompanyQuota",
      entityId: c.id,
    });
    refresh(i.tenant);
    return { login: c.login, password };
  },
);

export const deleteCompany = defineAction(z.object({ ...ref, id: z.string() }), async (i) => {
  const p = await requireEventWriter(i.tenant, i.projectId);
  const c = await p.db.companyQuota.findFirst({
    where: { id: i.id, projectId: p.projectId },
    include: { _count: { select: { invites: { where: { kind: { not: "RESPONSIBLE" } } } } } },
  });
  if (!c) throw new AppError("Empresa não encontrada.");
  if (c._count.invites > 0)
    throw new AppError("A empresa já inscreveu convidados. Cancele os convites antes de excluir.");
  // O convite do responsável sai junto (a inscrição dele só existia por causa da cota)
  const resp = await p.db.eventInvite.findMany({
    where: { companyQuotaId: c.id, kind: "RESPONSIBLE" },
    select: { registrationId: true },
  });
  await p.db.registration.deleteMany({
    where: { id: { in: resp.map((r) => r.registrationId) }, projectId: p.projectId },
  });
  await p.db.companyQuota.delete({ where: { id: c.id } });
  refresh(i.tenant);
  return null;
});

export const processExpiration = defineAction(
  z.object({ ...ref, force: z.boolean().default(false) }),
  async (i) => {
    const p = await requireEventWriter(i.tenant, i.projectId);
    const plan = await expireQuotas(p.db, p, i.force);
    await audit({
      action: "event.quotas.expire",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId: p.projectId,
      data: { returned: plan.totalReturned, companies: plan.companies.length },
    });
    refresh(i.tenant);
    return { returned: plan.totalReturned, companies: plan.companies.length };
  },
);

// ---------------------------------------------------------------------------
// Convidados
// ---------------------------------------------------------------------------

export const addGuest = defineAction(
  z.object({
    ...ref,
    personId: z.string().nullable().default(null),
    fullName: z.string().trim().max(160).default(""),
    email: z.union([v.email(), z.literal("")]).default(""),
    phone: z.string().trim().max(40).default(""),
    company: v.optionalText(160),
    jobTitle: v.optionalText(120),
    companyQuotaId: z.string().nullable().default(null),
    categoryId: z.string().nullable().default(null),
    send: channels.optional(),
  }),
  async (i) => {
    const p = await requireEventWriter(i.tenant, i.projectId);
    if (!i.personId && i.fullName.length < 3) throw new AppError("Informe o nome do convidado.");
    const { firstName, lastName } = splitFullName(i.fullName);
    const reg = await issueInvite(p.db, p, {
      personId: i.personId ?? undefined,
      person: i.personId
        ? undefined
        : {
            firstName,
            lastName,
            email: i.email,
            phone: i.phone,
            organization: i.company,
            jobTitle: i.jobTitle,
          },
      kind: i.companyQuotaId ? "COMPANY_GUEST" : "INDIVIDUAL",
      companyQuotaId: i.companyQuotaId,
      displayCompany: i.company || undefined,
      categoryId: i.categoryId,
    });
    let sent = 0;
    if (i.send?.length) sent = (await dispatchInvite(p, reg.id, i.send)).sent;
    refresh(i.tenant);
    return { id: reg.id, sent };
  },
);

export const sendInvites = defineAction(
  z.object({ ...ref, ids: z.array(z.string()).min(1).max(1000), channels, resend: z.boolean() }),
  async (i) => {
    const p = await requireEventWriter(i.tenant, i.projectId);
    let sent = 0;
    const problems: string[] = [];
    for (const id of i.ids) {
      try {
        const r = await dispatchInvite(p, id, i.channels as Channel[], i.resend);
        sent += r.sent;
        problems.push(...r.skipped);
      } catch (err) {
        problems.push(err instanceof Error ? err.message : "Falha no envio.");
      }
    }
    await audit({
      action: "event.invites.send",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId: p.projectId,
      data: { count: i.ids.length, channels: i.channels, resend: i.resend },
    });
    refresh(i.tenant);
    return { sent, skipped: problems.length, sample: [...new Set(problems)].slice(0, 3) };
  },
);

export const cancelGuests = defineAction(
  z.object({ ...ref, ids: z.array(z.string()).min(1).max(1000), notify: z.boolean() }),
  async (i) => {
    const p = await requireEventWriter(i.tenant, i.projectId);
    for (const id of i.ids) await cancelInvite(p, id, p.viewer.user.name, i.notify);
    await audit({
      action: "event.invites.cancel",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId: p.projectId,
      data: { count: i.ids.length, notify: i.notify },
    });
    refresh(i.tenant);
    return null;
  },
);

export const reactivateGuest = defineAction(z.object({ ...ref, id: z.string() }), async (i) => {
  const p = await requireEventWriter(i.tenant, i.projectId);
  await p.db.registration.updateMany({
    where: { id: i.id, projectId: p.projectId, status: "CANCELED" },
    data: { status: "PENDING", canceledAt: null, canceledBy: "" },
  });
  refresh(i.tenant);
  return null;
});

export const setGuestStatus = defineAction(
  z.object({ ...ref, id: z.string(), status: z.enum(["CONFIRMED", "DECLINED", "PENDING"]) }),
  async (i) => {
    const p = await requireEventWriter(i.tenant, i.projectId);
    await p.db.registration.updateMany({
      where: { id: i.id, projectId: p.projectId, status: { not: "CANCELED" } },
      data: {
        status: i.status,
        confirmedAt: i.status === "CONFIRMED" ? new Date() : null,
      },
    });
    refresh(i.tenant);
    return null;
  },
);

// ---------------------------------------------------------------------------
// Check-in (balcão do evento: OPERATOR ou DESK)
// ---------------------------------------------------------------------------

/** Balcão: papel DESK ou acima, projeto ativo do cliente e convites ligados. */
async function deskProject(tenant: string, projectId: string) {
  const ctx = await requireTenant(tenant, "DESK");
  const db = tenantDb(ctx);
  const project = await db.project.findFirst({
    where: { id: projectId, archivedAt: null },
    include: { features: true },
  });
  if (!project) throw new AppError("Projeto não encontrado.");
  const features = enabledProjectFeatures(project.features, await modulesForTenant(ctx.tenant));
  if (!features.has("INVITES"))
    throw new AppError("Este recurso não está ligado no projeto.", "FORBIDDEN");
  return { ...ctx, db, project, scope: { tenantId: ctx.tenantId, projectId: project.id } };
}

export const checkIn = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), raw: z.string().max(400) }),
  async (i) => {
    const d = await deskProject(i.tenant, i.projectId);
    const r = await checkInByScan(d.scope, i.raw, d.viewer.user.name);
    if (r.ok && !r.already) {
      await audit({
        action: "registration.checkin",
        userId: d.viewer.user.id,
        tenantId: d.tenantId,
        projectId: d.project.id,
        entityType: "Registration",
        entityId: r.guest.id,
      });
    }
    return r;
  },
);

export const undoCheckInAction = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), id: z.string() }),
  async (i) => {
    const d = await deskProject(i.tenant, i.projectId);
    if (await undoCheckIn(d.scope, i.id))
      await audit({
        action: "registration.checkin.undo",
        userId: d.viewer.user.id,
        tenantId: d.tenantId,
        projectId: d.project.id,
        entityType: "Registration",
        entityId: i.id,
      });
    return null;
  },
);

export const checkinStats = defineAction(
  z.object({ tenant: z.string(), projectId: z.string() }),
  async (i) => {
    const d = await deskProject(i.tenant, i.projectId);
    const where = {
      projectId: d.project.id,
      role: "GUEST" as const,
      status: { not: "CANCELED" as const },
    };
    const [total, checked, confirmed] = await Promise.all([
      d.db.registration.count({ where }),
      d.db.registration.count({ where: { ...where, checkedInAt: { not: null } } }),
      d.db.registration.count({ where: { ...where, status: "CONFIRMED" } }),
    ]);
    return { total, checked, confirmed };
  },
);
