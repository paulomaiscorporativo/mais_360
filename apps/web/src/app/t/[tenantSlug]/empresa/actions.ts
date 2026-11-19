"use server";

import { z } from "zod";
import { canCompanyChangeGuest, normalizeEmail, normalizePhone, splitFullName } from "@mais/core";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { AppError, invalidFields } from "@/server/errors";
import { cancelInvite, dispatchInvite, eventSettings, issueInvite } from "@/server/events";
import {
  companyLogout,
  requireCompany,
  signInCompany,
  type CompanyPortal,
} from "@/server/company-portal";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/password";

const slug = z.string().max(80);

export const signIn = defineAction(
  z.object({
    tenantSlug: slug,
    login: z.string().trim().min(1, "Informe o login.").max(80),
    password: z.string().min(1, "Informe a senha.").max(200),
  }),
  async (i) => {
    const company = await signInCompany(i.tenantSlug, i.login, i.password);
    await audit({
      action: "company.login",
      actorType: "COMPANY",
      actorLabel: company.companyName,
      tenantId: company.tenantId,
      projectId: company.projectId,
      entityType: "CompanyQuota",
      entityId: company.id,
    });
    return null;
  },
);

export const signOut = defineAction(z.object({ tenantSlug: slug }), async () => {
  await companyLogout();
  return null;
});

// ---------------------------------------------------------------------------
// Convidados da empresa
// ---------------------------------------------------------------------------

const guestFields = {
  fullName: z.string().trim().min(3, "Informe o nome completo.").max(160),
  email: z.string().trim().max(160).default(""),
  phone: z.string().trim().max(40).default(""),
  jobTitle: z.string().trim().max(120).default(""),
};

type GuestInput = { fullName: string; email: string; phone: string; jobTitle: string };

/** Precisa de ao menos um canal válido para o convite chegar. */
function guestPerson(i: GuestInput, companyName: string) {
  const email = normalizeEmail(i.email);
  const errors: Record<string, string> = {};
  if (i.email && !email) errors.email = "E-mail inválido.";
  if (i.phone && !normalizePhone(i.phone)) errors.phone = "Informe o WhatsApp com DDD.";
  if (!email && !i.phone) errors.email = "Informe o e-mail ou o WhatsApp do convidado.";
  if (Object.keys(errors).length) throw invalidFields(errors);
  const { firstName, lastName } = splitFullName(i.fullName);
  return {
    firstName,
    lastName,
    email,
    phone: i.phone,
    jobTitle: i.jobTitle,
    organization: companyName,
  };
}

async function sendIfAuto(c: CompanyPortal, registrationId: string) {
  const settings = await eventSettings(c.db, c.ctx.projectId);
  if (!settings.autoSendOnCompanyRegistration) return false;
  try {
    // Fila do worker, idempotente por inscrição + canal (dedupeKey no motor)
    return (await dispatchInvite(c.ctx, registrationId, ["EMAIL", "WHATSAPP"])).sent > 0;
  } catch (err) {
    console.error("[empresa] envio do convite", err);
    return false;
  }
}

function companyAudit(c: CompanyPortal, action: string, entityId: string, data?: object) {
  return audit({
    action,
    actorType: "COMPANY",
    actorLabel: c.company.companyName,
    tenantId: c.ctx.tenantId,
    projectId: c.ctx.projectId,
    entityType: "Registration",
    entityId,
    ...(data ? { data: data as Record<string, string> } : {}),
  });
}

export const addCompanyGuest = defineAction(
  z.object({ tenantSlug: slug, ...guestFields }),
  async (i) => {
    const c = await requireCompany(i.tenantSlug);
    const reg = await issueInvite(c.db, c.ctx, {
      person: guestPerson(i, c.company.companyName),
      kind: "COMPANY_GUEST",
      companyQuotaId: c.company.id,
    });
    const sent = await sendIfAuto(c, reg.id);
    await companyAudit(c, "company.guest.add", reg.id);
    return { sent };
  },
);

async function ownGuest(c: CompanyPortal, registrationId: string) {
  const invite = await c.db.eventInvite.findFirst({
    where: { registrationId, projectId: c.ctx.projectId },
    include: { registration: { include: { person: true } } },
  });
  if (!invite) throw new AppError("Convidado não encontrado.");
  const settings = await eventSettings(c.db, c.ctx.projectId);
  const check = canCompanyChangeGuest(
    c.company,
    { ...invite.registration, companyQuotaId: invite.companyQuotaId, kind: invite.kind },
    settings.inviteDeadline,
  );
  if (!check.ok) throw new AppError(check.message);
  return invite;
}

export const cancelCompanyGuest = defineAction(
  z.object({ tenantSlug: slug, registrationId: z.string().max(40) }),
  async (i) => {
    const c = await requireCompany(i.tenantSlug);
    const invite = await ownGuest(c, i.registrationId);
    await cancelInvite(c.ctx, invite.registrationId, c.company.companyName, true);
    await companyAudit(c, "company.guest.cancel", invite.registrationId);
    return null;
  },
);

/**
 * Substituição: emite o convite da nova pessoa e só então cancela o anterior
 * (se a emissão falhar, nada muda). A vaga da cota passa de um para o outro.
 */
export const replaceCompanyGuest = defineAction(
  z.object({ tenantSlug: slug, registrationId: z.string().max(40), ...guestFields }),
  async (i) => {
    const c = await requireCompany(i.tenantSlug);
    const old = await ownGuest(c, i.registrationId);
    const reg = await issueInvite(c.db, c.ctx, {
      person: guestPerson(i, c.company.companyName),
      kind: "COMPANY_GUEST",
      companyQuotaId: c.company.id,
      // A vaga é a do convidado substituído (prazo e trava já conferidos acima)
      skipQuotaCheck: true,
    });
    await cancelInvite(c.ctx, old.registrationId, c.company.companyName, true);
    const sent = await sendIfAuto(c, reg.id);
    await companyAudit(c, "company.guest.replace", reg.id, { replaced: old.registrationId });
    return { sent };
  },
);

export const changeCompanyPassword = defineAction(
  z.object({
    tenantSlug: slug,
    current: z.string().min(1, "Informe a senha atual.").max(200),
    next: z.string().max(200),
  }),
  async (i) => {
    const c = await requireCompany(i.tenantSlug);
    if (!(await verifyPassword(i.current, c.company.passwordHash)))
      throw invalidFields({ current: "Senha atual incorreta." });
    const problem = passwordProblem(i.next);
    if (problem) throw invalidFields({ next: problem });
    await c.db.$transaction([
      c.db.companyQuota.update({
        where: { id: c.company.id },
        data: {
          passwordHash: await hashPassword(i.next),
          provisionalPasswordEnc: "",
          passwordChangedAt: new Date(),
        },
      }),
      // Derruba as outras sessões da empresa; a atual continua
      c.db.session.updateMany({
        where: {
          kind: "COMPANY",
          subjectId: c.company.id,
          revokedAt: null,
          NOT: { id: c.sessionId },
        },
        data: { revokedAt: new Date() },
      }),
    ]);
    await audit({
      action: "company.password.change",
      actorType: "COMPANY",
      actorLabel: c.company.companyName,
      tenantId: c.ctx.tenantId,
      projectId: c.ctx.projectId,
      entityType: "CompanyQuota",
      entityId: c.company.id,
    });
    return null;
  },
);
