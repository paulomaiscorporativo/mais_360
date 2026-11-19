"use server";

import { z } from "zod";
import { canRequesterCancel, formatCents } from "@mais/core/corporate-travel";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import {
  chooseQuoteFor,
  notifyRequester,
  personName,
  REQUEST_DETAIL_INCLUDE,
  submitTravelRequest,
} from "@/server/corporate-travel";
import { AppError, invalidFields, notFound } from "@/server/errors";
import {
  memberLogout,
  requireMember,
  requireMemberTravel,
  signInMember,
  type MemberPortal,
} from "@/server/member-portal";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/password";

const slug = z.string().max(80);
const id = z.string().min(1).max(40);

export const signIn = defineAction(
  z.object({
    tenantSlug: slug,
    email: z.string().trim().min(1, "Informe o e-mail.").max(160),
    password: z.string().min(1, "Informe a senha.").max(200),
    remember: z.boolean().default(false),
  }),
  async (i) => {
    const { tenant, person } = await signInMember(i.tenantSlug, i.email, i.password, i.remember);
    await audit({
      action: "member.login",
      actorType: "PERSON",
      actorLabel: personName(person),
      tenantId: tenant.id,
      entityType: "Person",
      entityId: person.id,
    });
    return null;
  },
);

export const signOut = defineAction(z.object({ tenantSlug: slug }), async () => {
  await memberLogout();
  return null;
});

export const changePassword = defineAction(
  z.object({
    tenantSlug: slug,
    current: z.string().min(1, "Informe a senha atual.").max(200),
    next: z.string().max(200),
  }),
  async (i) => {
    const m = await requireMember(i.tenantSlug);
    if (!(await verifyPassword(i.current, m.person.passwordHash ?? "")))
      throw invalidFields({ current: "Senha atual incorreta." });
    const problem = passwordProblem(i.next);
    if (problem) throw invalidFields({ next: problem });
    if (i.next === i.current)
      throw invalidFields({ next: "Escolha uma senha diferente da atual." });
    await m.db.$transaction([
      m.db.person.update({
        where: { id: m.person.id },
        data: { passwordHash: await hashPassword(i.next), mustChangePassword: false },
      }),
      // Derruba as outras sessões do associado; a atual continua
      m.db.session.updateMany({
        where: { kind: "PERSON", personId: m.person.id, revokedAt: null, NOT: { id: m.sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
    await memberAudit(m, "member.password.change", "Person", m.person.id);
    return null;
  },
);

function memberAudit(
  m: MemberPortal,
  action: string,
  entityType: string,
  entityId: string,
  data?: object,
) {
  return audit({
    action,
    actorType: "PERSON",
    actorLabel: personName(m.person),
    tenantId: m.tenant.id,
    entityType,
    entityId,
    ...(data ? { data: data as Record<string, string> } : {}),
  });
}

/** A solicitação precisa ser do próprio associado. */
async function ownRequest(m: MemberPortal, requestId: string) {
  const r = await m.db.travelRequest.findFirst({
    where: { id: requestId, requesterPersonId: m.person.id },
    include: REQUEST_DETAIL_INCLUDE,
  });
  if (!r) throw notFound("Solicitação não encontrada.");
  return r;
}

export const createRequest = defineAction(
  z.object({ tenantSlug: slug, request: z.unknown() }),
  async (i) => {
    const m = await requireMemberTravel(i.tenantSlug);
    const request = await submitTravelRequest(
      m.db,
      m.tenant,
      i.request as Parameters<typeof submitTravelRequest>[2],
      {
        requester: m.person,
        companyName: m.company,
        actor: { type: "PERSON", name: personName(m.person) },
        sendCopy: true,
      },
    );
    return { id: request.id, protocol: request.protocol };
  },
);

export const chooseQuote = defineAction(
  z.object({
    tenantSlug: slug,
    requestId: id,
    quoteId: id,
    justification: z.string().trim().max(2000).default(""),
  }),
  async (i) => {
    const m = await requireMemberTravel(i.tenantSlug);
    const r = await ownRequest(m, i.requestId);
    const result = await chooseQuoteFor(m.db, r, i.quoteId, i.justification, {
      type: "PERSON",
      name: personName(m.person),
    });
    await memberAudit(m, "travel.quote.choose", "TravelRequest", r.id, {
      quoteId: i.quoteId,
      status: result.status,
      outOfPolicy: String(result.outOfPolicy),
    });
    await notifyRequester(m.tenant, r, {
      reason: "choice",
      occurrence: `${i.quoteId}:${Date.now()}`,
      subject:
        result.status === "AWAITING_APPROVAL"
          ? "Sua escolha foi enviada para aprovação"
          : "Recebemos sua escolha",
      lines: [
        `Você escolheu **${result.quote.title}** (${formatCents(result.quote.totalCents, result.quote.currency)}).`,
        result.status === "AWAITING_APPROVAL"
          ? "Ela segue agora para o aprovador. Avisamos assim que houver decisão."
          : "A equipe segue para a emissão e envia os localizadores por aqui.",
      ],
      whatsapp:
        result.status === "AWAITING_APPROVAL"
          ? `Sua escolha (${result.quote.title}) foi enviada para aprovação.`
          : `Recebemos sua escolha (${result.quote.title}). A equipe segue para a emissão.`,
      channels: ["EMAIL"],
    });
    return { status: result.status };
  },
);

export const cancelRequest = defineAction(
  z.object({
    tenantSlug: slug,
    requestId: id,
    reason: z.string().trim().max(1000).default(""),
  }),
  async (i) => {
    const m = await requireMemberTravel(i.tenantSlug);
    const r = await ownRequest(m, i.requestId);
    if (!canRequesterCancel(r.status))
      throw new AppError("Esta solicitação já foi emitida ou cancelada. Fale com a equipe.");
    await m.db.$transaction([
      m.db.travelApproval.updateMany({
        where: { requestId: r.id, decision: "PENDING" },
        data: { decision: "SKIPPED", decidedAt: new Date(), comment: "Solicitação cancelada." },
      }),
      m.db.travelRequest.update({ where: { id: r.id }, data: { status: "CANCELED" } }),
      m.db.travelRequestEvent.create({
        data: {
          requestId: r.id,
          status: "CANCELED",
          note: i.reason
            ? `Cancelada pelo solicitante: ${i.reason}`
            : "Cancelada pelo solicitante.",
          actorName: personName(m.person),
          actorType: "PERSON",
        },
      }),
    ]);
    await memberAudit(m, "travel.request.cancel", "TravelRequest", r.id);
    return null;
  },
);
