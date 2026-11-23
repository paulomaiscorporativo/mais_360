/**
 * Verificação dos domínios próprios dos clientes (fila `domains.verify`).
 *
 * A web enfileira ao cadastrar e no botão "Verificar agora"; a varredura
 * periódica enfileira os pendentes (a cada 5 min, por até 7 dias) e reconfere
 * os verificados uma vez por dia. Aqui só se consulta o DNS (node:dns) e se
 * grava o resultado; a interpretação é pura e fica em @mais/core/domains.
 *
 * Se um domínio verificado perde o apontamento, vira FAILED e deixa de ser o
 * principal: os links públicos voltam ao subdomínio padrão do cliente.
 */
import { Resolver } from "node:dns/promises";
import { z } from "zod";
import type { PrismaClient } from "@mais/db";
import { enqueueJob } from "@mais/messaging";
import {
  customDomainTarget,
  DOMAINS_VERIFY_QUEUE,
  domainCheckKey,
  interpretLookup,
  isDueForCheck,
  isPlatformHost,
  nextDomainState,
  PENDING_RECHECK_MS,
  platformDomainsFor,
  txtRecordName,
  VERIFIED_RECHECK_MS,
  type DnsAnswer,
  type DnsLookup,
} from "@mais/core/domains";
import type { JobHandler, Logger } from "./runner";

export { DOMAINS_VERIFY_QUEUE };

/** O mínimo do resolvedor do Node que usamos (injetável nos testes). */
export type DnsResolver = {
  resolveTxt(host: string): Promise<string[][]>;
  resolveCname(host: string): Promise<string[]>;
  resolve4(host: string): Promise<string[]>;
  resolve6(host: string): Promise<string[]>;
};

export function systemResolver(): DnsResolver {
  // Tempo curto: uma consulta presa não segura o worker; falha temporária não
  // rebaixa domínio verificado (regra do core).
  const r = new Resolver({ timeout: 5_000, tries: 2 });
  const servers = (process.env.DNS_SERVERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (servers.length) r.setServers(servers);
  return r;
}

export type DomainConfig = { target: string; platformDomains: string[] };

export function domainConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DomainConfig {
  const root = env.ROOT_DOMAIN || "localhost";
  return {
    target: customDomainTarget(root, env.CUSTOM_DOMAIN_TARGET),
    platformDomains: platformDomainsFor(root),
  };
}

async function answer<T>(p: Promise<T>): Promise<DnsAnswer<T>> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    return { ok: false, code: typeof code === "string" ? code : "EUNKNOWN" };
  }
}

/** Endereços IPv4 + IPv6; só falha se as duas consultas falharem. */
async function addresses(resolver: DnsResolver, host: string): Promise<DnsAnswer<string[]>> {
  const [v4, v6] = await Promise.all([
    answer(resolver.resolve4(host)),
    answer(resolver.resolve6(host)),
  ]);
  if (!v4.ok && !v6.ok) return v4;
  return { ok: true, value: [...(v4.ok ? v4.value : []), ...(v6.ok ? v6.value : [])] };
}

export async function lookupDomain(
  resolver: DnsResolver,
  hostname: string,
  target: string,
): Promise<DnsLookup> {
  const [txt, cname, hostAddresses, targetAddresses] = await Promise.all([
    answer(resolver.resolveTxt(txtRecordName(hostname))),
    answer(resolver.resolveCname(hostname)),
    addresses(resolver, hostname),
    addresses(resolver, target),
  ]);
  return { txt, cname, hostAddresses, targetAddresses };
}

export type CheckResult =
  | { checked: false; reason: "not-found" | "platform" }
  | { checked: true; status: "PENDING" | "VERIFIED" | "FAILED"; gained: boolean; lost: boolean };

/** Consulta o DNS de um domínio e grava a nova situação. */
export async function checkDomain(
  db: PrismaClient,
  resolver: DnsResolver,
  domainId: string,
  config: DomainConfig,
  now = new Date(),
): Promise<CheckResult> {
  const d = await db.tenantDomain.findUnique({ where: { id: domainId } });
  if (!d) return { checked: false, reason: "not-found" };
  // Endereços da plataforma (subdomínios legados) não dependem do DNS do cliente
  if (isPlatformHost(d.hostname, config.platformDomains))
    return { checked: false, reason: "platform" };

  const lookup = await lookupDomain(resolver, d.hostname, config.target);
  const outcome = interpretLookup(lookup, { token: d.verificationToken, target: config.target });
  const next = nextDomainState(d, outcome, now);

  await db.tenantDomain.update({
    where: { id: d.id },
    data: {
      status: next.status,
      verifiedAt: next.verifiedAt,
      lastError: next.lastError,
      lastCheckedAt: now,
      // Perdeu o apontamento: deixa de ser o principal (links voltam ao padrão)
      ...(next.lost ? { primary: false } : {}),
    },
  });

  if (next.gained || next.lost || next.status !== d.status) {
    await db.auditLog.create({
      data: {
        action: next.gained
          ? "tenant.domain.verified"
          : next.lost
            ? "tenant.domain.lost"
            : "tenant.domain.failed",
        actorType: "SYSTEM",
        actorLabel: "Verificação de DNS",
        tenantId: d.tenantId,
        entityType: "TenantDomain",
        entityId: d.id,
        data: {
          hostname: d.hostname,
          from: d.status,
          to: next.status,
          wasPrimary: d.primary,
          error: next.lastError,
        },
      },
    });
  }
  return { checked: true, status: next.status, gained: next.gained, lost: next.lost };
}

const payloadSchema = z.object({ domainId: z.string().min(1) });

export function domainJobHandlers(
  db: PrismaClient,
  resolver: DnsResolver = systemResolver(),
  config: DomainConfig = domainConfigFromEnv(),
  log: Logger = console,
): Record<string, JobHandler> {
  return {
    [DOMAINS_VERIFY_QUEUE]: async (payload) => {
      const parsed = payloadSchema.safeParse(payload);
      if (!parsed.success) {
        log.warn(`[domínios] pedido inválido ignorado: ${parsed.error.message}`);
        return;
      }
      const r = await checkDomain(db, resolver, parsed.data.domainId, config);
      if (r.checked && r.gained) log.info(`[domínios] ${parsed.data.domainId} verificado`);
      if (r.checked && r.lost)
        log.warn(`[domínios] ${parsed.data.domainId} perdeu o apontamento (FAILED)`);
    },
  };
}

/**
 * Enfileira (sem duplicar) os domínios na hora de consultar: pendentes a cada
 * 5 min (viram FAILED depois de 7 dias) e verificados uma vez por dia.
 */
export async function sweepDomains(
  db: PrismaClient,
  config: DomainConfig = domainConfigFromEnv(),
  now = new Date(),
  limit = 500,
): Promise<number> {
  const candidates = await db.tenantDomain.findMany({
    where: {
      OR: [
        {
          status: "PENDING",
          OR: [
            { lastCheckedAt: null },
            { lastCheckedAt: { lte: new Date(now.getTime() - PENDING_RECHECK_MS) } },
          ],
        },
        {
          status: "VERIFIED",
          OR: [
            { lastCheckedAt: null },
            { lastCheckedAt: { lte: new Date(now.getTime() - VERIFIED_RECHECK_MS) } },
          ],
        },
      ],
    },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: { id: true, hostname: true, status: true, lastCheckedAt: true },
  });
  const due = candidates.filter(
    (d) => !isPlatformHost(d.hostname, config.platformDomains) && isDueForCheck(d, now),
  );
  for (const d of due)
    await enqueueJob(db, {
      queue: DOMAINS_VERIFY_QUEUE,
      payload: { domainId: d.id },
      uniqueKey: domainCheckKey(d.id),
      maxAttempts: 3,
    });
  return due.length;
}
