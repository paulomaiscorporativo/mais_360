"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TENANT_ROLE_INFO, TENANT_ROLES } from "@mais/core";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { requireTenant, type TenantContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import {
  deactivateOrUnlink,
  emailBrand,
  reactivate,
  resendInvite,
  sendResetByAdmin,
} from "@/server/team";
import { tenantDb } from "@/server/tenant-db";

/**
 * Ações por membro da equipe do cliente (além de adicionar/papel/remover, que
 * ficam em app/console/[ws]/actions.ts): convite, redefinição de senha,
 * desativação e acesso por projeto. Só administradores do cliente.
 */

const ref = { tenant: z.string(), membershipId: z.string().min(1) };

async function memberOf(slug: string, membershipId: string) {
  const ctx = await requireTenant(slug, "ADMIN");
  const m = await prisma.membership.findFirst({
    where: { id: membershipId, tenantId: ctx.tenantId },
    include: { user: true },
  });
  if (!m) throw new AppError("Pessoa não encontrada nesta equipe.");
  return { ctx, m };
}

const actor = (ctx: TenantContext) => ({
  userId: ctx.viewer.user.id,
  actorLabel: ctx.viewer.user.name,
  tenantId: ctx.tenantId,
});

const refresh = (ctx: TenantContext) =>
  revalidatePath(`/console/${ctx.workspace.slug}/clientes/${ctx.tenant.slug}/equipe`);

export const resendTenantInvite = defineAction(z.object(ref), async ({ tenant, membershipId }) => {
  const { ctx, m } = await memberOf(tenant, membershipId);
  const r = await resendInvite(m.userId, ctx.viewer.user.id, {
    brand: emailBrand(ctx.workspace, ctx.tenant.branding?.primaryColor),
    contextName: ctx.tenant.name,
    roleLabel: TENANT_ROLE_INFO[m.role].label,
    actorName: ctx.viewer.user.name,
  });
  await audit({
    ...actor(ctx),
    action: "user.invite.resend",
    entityType: "User",
    entityId: m.userId,
    data: { email: r.email, scope: "tenant" },
  });
  refresh(ctx);
  return r;
});

export const sendTenantMemberReset = defineAction(
  z.object(ref),
  async ({ tenant, membershipId }) => {
    const { ctx, m } = await memberOf(tenant, membershipId);
    const r = await sendResetByAdmin(m.userId, ctx.viewer.user.id, {
      brand: emailBrand(ctx.workspace, ctx.tenant.branding?.primaryColor),
      actorName: ctx.viewer.user.name,
    });
    await audit({
      ...actor(ctx),
      action: "user.password.reset.send",
      entityType: "User",
      entityId: m.userId,
      data: { email: r.email, tokenId: r.tokenId, scope: "tenant" },
    });
    return { email: r.email };
  },
);

export const deactivateTenantMember = defineAction(
  z.object(ref),
  async ({ tenant, membershipId }) => {
    const { ctx, m } = await memberOf(tenant, membershipId);
    const r = await deactivateOrUnlink(ctx.viewer, m.userId, (tx) =>
      tx.membership.delete({ where: { id: m.id } }),
    );
    await audit({
      ...actor(ctx),
      action: r.mode === "DEACTIVATED" ? "user.deactivate" : "tenant.member.remove",
      entityType: r.mode === "DEACTIVATED" ? "User" : "Membership",
      entityId: r.mode === "DEACTIVATED" ? m.userId : m.id,
      data: { email: m.user.email, scope: "tenant", reason: "deactivate" },
    });
    refresh(ctx);
    return r;
  },
);

export const reactivateTenantMember = defineAction(
  z.object(ref),
  async ({ tenant, membershipId }) => {
    const { ctx, m } = await memberOf(tenant, membershipId);
    await reactivate(ctx.viewer, m.userId);
    await audit({
      ...actor(ctx),
      action: "user.reactivate",
      entityType: "User",
      entityId: m.userId,
      data: { email: m.user.email, scope: "tenant" },
    });
    refresh(ctx);
  },
);

// ---------------------------------------------------------------------------
// Acesso por projeto
// ---------------------------------------------------------------------------

const projectsSchema = z.object({
  ...ref,
  allProjects: z.boolean(),
  projects: z
    .array(z.object({ projectId: z.string().min(1), role: z.enum(TENANT_ROLES).nullable() }))
    .max(500),
});

export const updateMemberProjects = defineAction(projectsSchema, async (input) => {
  const { ctx, m } = await memberOf(input.tenant, input.membershipId);
  if (m.role === "ADMIN" && !input.allProjects)
    throw new AppError("Administradores do cliente sempre veem todos os projetos.");
  if (!input.allProjects && input.projects.length === 0)
    throw new AppError("Escolha pelo menos um projeto ou libere todos.");

  const db = tenantDb(ctx);
  const ids = [...new Set(input.projects.map((p) => p.projectId))];
  const found = await db.project.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (found.length !== ids.length) throw new AppError("Algum projeto não pertence a este cliente.");
  const roleOf = new Map(input.projects.map((p) => [p.projectId, p.role]));

  await prisma.$transaction(async (tx) => {
    await tx.membership.update({ where: { id: m.id }, data: { allProjects: input.allProjects } });
    await tx.projectAccess.deleteMany({ where: { membershipId: m.id } });
    if (!input.allProjects) {
      await tx.projectAccess.createMany({
        data: ids.map((projectId) => ({
          membershipId: m.id,
          projectId,
          role: roleOf.get(projectId) ?? null,
        })),
      });
    }
  });
  await audit({
    ...actor(ctx),
    action: "tenant.member.projects",
    entityType: "Membership",
    entityId: m.id,
    data: {
      email: m.user.email,
      allProjects: input.allProjects,
      projects: input.allProjects
        ? []
        : ids.map((id) => ({ projectId: id, role: roleOf.get(id) ?? null })),
    },
  });
  refresh(ctx);
});
