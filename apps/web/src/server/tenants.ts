import "server-only";
import { randomInt } from "node:crypto";
import { TENANT_ROLE_INFO, withDependencies, type ModuleKey } from "@mais/core";
import type { Prisma, TenantRole } from "@mais/db";
import { prisma } from "./db";
import { emailBrand, inviteTeamMember, type InviteOutcome } from "./team";

/** Senha provisória legível (sem 0/O, 1/l), exibida uma única vez. */
export function temporaryPassword(length = 12): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[randomInt(chars.length)];
  // garante letra e número (política de senha)
  return out.slice(0, -2) + "a" + String(randomInt(2, 10));
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Concede ao cliente exatamente o conjunto pedido (+ dependências), desligando o resto. */
export async function setTenantModules(
  tx: Prisma.TransactionClient,
  tenantId: string,
  modules: ModuleKey[],
) {
  const wanted = withDependencies(modules);
  const existing = await tx.tenantModule.findMany({ where: { tenantId } });
  for (const row of existing) {
    if (!wanted.has(row.module) && row.enabled) {
      await tx.tenantModule.update({
        where: { tenantId_module: { tenantId, module: row.module } },
        data: { enabled: false },
      });
    }
  }
  for (const key of wanted) {
    await tx.tenantModule.upsert({
      where: { tenantId_module: { tenantId, module: key } },
      create: { tenantId, module: key, enabled: true },
      update: { enabled: true },
    });
  }
  return wanted;
}

/**
 * Dá acesso ao cliente: cria a conta se não existir (sem senha — a pessoa
 * define a própria pelo convite), faz o vínculo e enfileira o e-mail. Quem já
 * tem conta ativa recebe só o vínculo e um aviso.
 */
export async function inviteTenantMember(
  tx: Prisma.TransactionClient,
  input: {
    tenant: {
      id: string;
      name: string;
      workspace: { name: string; whiteLabel: boolean };
      branding?: { primaryColor: string } | null;
    };
    name: string;
    email: string;
    role: TenantRole;
    actor: { id: string; name: string };
  },
): Promise<InviteOutcome> {
  return inviteTeamMember(tx, {
    name: input.name,
    email: input.email,
    actorId: input.actor.id,
    scopeKey: `tenant:${input.tenant.id}`,
    emailContext: {
      brand: emailBrand(input.tenant.workspace, input.tenant.branding?.primaryColor),
      contextName: input.tenant.name,
      roleLabel: TENANT_ROLE_INFO[input.role].label,
      actorName: input.actor.name,
    },
    link: (userId) =>
      tx.membership.upsert({
        where: { tenantId_userId: { tenantId: input.tenant.id, userId } },
        create: { tenantId: input.tenant.id, userId, role: input.role },
        update: { role: input.role },
      }),
  });
}

export async function tenantSlugTaken(slug: string) {
  return !!(await prisma.tenant.findUnique({ where: { slug }, select: { id: true } }));
}
