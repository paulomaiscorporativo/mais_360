import "server-only";
import { randomBytes } from "node:crypto";
import {
  classifyTlsHost,
  customDomainTarget,
  DOMAINS_VERIFY_QUEUE,
  domainCheckKey,
  normalizeHostname,
  platformDomainsFor,
} from "@mais/core/domains";
import { enqueueJob } from "@mais/messaging";
import { RESERVED_SLUGS } from "@/config/terms";
import { prisma } from "./db";
import { env } from "./env";

/**
 * Configuração dos domínios próprios dos clientes (guia: docs/DOMINIOS.md).
 * Regras puras em @mais/core/domains; a consulta ao DNS é do worker
 * (fila `domains.verify`).
 */

export const rootDomain = () => normalizeHostname(env.ROOT_DOMAIN);

/** Host do console (nunca é cliente). Espelha o cálculo do proxy.ts. */
export const consoleHost = () => normalizeHostname(env.CONSOLE_HOST || `360.${env.ROOT_DOMAIN}`);

/** Host para onde o CNAME dos domínios próprios aponta. */
export const domainTarget = () => customDomainTarget(env.ROOT_DOMAIN, env.CUSTOM_DOMAIN_TARGET);

/** Domínios dentro dos quais nenhum cliente cadastra domínio próprio. */
export const platformDomains = () => platformDomainsFor(env.ROOT_DOMAIN);

/** Hosts da própria plataforma (console, APP_URL, alvo do CNAME). */
export function platformHosts(): string[] {
  let appHost = "";
  try {
    appHost = new URL(env.APP_URL).hostname;
  } catch {
    // APP_URL é validada no env.ts; mantém vazio por segurança
  }
  return [consoleHost(), appHost, domainTarget()].filter(Boolean);
}

export const newVerificationToken = () => randomBytes(16).toString("hex");

/** Pede ao worker para consultar o DNS agora (sem duplicar pedidos). */
export async function enqueueDomainCheck(domainId: string) {
  await enqueueJob(prisma, {
    queue: DOMAINS_VERIFY_QUEUE,
    payload: { domainId },
    uniqueKey: domainCheckKey(domainId),
    maxAttempts: 3,
  });
}

/**
 * Pedido de certificado do Caddy (on-demand TLS): o host pode receber https?
 * Sim para o console/APP_URL, subdomínio de cliente ativo (de assinante não
 * cancelado) e domínio próprio VERIFICADO. Qualquer outro host: não — evita
 * que alguém aponte domínios aleatórios e esgote o limite de emissão.
 */
export async function allowCertificate(host: string): Promise<boolean> {
  const t = classifyTlsHost(host, {
    rootDomain: rootDomain(),
    platformHosts: platformHosts(),
    reservedSubdomains: RESERVED_SLUGS,
  });
  switch (t.kind) {
    case "platform":
      return true;
    case "invalid":
      return false;
    case "tenant-subdomain": {
      const tenant = await prisma.tenant.findUnique({
        where: { slug: t.slug },
        select: { status: true, workspace: { select: { status: true } } },
      });
      if (tenant) return tenant.status === "ACTIVE" && tenant.workspace.status !== "CANCELED";
      // Endereço legado sob o domínio da plataforma (ex.: abradilanviagens.<raiz>)
      return verifiedDomain(`${t.slug}.${rootDomain()}`);
    }
    case "custom":
      return verifiedDomain(t.hostname);
  }
}

async function verifiedDomain(hostname: string) {
  const d = await prisma.tenantDomain.findUnique({
    where: { hostname },
    select: {
      status: true,
      tenant: { select: { status: true, workspace: { select: { status: true } } } },
    },
  });
  return (
    d?.status === "VERIFIED" &&
    d.tenant.status !== "ARCHIVED" &&
    d.tenant.workspace.status !== "CANCELED"
  );
}
