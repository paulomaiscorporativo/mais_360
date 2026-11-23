import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { prisma } from "./db";
import { env } from "./env";

const include = { branding: true, workspace: true } as const;

/**
 * Cliente da área pública a partir do segmento /t/<slug> (reescrito pelo proxy):
 *   • "_host"  → domínio próprio, lido do cabeçalho x-tenant-host (TenantDomain);
 *   • <slug>   → Tenant.slug; se não houver, tenta o domínio <slug>.<ROOT_DOMAIN>
 *                (preserva endereços legados, ex.: abradilanviagens.mais.tur.br).
 */
export const resolvePublicTenant = cache(async (segment: string) => {
  if (segment === "_host") {
    const host = (await headers()).get("x-tenant-host")?.toLowerCase();
    if (!host) return null;
    const d = await prisma.tenantDomain.findUnique({
      where: { hostname: host },
      include: { tenant: { include } },
    });
    // Domínio próprio só responde depois de verificado (posse provada no DNS)
    return d?.status === "VERIFIED" ? publicTenant(d.tenant) : null;
  }
  const bySlug = await prisma.tenant.findUnique({ where: { slug: segment }, include });
  if (bySlug) return publicTenant(bySlug);
  const d = await prisma.tenantDomain.findFirst({
    where: {
      hostname: { in: [`${segment}.${env.ROOT_DOMAIN}`, `${segment}.mais.tur.br`] },
      status: "VERIFIED",
    },
    include: { tenant: { include } },
  });
  return d ? publicTenant(d.tenant) : null;
});

/**
 * Assinante cancelado tira do ar as áreas públicas dos clientes dele; suspenso
 * NÃO (participantes de eventos em andamento não são prejudicados) — ADR 0004.
 */
function publicTenant<T extends { workspace: { status: string } }>(tenant: T): T | null {
  return tenant.workspace.status === "CANCELED" ? null : tenant;
}
