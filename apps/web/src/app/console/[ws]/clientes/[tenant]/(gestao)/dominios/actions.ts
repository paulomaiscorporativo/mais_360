"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isPlatformHost, validateCustomHostname } from "@mais/core/domains";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { requireTenant, requireWorkspace } from "@/server/auth";
import { prisma } from "@/server/db";
import {
  enqueueDomainCheck,
  newVerificationToken,
  platformDomains,
  platformHosts,
} from "@/server/domains";
import { AppError, invalidFields, notFound } from "@/server/errors";
import { tenantDb } from "@/server/tenant-db";

/** Limite de domínios próprios por cliente (evita cadastro em massa). */
const MAX_DOMAINS = 10;

/** Domínios são configuração do assinante: exige ADMIN (ou dono) do assinante. */
async function requireDomainAdmin(tenantSlug: string) {
  const ctx = await requireTenant(tenantSlug, "ADMIN");
  await requireWorkspace(ctx.workspace.slug, "ADMIN");
  return { ...ctx, db: tenantDb(ctx) };
}

async function ownDomain(ctx: Awaited<ReturnType<typeof requireDomainAdmin>>, domainId: string) {
  const d = await ctx.db.tenantDomain.findFirst({ where: { id: domainId } });
  if (!d) throw notFound("Domínio não encontrado.");
  return d;
}

function log(
  ctx: Awaited<ReturnType<typeof requireDomainAdmin>>,
  action: string,
  domain: { id: string; hostname: string },
  data: Record<string, string | boolean | null> = {},
) {
  return audit({
    action,
    userId: ctx.viewer.user.id,
    actorLabel: ctx.viewer.user.name,
    tenantId: ctx.tenantId,
    entityType: "TenantDomain",
    entityId: domain.id,
    data: { hostname: domain.hostname, ...data },
  });
}

const refresh = () => revalidatePath("/console", "layout");

export const addDomain = defineAction(
  z.object({ tenant: z.string().min(1), hostname: z.string().max(300) }),
  async (input) => {
    const ctx = await requireDomainAdmin(input.tenant);
    const check = validateCustomHostname(input.hostname, {
      platformDomains: platformDomains(),
      reservedHosts: platformHosts(),
    });
    if (!check.ok) throw invalidFields({ hostname: check.error }, check.error);

    const taken = await prisma.tenantDomain.findUnique({ where: { hostname: check.hostname } });
    if (taken) {
      const msg =
        taken.tenantId === ctx.tenantId
          ? "Esse domínio já está cadastrado neste cliente."
          : "Esse domínio já está em uso na plataforma. Se ele é seu, fale com o suporte.";
      throw invalidFields({ hostname: msg }, msg);
    }
    if ((await ctx.db.tenantDomain.count()) >= MAX_DOMAINS)
      throw new AppError(`Cada cliente pode ter até ${MAX_DOMAINS} domínios próprios.`);

    const domain = await ctx.db.tenantDomain.create({
      data: {
        tenantId: ctx.tenantId,
        hostname: check.hostname,
        status: "PENDING",
        verificationToken: newVerificationToken(),
      },
    });
    await enqueueDomainCheck(domain.id);
    await log(ctx, "tenant.domain.add", domain);
    refresh();
    return { id: domain.id, hostname: domain.hostname };
  },
);

export const verifyDomainNow = defineAction(
  z.object({ tenant: z.string().min(1), domainId: z.string().min(1) }),
  async (input) => {
    const ctx = await requireDomainAdmin(input.tenant);
    const domain = await ownDomain(ctx, input.domainId);
    if (isPlatformHost(domain.hostname, platformDomains()))
      throw new AppError("Endereços da plataforma são verificados pela própria plataforma.");
    await enqueueDomainCheck(domain.id);
    await log(ctx, "tenant.domain.verify", domain, { status: domain.status });
    return { queued: true };
  },
);

export const setPrimaryDomain = defineAction(
  z.object({ tenant: z.string().min(1), domainId: z.string().min(1).nullable() }),
  async (input) => {
    const ctx = await requireDomainAdmin(input.tenant);
    if (input.domainId === null) {
      // Volta ao subdomínio padrão
      const current = await ctx.db.tenantDomain.findFirst({ where: { primary: true } });
      if (!current) return { primary: null };
      await ctx.db.tenantDomain.updateMany({ where: { primary: true }, data: { primary: false } });
      await log(ctx, "tenant.domain.primary", current, { primary: false });
      refresh();
      return { primary: null };
    }
    const domain = await ownDomain(ctx, input.domainId);
    if (domain.status !== "VERIFIED")
      throw new AppError("Só um domínio verificado pode ser o principal. Verifique o DNS antes.");
    await prisma.$transaction([
      prisma.tenantDomain.updateMany({
        where: { tenantId: ctx.tenantId, primary: true, id: { not: domain.id } },
        data: { primary: false },
      }),
      prisma.tenantDomain.update({ where: { id: domain.id }, data: { primary: true } }),
    ]);
    await log(ctx, "tenant.domain.primary", domain, { primary: true });
    refresh();
    return { primary: domain.hostname };
  },
);

export const removeDomain = defineAction(
  z.object({ tenant: z.string().min(1), domainId: z.string().min(1) }),
  async (input) => {
    const ctx = await requireDomainAdmin(input.tenant);
    const domain = await ownDomain(ctx, input.domainId);
    if (isPlatformHost(domain.hostname, platformDomains()))
      throw new AppError(
        "Este endereço da plataforma mantém QR codes e links antigos funcionando. Para retirá-lo, fale com o suporte.",
      );
    await ctx.db.tenantDomain.delete({ where: { id: domain.id } });
    await log(ctx, "tenant.domain.remove", domain, {
      status: domain.status,
      wasPrimary: domain.primary,
    });
    refresh();
    return { removed: domain.hostname };
  },
);
