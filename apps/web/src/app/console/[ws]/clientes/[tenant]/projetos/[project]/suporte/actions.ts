"use server";

import { z } from "zod";
import { ticketStatusAfterMessage } from "@mais/core";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { notifyTravelers, requireTravelWriter, travelerPortalUrl } from "@/server/travel";

const STATUSES = ["NEW", "IN_PROGRESS", "ANSWERED", "RESOLVED"] as const;

export const replyTicket = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    ticketId: z.string(),
    body: z.string().trim().min(1, "Escreva a resposta.").max(4000),
    resolve: z.boolean().default(false),
  }),
  async ({ tenant, projectId, ticketId, body, resolve }) => {
    const p = await requireTravelWriter(tenant, projectId, "SUPPORT");
    const ticket = await p.db.supportTicket.findFirst({
      where: { id: ticketId, projectId },
      include: { registration: { select: { id: true, token: true } } },
    });
    if (!ticket) throw notFound("Chamado não encontrado.");
    const status = resolve ? "RESOLVED" : ticketStatusAfterMessage(ticket.status, "USER");
    const message = await p.db.$transaction(async (tx) => {
      const m = await tx.supportTicketMessage.create({
        data: { ticketId, authorType: "USER", authorName: p.actor, body },
      });
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: { status, assignedUserId: ticket.assignedUserId ?? p.viewer.user.id },
      });
      return m;
    });
    await audit({
      action: "support.reply",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "SupportTicket",
      entityId: ticketId,
      data: { status },
    });
    // Avisa o viajante; uma mensagem por resposta (dedupeKey usa o id da resposta)
    const link = await travelerPortalUrl(p.tenant, ticket.registration.token);
    await notifyTravelers({
      tenantId: p.tenantId,
      projectId,
      registrationIds: [ticket.registration.id],
      reason: `support.reply.${message.id}`,
      template: {
        name: "Resposta do suporte",
        emailSubject: `Resposta ao seu chamado: ${ticket.subject}`.slice(0, 200),
        emailBody: [
          "Olá, {{primeiro_nome}}!",
          "",
          `A equipe respondeu ao seu chamado **${ticket.subject}**:`,
          "",
          body,
          "",
          `Para responder, acesse o portal da viagem: ${link}`,
        ].join("\n"),
        whatsappBody: [
          `Resposta ao seu chamado *${ticket.subject}*:`,
          "",
          body,
          "",
          `Responder pelo portal: ${link}`,
        ].join("\n"),
        includeActions: false,
      },
    });
    return { status };
  },
);

export const setTicketStatus = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    ticketId: z.string(),
    status: z.enum(STATUSES),
  }),
  async ({ tenant, projectId, ticketId, status }) => {
    const p = await requireTravelWriter(tenant, projectId, "SUPPORT");
    const r = await p.db.supportTicket.updateMany({
      where: { id: ticketId, projectId },
      data: { status },
    });
    if (!r.count) throw notFound("Chamado não encontrado.");
    await audit({
      action: "support.status",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "SupportTicket",
      entityId: ticketId,
      data: { status },
    });
    return null;
  },
);
