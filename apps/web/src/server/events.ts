import "server-only";
import { randomInt } from "node:crypto";
import {
  canCompanyRegister,
  companyLogin,
  inviteStatus,
  parseScan,
  planQuotaExpiration,
  provisionalPassword,
  type InviteStatus,
} from "@mais/core";
import { encryptSecret, decryptSecret, parseKey } from "@mais/core/crypto";
import type { Channel } from "@mais/core/messaging";
import type { InviteKind, Prisma } from "@mais/db";
import type { ProjectFeature } from "@mais/core";
import { sendTransactional } from "@mais/messaging";
import { prisma } from "./db";
import { AppError } from "./errors";
import { hashPassword } from "./password";
import { upsertPerson, type PersonInput } from "./people";
import { newRegistrationToken, requireProjectWriter, shortCodeAllocator } from "./projects";
import type { TenantDb } from "./tenant-db";

/**
 * EVENTOS E CONVITES — serviços de servidor (Mais 360 Events).
 *
 * O convidado é uma Registration; aqui ficam cotas das empresas, emissão e
 * disparo do convite, cancelamento, expiração da data-limite e check-in.
 * As regras puras estão em @mais/core/events.
 */

let key: Buffer | null = null;
const secretKey = () => (key ??= parseKey(process.env.ENCRYPTION_KEY));
export const sealPassword = (plain: string) => encryptSecret(plain, secretKey());
export function openPassword(enc: string): string {
  if (!enc) return "";
  try {
    return decryptSecret(enc, secretKey());
  } catch {
    return "";
  }
}

/**
 * Para Server Actions do módulo: permissão de edição + recurso ligado no
 * projeto (a tela esconder não basta — CLAUDE.md).
 */
export async function requireEventWriter(
  tenantSlug: string,
  projectId: string,
  feature: ProjectFeature = "INVITES",
) {
  const p = await requireProjectWriter(tenantSlug, projectId);
  if (!p.features.has(feature))
    throw new AppError("Este recurso não está ligado no projeto.", "FORBIDDEN");
  return p;
}

// ---------------------------------------------------------------------------
// Configurações do evento
// ---------------------------------------------------------------------------

export async function eventSettings(db: TenantDb, projectId: string) {
  return (
    (await db.eventInviteSettings.findFirst({ where: { projectId } })) ?? {
      projectId,
      tenantId: "",
      eventTime: "",
      dressCode: "",
      inviteDeadline: null,
      individualPool: 0,
      quotasExpiredAt: null,
      nearbyHotels: [],
      amenities: [],
      defaultQuota: 4,
      autoSendOnCompanyRegistration: true,
      allowCompanion: false,
      updatedAt: new Date(0),
    }
  );
}

// ---------------------------------------------------------------------------
// Empresas com cota
// ---------------------------------------------------------------------------

const ACTIVE = { registration: { status: { not: "CANCELED" as const } } };

/** Empresas do projeto com o uso da cota (convites ativos). */
export async function companiesWithUsage(db: TenantDb, projectId: string) {
  const rows = await db.companyQuota.findMany({
    where: { projectId },
    orderBy: { companyName: "asc" },
    include: {
      _count: { select: { invites: { where: ACTIVE } } },
      invites: {
        where: { kind: "RESPONSIBLE", ...ACTIVE },
        include: { registration: { include: { person: true } } },
        take: 1,
      },
    },
  });
  return rows.map((c) => ({ ...c, used: c._count.invites }));
}

export async function createCompany(
  db: TenantDb,
  ctx: { tenantId: string; projectId: string },
  input: {
    companyName: string;
    contactName: string;
    contactRole: string;
    email: string;
    phone: string;
    quota: number;
    organizationId?: string | null;
  },
) {
  // Login é único na plataforma inteira (a empresa entra pelo domínio do cliente)
  const base = companyLogin(input.companyName, () => false);
  const taken = new Set(
    (
      await prisma.companyQuota.findMany({
        where: { login: { startsWith: base } },
        select: { login: true },
      })
    ).map((c) => c.login),
  );
  const login = companyLogin(input.companyName, (l) => taken.has(l));
  const password = provisionalPassword(randomInt);

  // Vincula/cria a empresa no cadastro do cliente
  let organizationId = input.organizationId ?? null;
  if (!organizationId) {
    const existing = await db.organization.findFirst({
      where: { archivedAt: null, name: { equals: input.companyName.trim(), mode: "insensitive" } },
    });
    organizationId =
      existing?.id ??
      (
        await db.organization.create({
          data: { tenantId: ctx.tenantId, name: input.companyName.trim() },
        })
      ).id;
  }

  const company = await db.companyQuota.create({
    data: {
      tenantId: ctx.tenantId,
      projectId: ctx.projectId,
      organizationId,
      companyName: input.companyName.trim(),
      contactName: input.contactName,
      contactRole: input.contactRole,
      email: input.email,
      phone: input.phone,
      quota: input.quota,
      login,
      passwordHash: await hashPassword(password),
      provisionalPasswordEnc: sealPassword(password),
    },
  });

  // O responsável já entra inscrito (ocupa uma vaga da cota), como no legado
  if (input.contactName.trim()) {
    await issueInvite(db, ctx, {
      person: {
        firstName: input.contactName.split(" ")[0] ?? input.contactName,
        lastName: input.contactName.split(" ").slice(1).join(" "),
        email: input.email,
        phone: input.phone,
        jobTitle: input.contactRole,
        organization: input.companyName,
      },
      kind: "RESPONSIBLE",
      companyQuotaId: company.id,
      skipQuotaCheck: true,
    });
  }
  return { company, password };
}

export async function resetCompanyPassword(db: TenantDb, companyId: string) {
  const password = provisionalPassword(randomInt);
  await db.companyQuota.update({
    where: { id: companyId },
    data: {
      passwordHash: await hashPassword(password),
      provisionalPasswordEnc: sealPassword(password),
      passwordChangedAt: null,
    },
  });
  // Derruba sessões abertas da empresa
  await prisma.session.updateMany({
    where: { kind: "COMPANY", subjectId: companyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return password;
}

// ---------------------------------------------------------------------------
// Convites
// ---------------------------------------------------------------------------

export type IssueInviteInput = {
  personId?: string;
  person?: PersonInput;
  kind: InviteKind;
  companyQuotaId?: string | null;
  displayCompany?: string;
  categoryId?: string | null;
  /** O responsável é inscrito na criação da empresa, fora da checagem de cota */
  skipQuotaCheck?: boolean;
};

/** Emite um convite: pessoa (deduplicada) + inscrição GUEST + dados do convite. */
export async function issueInvite(
  db: TenantDb,
  ctx: { tenantId: string; projectId: string },
  input: IssueInviteInput,
) {
  let company: { id: string; companyName: string; quota: number; lockedAt: Date | null } | null =
    null;
  if (input.companyQuotaId) {
    company = await db.companyQuota.findFirst({
      where: { id: input.companyQuotaId, projectId: ctx.projectId },
      select: { id: true, companyName: true, quota: true, lockedAt: true },
    });
    if (!company) throw new AppError("Empresa não encontrada neste evento.");
  }

  const settings = await eventSettings(db, ctx.projectId);
  if (company && !input.skipQuotaCheck) {
    const used = await db.eventInvite.count({
      where: { companyQuotaId: company.id, ...ACTIVE },
    });
    const check = canCompanyRegister(
      { quota: company.quota, used, lockedAt: company.lockedAt },
      settings.inviteDeadline,
    );
    if (!check.ok) throw new AppError(check.message);
  }
  if (input.kind === "INDIVIDUAL") {
    const used = await db.eventInvite.count({
      where: { projectId: ctx.projectId, kind: "INDIVIDUAL", ...ACTIVE },
    });
    // Pool só limita depois de processada a expiração (antes, a organização convida livremente)
    if (settings.quotasExpiredAt && used >= settings.individualPool)
      throw new AppError("Não há convites livres no pool da organização.");
  }

  let personId = input.personId;
  if (!personId) {
    if (!input.person) throw new AppError("Informe o convidado.");
    personId = (await upsertPerson(db, ctx.tenantId, input.person)).person.id;
  }

  const existing = await db.registration.findFirst({
    where: { projectId: ctx.projectId, personId, role: "GUEST" },
    include: { invite: true },
  });
  if (existing && existing.status !== "CANCELED")
    throw new AppError("Esta pessoa já tem convite neste evento.");

  const nextCode = await shortCodeAllocator(db, ctx.projectId);
  const displayCompany =
    input.displayCompany ?? company?.companyName ?? input.person?.organization ?? "";

  const registration = existing
    ? await db.registration.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          canceledAt: null,
          canceledBy: "",
          checkedInAt: null,
          displayCompany,
        },
      })
    : await db.registration.create({
        data: {
          tenantId: ctx.tenantId,
          projectId: ctx.projectId,
          personId,
          role: "GUEST",
          status: "PENDING",
          source: company ? "COMPANY_QUOTA" : "MANUAL",
          categoryId: input.categoryId ?? null,
          displayCompany,
          displayJobTitle: input.person?.jobTitle ?? "",
          token: newRegistrationToken(),
          shortCode: nextCode(),
        },
      });

  await db.eventInvite.upsert({
    where: { registrationId: registration.id },
    create: {
      registrationId: registration.id,
      tenantId: ctx.tenantId,
      projectId: ctx.projectId,
      companyQuotaId: company?.id ?? null,
      kind: input.kind,
    },
    update: { companyQuotaId: company?.id ?? null, kind: input.kind, sentAt: null },
  });
  return registration;
}

/** Modelos padrão quando o cliente ainda não criou os seus em Comunicação. */
export const DEFAULT_INVITE = {
  name: "Convite (padrão)",
  emailSubject: "Você está convidado(a) · {{projeto}}",
  emailBody: [
    "Olá, {{primeiro_nome}}!",
    "",
    "Temos a alegria de convidar você para **{{projeto}}**.",
    "",
    "**Quando:** {{data_inicio}} às {{hora_inicio}}",
    "**Onde:** {{local}} — {{endereco}}",
    "**Traje:** {{traje}}",
    "",
    "Seu convite digital tem o QR code para a entrada. Confirme sua presença pelo botão abaixo.",
  ].join("\n"),
  whatsappBody: [
    "Olá, {{primeiro_nome}}! Você está convidado(a) para *{{projeto}}*.",
    "",
    "📅 {{data_inicio}} às {{hora_inicio}}",
    "📍 {{local}}",
    "",
    "Seu convite e confirmação de presença: {{link_cracha}}",
  ].join("\n"),
  includeActions: true,
};

export const DEFAULT_RESPONSIBLE_INVITE = {
  ...DEFAULT_INVITE,
  name: "Convite do responsável da empresa (padrão)",
  emailBody: [
    DEFAULT_INVITE.emailBody,
    "",
    "Como responsável pela **{{empresa_convidante}}**, você pode inscrever os convidados da sua empresa até **{{data_limite}}**.",
    "",
    "**Acesso:** {{link_plataforma}}",
    "**Login:** {{login}}",
    "",
    "A senha provisória foi enviada pela organização.",
  ].join("\n"),
  whatsappBody: [
    DEFAULT_INVITE.whatsappBody,
    "",
    "Inscreva os convidados da *{{empresa_convidante}}* até {{data_limite}}:",
    "{{link_plataforma}} · login *{{login}}*",
  ].join("\n"),
};

export const DEFAULT_CANCEL = {
  name: "Cancelamento de convite (padrão)",
  emailSubject: "Convite cancelado · {{projeto}}",
  emailBody: [
    "Olá, {{primeiro_nome}}.",
    "",
    "Informamos que o seu convite para **{{projeto}}** foi cancelado. Se tiver dúvidas, responda a este e-mail.",
  ].join("\n"),
  whatsappBody:
    "Olá, {{primeiro_nome}}. Seu convite para *{{projeto}}* foi cancelado. Em caso de dúvida, fale com a organização.",
  includeActions: false,
};

export type DispatchOutcome = { sent: number; skipped: string[] };

/**
 * Dispara o convite pelos canais escolhidos (fila do worker, idempotente).
 * `resend` cria uma nova ocorrência para reenvio intencional.
 */
export async function dispatchInvite(
  ctx: { tenantId: string; projectId: string },
  registrationId: string,
  channels: Channel[],
  resend = false,
): Promise<DispatchOutcome> {
  const invite = await prisma.eventInvite.findFirst({
    where: { registrationId, tenantId: ctx.tenantId, projectId: ctx.projectId },
    include: { registration: true },
  });
  if (!invite) throw new AppError("Convite não encontrado.");
  if (invite.registration.status === "CANCELED")
    throw new AppError("Este convite está cancelado. Reative antes de enviar.");

  const responsible = invite.kind === "RESPONSIBLE";
  const base = {
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    registrationId,
    channels,
    reason: responsible ? "invite.responsible" : "invite.sent",
    ...(resend ? { occurrence: new Date().toISOString() } : {}),
  };
  // Modelo do cliente (finalidade INVITE) ou o padrão
  let r = await sendTransactional(prisma, { ...base, purpose: "INVITE" });
  if (!r.ok)
    r = await sendTransactional(prisma, {
      ...base,
      template: responsible ? DEFAULT_RESPONSIBLE_INVITE : DEFAULT_INVITE,
    });
  if (!r.ok) throw new AppError(r.error);

  const queued = r.data.filter((o) => o.status === "QUEUED" || o.status === "DUPLICATE");
  const skipped = r.data.filter((o) => o.status === "SKIPPED").map((o) => o.detail ?? o.channel);
  if (queued.length) {
    await prisma.eventInvite.update({
      where: { registrationId },
      data: { sentAt: invite.sentAt ?? new Date() },
    });
    if (invite.registration.status === "PENDING")
      await prisma.registration.update({
        where: { id: registrationId },
        data: { status: "INVITED" },
      });
  }
  return { sent: queued.length, skipped };
}

export async function cancelInvite(
  ctx: { tenantId: string; projectId: string },
  registrationId: string,
  by: string,
  notify: boolean,
) {
  const reg = await prisma.registration.findFirst({
    where: { id: registrationId, tenantId: ctx.tenantId, projectId: ctx.projectId },
  });
  if (!reg) throw new AppError("Convite não encontrado.");
  if (reg.status === "CANCELED") return;
  await prisma.$transaction([
    prisma.registration.update({
      where: { id: reg.id },
      data: { status: "CANCELED", canceledAt: new Date(), canceledBy: by },
    }),
    prisma.seatAssignment.deleteMany({ where: { registrationId: reg.id } }),
  ]);
  if (notify) {
    const base = {
      tenantId: ctx.tenantId,
      projectId: ctx.projectId,
      registrationId: reg.id,
      channels: ["EMAIL", "WHATSAPP"] as Channel[],
      reason: "invite.canceled",
      occurrence: new Date().toISOString(),
    };
    const r = await sendTransactional(prisma, { ...base, purpose: "INVITE_CANCEL" });
    if (!r.ok) await sendTransactional(prisma, { ...base, template: DEFAULT_CANCEL });
  }
}

// ---------------------------------------------------------------------------
// Expiração da data-limite
// ---------------------------------------------------------------------------

export async function expireQuotas(
  db: TenantDb,
  ctx: { tenantId: string; projectId: string },
  force: boolean,
) {
  const settings = await eventSettings(db, ctx.projectId);
  const companies = await companiesWithUsage(db, ctx.projectId);
  const plan = planQuotaExpiration(companies, settings.inviteDeadline, new Date(), force);
  if (!plan.allowed)
    throw new AppError(
      settings.inviteDeadline
        ? "A data-limite ainda não chegou. Confirme a antecipação para processar agora."
        : "Defina a data-limite nas configurações ou confirme o processamento antecipado.",
    );
  const now = new Date();
  await prisma.$transaction([
    ...plan.companies.map((c) =>
      prisma.companyQuota.update({
        where: { id: c.id },
        data: { lockedAt: now, returnedToPool: c.returned },
      }),
    ),
    prisma.eventInviteSettings.upsert({
      where: { projectId: ctx.projectId },
      create: {
        projectId: ctx.projectId,
        tenantId: ctx.tenantId,
        individualPool: plan.totalReturned,
        quotasExpiredAt: now,
      },
      update: { individualPool: { increment: plan.totalReturned }, quotasExpiredAt: now },
    }),
  ]);
  return plan;
}

// ---------------------------------------------------------------------------
// Check-in (reaproveitável pelo credenciamento)
// ---------------------------------------------------------------------------

export type CheckinGuest = {
  id: string;
  name: string;
  company: string;
  category: string;
  table: string;
  shortCode: string;
  status: InviteStatus;
  checkedInAt: string | null;
};

export type CheckinResult =
  | { ok: true; already: boolean; guest: CheckinGuest }
  | { ok: false; error: string; guest?: CheckinGuest };

const checkinInclude = {
  person: true,
  category: true,
  invite: true,
  seat: { include: { table: true } },
} satisfies Prisma.RegistrationInclude;

function toGuest(
  r: Prisma.RegistrationGetPayload<{ include: typeof checkinInclude }>,
): CheckinGuest {
  return {
    id: r.id,
    name: `${r.person.firstName} ${r.person.lastName}`.trim(),
    company: r.displayCompany,
    category: r.category?.name ?? "",
    table: r.seat
      ? `Mesa ${r.seat.table.number}${r.seat.seat ? ` · cadeira ${r.seat.seat}` : ""}`
      : "",
    shortCode: r.shortCode,
    status: inviteStatus({ ...r, sentAt: r.invite?.sentAt }),
    checkedInAt: r.checkedInAt?.toISOString() ?? null,
  };
}

/** Credencia pelo QR (URL /c/<token>), token cru ou código curto. */
export async function checkInByScan(
  db: TenantDb,
  projectId: string,
  raw: string,
  operator: string,
): Promise<CheckinResult> {
  const target = parseScan(raw);
  if (!target) return { ok: false, error: "Não reconhecemos esse código. Tente de novo." };
  const r = await db.registration.findFirst({
    where: {
      projectId,
      ...(target.kind === "token" ? { token: target.token } : { shortCode: target.code }),
    },
    include: checkinInclude,
  });
  if (!r) return { ok: false, error: "Convite não encontrado neste evento." };
  if (r.status === "CANCELED")
    return { ok: false, error: "Convite cancelado. Encaminhe à organização.", guest: toGuest(r) };
  if (r.checkedInAt) return { ok: true, already: true, guest: toGuest(r) };
  const updated = await db.registration.update({
    where: { id: r.id },
    data: {
      checkedInAt: new Date(),
      checkedInBy: operator,
      status:
        r.status === "DECLINED" || r.status === "PENDING" || r.status === "INVITED"
          ? "CONFIRMED"
          : r.status,
    },
    include: checkinInclude,
  });
  return { ok: true, already: false, guest: toGuest(updated) };
}

export async function undoCheckIn(db: TenantDb, projectId: string, registrationId: string) {
  await db.registration.updateMany({
    where: { id: registrationId, projectId },
    data: { checkedInAt: null, checkedInBy: "" },
  });
}
