import "server-only";
import { cache } from "react";
import { enabledProjectFeatures, type ProjectFeature } from "@mais/core";
import { modulesForTenant } from "./modules";
import { tenantDb } from "./tenant-db";
import { resolvePublicTenant } from "./tenant-resolve";

/**
 * Portal do viajante (/t/<cliente>/v/<token>). O token da inscrição é o
 * segredo do link (mesmo do QR da credencial): quem tem o link vê só a própria
 * viagem. Nada aqui usa sessão de equipe — todo acesso parte da inscrição.
 */

export const PORTAL_FEATURES: ProjectFeature[] = [
  "FLIGHTS",
  "ACCOMMODATION",
  "ITINERARY",
  "MURAL",
  "DOCUMENTS",
  "VOUCHERS",
  "SUPPORT",
];

/** Carrega a inscrição do link com escopo do cliente. Inválido, cancelado ou sem recurso → null. */
export const loadTravelerPortal = cache(async (tenantSlug: string, token: string) => {
  if (!token || token.length > 64) return null;
  const tenant = await resolvePublicTenant(tenantSlug);
  if (!tenant || tenant.status !== "ACTIVE") return null;
  const db = tenantDb({ tenantId: tenant.id });
  const reg = await db.registration.findFirst({
    where: { token, status: { notIn: ["CANCELED", "DECLINED"] } },
    include: {
      person: true,
      project: { include: { features: true } },
      group: { select: { name: true, color: true } },
    },
  });
  if (!reg || reg.project.archivedAt) return null;
  const features = enabledProjectFeatures(reg.project.features, await modulesForTenant(tenant));
  const portal = new Set(PORTAL_FEATURES.filter((f) => features.has(f)));
  if (!portal.size) return null;
  return {
    tenant,
    db,
    reg,
    person: reg.person,
    project: reg.project,
    features: portal,
    tz: reg.project.timezone ?? tenant.timezone,
  };
});

export type TravelerPortal = NonNullable<Awaited<ReturnType<typeof loadTravelerPortal>>>;

/** Nome exibido do viajante (nome social tem prioridade). */
export function travelerName(person: { firstName: string; lastName: string; socialName: string }) {
  return person.socialName || `${person.firstName} ${person.lastName}`.trim();
}
