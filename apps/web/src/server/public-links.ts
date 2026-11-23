import "server-only";
import { prisma } from "./db";
import { env } from "./env";
import { servesTenantDomains, tenantAddress } from "./urls";

/**
 * Base dos links públicos de um cliente: o domínio dele em produção
 * (https://abiec.mais.tur.br) ou a rota /t/<slug> do app quando roda localmente.
 */
export async function tenantPublicBase(tenant: { id: string; slug: string }) {
  if (!servesTenantDomains()) return `${env.APP_URL.replace(/\/$/, "")}/t/${tenant.slug}`;
  const domains = await prisma.tenantDomain.findMany({
    // Só domínio verificado: se o DNS sumir, os links voltam ao subdomínio padrão
    where: { tenantId: tenant.id, primary: true, status: "VERIFIED" },
    take: 1,
  });
  return `https://${tenantAddress({ slug: tenant.slug, domains })}`;
}

/** Formulário público de inscrição do projeto: <base>/i/<publicToken>. */
export async function publicFormUrl(tenant: { id: string; slug: string }, publicToken: string) {
  return `${await tenantPublicBase(tenant)}/i/${publicToken}`;
}

/**
 * Credencial digital da inscrição: <base>/c/<registration.token>.
 * É o conteúdo do QR do crachá/convite (lido no balcão, no totem e no acesso).
 */
export async function credentialUrl(
  tenant: { id: string; slug: string },
  registrationToken: string,
) {
  return `${await tenantPublicBase(tenant)}/c/${registrationToken}`;
}
