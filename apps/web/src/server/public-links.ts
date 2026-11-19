import "server-only";
import { prisma } from "./db";
import { env, isProd } from "./env";
import { tenantAddress } from "./urls";

/**
 * Base dos links públicos de um cliente: o domínio dele em produção
 * (https://abiec.mais.tur.br) ou a rota /t/<slug> do app em desenvolvimento.
 */
export async function tenantPublicBase(tenant: { id: string; slug: string }) {
  if (!isProd) return `${env.APP_URL.replace(/\/$/, "")}/t/${tenant.slug}`;
  const domains = await prisma.tenantDomain.findMany({
    where: { tenantId: tenant.id, primary: true },
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
export async function credentialUrl(tenant: { id: string; slug: string }, registrationToken: string) {
  return `${await tenantPublicBase(tenant)}/c/${registrationToken}`;
}
