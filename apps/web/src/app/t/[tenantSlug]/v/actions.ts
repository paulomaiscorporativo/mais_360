"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { enabledProjectFeatures, normalizeEmail } from "@mais/core";
import { defineAction } from "@/server/action";
import { AppError, invalidFields } from "@/server/errors";
import { modulesForTenant } from "@/server/modules";
import { rateLimit } from "@/server/rate-limit";
import { tenantDb } from "@/server/tenant-db";
import { resolvePublicTenant } from "@/server/tenant-resolve";
import { notifyTravelers, travelerPortalUrl } from "@/server/travel";
import { PORTAL_FEATURES } from "@/server/traveler-portal";

/**
 * "Perdi o link": o viajante informa o e-mail e recebe o link do portal de
 * cada viagem ativa. A resposta é sempre a mesma — não revela se o e-mail
 * está cadastrado. No máximo um envio por viagem a cada hora (dedupeKey).
 */
export const requestPortalLink = defineAction(
  z.object({
    tenantSlug: z.string().max(80),
    email: z.string().trim().max(160),
    /** Campo-isca: preenchido só por robôs. */
    website: z.string().max(0).default(""),
  }),
  async ({ tenantSlug, email }) => {
    const h = await headers();
    const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();
    if (!(await rateLimit(`portal-link:${ip}`, 5, 15 * 60_000)).allowed)
      throw new AppError("Muitas tentativas seguidas. Aguarde alguns minutos.");
    const norm = normalizeEmail(email);
    if (!norm) throw invalidFields({ email: "Informe um e-mail válido." });
    if (!(await rateLimit(`portal-link-email:${norm}`, 3, 60 * 60_000)).allowed)
      return { sent: true };

    const tenant = await resolvePublicTenant(tenantSlug);
    if (!tenant || tenant.status !== "ACTIVE") return { sent: true };
    const db = tenantDb({ tenantId: tenant.id });
    const regs = await db.registration.findMany({
      where: {
        status: { notIn: ["CANCELED", "DECLINED"] },
        person: { emailNorm: norm, archivedAt: null },
        project: {
          archivedAt: null,
          status: { notIn: ["COMPLETED", "ARCHIVED"] },
          features: { some: { enabled: true, feature: { in: PORTAL_FEATURES } } },
        },
      },
      include: { project: { include: { features: true } } },
      take: 10,
    });
    const modules = await modulesForTenant(tenant);
    const hour = new Date().toISOString().slice(0, 13);
    for (const r of regs) {
      const features = enabledProjectFeatures(r.project.features, modules);
      if (!PORTAL_FEATURES.some((f) => features.has(f))) continue;
      const link = await travelerPortalUrl(tenant, r.token);
      await notifyTravelers({
        tenantId: tenant.id,
        projectId: r.projectId,
        registrationIds: [r.id],
        reason: `portal.link.${hour}`,
        channels: ["EMAIL"],
        template: {
          name: "Link do portal do viajante",
          emailSubject: `Seu acesso: ${r.project.name}`.slice(0, 200),
          emailBody: [
            "Olá, {{primeiro_nome}}!",
            "",
            `Aqui está o link do seu portal da viagem **${r.project.name}**: voos, hotel, roteiro, avisos e documentos.`,
            "",
            link,
            "",
            "O link é pessoal. Se não foi você quem pediu, ignore esta mensagem.",
          ].join("\n"),
          whatsappBody: "",
          includeActions: false,
        },
      });
    }
    return { sent: true };
  },
);
