import "server-only";
import { randomInt } from "node:crypto";
import { withDependencies, type ModuleKey } from "@mais/core";
import type { Prisma, TenantRole } from "@mais/db";
import { prisma } from "./db";
import { hashPassword } from "./password";

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
 * Garante o usuário (cria com senha provisória se não existir) e o vínculo com o
 * cliente. Devolve a senha provisória só quando a conta foi criada agora.
 */
export async function addTenantMember(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; name: string; email: string; role: TenantRole },
) {
  let user = await tx.user.findUnique({ where: { email: input.email } });
  let tempPassword: string | null = null;
  if (!user) {
    tempPassword = temporaryPassword();
    user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
      },
    });
  }
  await tx.membership.upsert({
    where: { tenantId_userId: { tenantId: input.tenantId, userId: user.id } },
    create: { tenantId: input.tenantId, userId: user.id, role: input.role },
    update: { role: input.role },
  });
  return { user, tempPassword };
}

export async function tenantSlugTaken(slug: string) {
  return !!(await prisma.tenant.findUnique({ where: { slug }, select: { id: true } }));
}
