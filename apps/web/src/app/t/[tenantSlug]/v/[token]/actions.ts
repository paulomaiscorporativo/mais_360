"use server";

import { headers } from "next/headers";
import { z } from "zod";
import {
  PERSON_DOCUMENT_KINDS,
  readTravelSettings,
  ticketStatusAfterMessage,
  type PersonDocumentKind,
  type ProjectFeature,
} from "@mais/core";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { AppError, notFound } from "@/server/errors";
import { saveUpload } from "@/server/files";
import { rateLimit } from "@/server/rate-limit";
import { formObject, syncPersonFromDocument } from "@/server/travel";
import { loadTravelerPortal, travelerName } from "@/server/traveler-portal";

/**
 * Ações do viajante no portal. Sem sessão: o token da inscrição autoriza, e
 * cada ação confere o recurso ligado no projeto e limita a frequência.
 */
async function portal(tenantSlug: string, token: string, feature: ProjectFeature) {
  const t = await loadTravelerPortal(tenantSlug, token);
  if (!t || !t.features.has(feature)) throw notFound("Este link não está mais disponível.");
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();
  if (!(await rateLimit(`portal:${t.reg.id}:${ip}`, 30, 10 * 60_000)).allowed)
    throw new AppError("Muitas ações seguidas. Aguarde alguns minutos e tente de novo.");
  return { ...t, name: travelerName(t.person) };
}

const ids = { tenantSlug: z.string().max(80), token: z.string().max(64) };

export const openTicket = defineAction(
  z.object({
    ...ids,
    subject: z.string().trim().min(3, "Diga em poucas palavras do que precisa.").max(140),
    body: z.string().trim().min(3, "Conte o que aconteceu.").max(4000),
  }),
  async ({ tenantSlug, token, subject, body }) => {
    const t = await portal(tenantSlug, token, "SUPPORT");
    const open = await t.db.supportTicket.count({
      where: { registrationId: t.reg.id, status: { in: ["NEW", "IN_PROGRESS"] } },
    });
    if (open >= 5)
      throw new AppError(
        "Você já tem 5 chamados aguardando a equipe. Responda num deles para agilizar.",
      );
    const ticket = await t.db.supportTicket.create({
      data: {
        tenantId: t.tenant.id,
        projectId: t.project.id,
        registrationId: t.reg.id,
        subject,
        messages: { create: { authorType: "PERSON", authorName: t.name, body } },
      },
    });
    await audit({
      action: "support.open",
      actorType: "PERSON",
      actorLabel: t.name,
      tenantId: t.tenant.id,
      projectId: t.project.id,
      entityType: "SupportTicket",
      entityId: ticket.id,
    });
    return { id: ticket.id };
  },
);

export const replyAsTraveler = defineAction(
  z.object({
    ...ids,
    ticketId: z.string(),
    body: z.string().trim().min(1, "Escreva a mensagem.").max(4000),
  }),
  async ({ tenantSlug, token, ticketId, body }) => {
    const t = await portal(tenantSlug, token, "SUPPORT");
    const ticket = await t.db.supportTicket.findFirst({
      where: { id: ticketId, registrationId: t.reg.id },
    });
    if (!ticket) throw notFound("Chamado não encontrado.");
    const status = ticketStatusAfterMessage(ticket.status, "PERSON");
    await t.db.$transaction([
      t.db.supportTicketMessage.create({
        data: { ticketId, authorType: "PERSON", authorName: t.name, body },
      }),
      t.db.supportTicket.update({ where: { id: ticketId }, data: { status } }),
    ]);
    return { status };
  },
);

const uploadSchema = z.object({
  ...ids,
  kind: z.enum(PERSON_DOCUMENT_KINDS as [PersonDocumentKind, ...PersonDocumentKind[]]),
  number: z.string().trim().max(40).default(""),
  expiresAt: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Data inválida.")
    .default(""),
  file: z.instanceof(File, { message: "Escolha o arquivo do documento." }),
});

/** O viajante envia o próprio documento (passaporte, visto…), se o projeto permitir. */
export const uploadMyDocument = defineAction(
  z.preprocess(formObject, uploadSchema),
  async ({ tenantSlug, token, kind, number, expiresAt, file }) => {
    const t = await portal(tenantSlug, token, "DOCUMENTS");
    if (!readTravelSettings(t.project.settings).travelerUploads)
      throw new AppError("O envio de documentos pelo portal está desligado. Fale com a equipe.");
    const stored = await saveUpload({
      tenantId: t.tenant.id,
      file,
      kind: "document",
      visibility: "PRIVATE",
      uploadedBy: t.name,
    });
    const expiry = expiresAt ? new Date(`${expiresAt}T12:00:00Z`) : null;
    const doc = await t.db.personDocument.create({
      data: {
        tenantId: t.tenant.id,
        personId: t.person.id,
        kind,
        number,
        expiresAt: expiry,
        fileId: stored.id,
        uploadedBy: t.name,
      },
    });
    await syncPersonFromDocument(t.db, t.person.id, kind, number, expiry);
    await audit({
      action: "person.document.upload",
      actorType: "PERSON",
      actorLabel: t.name,
      tenantId: t.tenant.id,
      projectId: t.project.id,
      entityType: "PersonDocument",
      entityId: doc.id,
      data: { kind, via: "portal" },
    });
    return { id: doc.id };
  },
);
