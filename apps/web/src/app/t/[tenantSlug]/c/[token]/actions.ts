"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rsvpState } from "@mais/core";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { loadCredential } from "@/server/invite-public";
import { rateLimit } from "@/server/rate-limit";

/**
 * Resposta do convidado pela página do convite. O token é o segredo do link;
 * o prazo (data-limite e fim do evento) é conferido de novo aqui, no servidor.
 */
export const respondInvite = defineAction(
  z.object({
    tenantSlug: z.string().max(80),
    token: z.string().max(64),
    answer: z.enum(["CONFIRMED", "DECLINED"]),
  }),
  async (i) => {
    const h = await headers();
    const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();
    if (!rateLimit(`rsvp:${ip}`, 30, 10 * 60_000).allowed)
      throw new AppError("Muitas tentativas seguidas. Aguarde alguns minutos.");

    const c = await loadCredential(i.tenantSlug, i.token);
    if (!c || !c.isInvite) throw new AppError("Convite não encontrado.");
    const reg = c.registration;
    const state = rsvpState(reg, { deadline: c.deadline, eventEnd: c.eventEnd });
    if (!state.open) throw new AppError(state.message);
    if (reg.status === i.answer) return { status: i.answer };

    await c.db.registration.updateMany({
      // Condição repetida no update: não reabre convite cancelado nem credenciado
      where: { id: reg.id, status: { not: "CANCELED" }, checkedInAt: null },
      data: {
        status: i.answer,
        confirmedAt: i.answer === "CONFIRMED" ? new Date() : null,
      },
    });
    await audit({
      action: i.answer === "CONFIRMED" ? "invite.rsvp.confirm" : "invite.rsvp.decline",
      actorType: "PERSON",
      actorLabel: `${reg.person.firstName} ${reg.person.lastName}`.trim(),
      tenantId: c.tenant.id,
      projectId: c.project.id,
      entityType: "Registration",
      entityId: reg.id,
    });
    revalidatePath(`/t/${i.tenantSlug}/c/${i.token}`);
    return { status: i.answer };
  },
);
