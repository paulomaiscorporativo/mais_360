import "server-only";
import { prisma } from "@/server/db";
import { env, isProd } from "@/server/env";
import { tenantAddress } from "@/server/urls";

/**
 * URL pública do formulário de inscrição: no domínio do cliente em produção;
 * em desenvolvimento, pela rota /t/<slug> do próprio app.
 */
export async function publicFormUrl(tenant: { id: string; slug: string }, token: string) {
  if (!isProd) return `${env.APP_URL.replace(/\/$/, "")}/t/${tenant.slug}/i/${token}`;
  const domains = await prisma.tenantDomain.findMany({
    where: { tenantId: tenant.id, primary: true },
    take: 1,
  });
  return `https://${tenantAddress({ slug: tenant.slug, domains })}/i/${token}`;
}
