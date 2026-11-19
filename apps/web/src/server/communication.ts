import "server-only";
import type { TenantRole } from "@mais/db";
import { globalEvolution, globalSmtp } from "@mais/messaging";
import { requireTenant } from "./auth";
import { notFound } from "./errors";
import { modulesForTenant } from "./modules";
import { tenantDb } from "./tenant-db";

/**
 * Mais 360 Connect — acesso às telas de comunicação.
 *
 * Toda página e action passa por `requireCommunication`: cliente sem o módulo
 * COMMUNICATION ativo não enxerga nada (404), mesmo digitando a URL.
 *
 * Os serviços de @mais/messaging recebem o Prisma base porque já filtram por
 * `tenantId` em toda consulta; leituras feitas aqui usam `tenantDb`.
 */
export async function requireCommunication(slug: string, minRole: TenantRole = "VIEWER") {
  const ctx = await requireTenant(slug, minRole);
  const active = await modulesForTenant(ctx.tenant);
  if (!active.has("COMMUNICATION")) throw notFound("Módulo não contratado.");
  return { ...ctx, db: tenantDb(ctx) };
}

export type CommunicationContext = Awaited<ReturnType<typeof requireCommunication>>;

export const communicationBase = (ws: string, tenant: string) =>
  `/console/${ws}/clientes/${tenant}/comunicacao`;

/** O que existe configurado no ambiente (servidor global da plataforma). */
export function globalChannelsInfo() {
  const smtp = globalSmtp();
  const evo = globalEvolution();
  return {
    email: smtp ? { host: smtp.smtp.host, from: smtp.from } : null,
    evolution: evo ? { url: evo.url, instance: evo.instance } : null,
  };
}

/** Projetos do cliente para os seletores (enquanto não há tela de projetos). */
export async function projectOptions(ctx: CommunicationContext) {
  const rows = await ctx.db.project.findMany({
    where: { archivedAt: null },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true, startsAt: true, type: true },
    take: 200,
  });
  return rows.map((p) => ({ id: p.id, name: p.name, startsAt: p.startsAt?.toISOString() ?? null }));
}

/** Nome padrão da instância Evolution de um cliente/projeto. */
export function defaultInstanceName(tenantSlug: string, projectId?: string | null) {
  const base = `m360-${tenantSlug}`.replace(/[^a-z0-9-]/g, "").slice(0, 40);
  return projectId ? `${base}-${projectId.slice(-6)}` : base;
}
