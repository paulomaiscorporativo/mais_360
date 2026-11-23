"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  WORKSPACE_ROLE_INFO,
  WORKSPACE_ROLES,
  workspaceInviteProblem,
  workspaceRemovalProblem,
  workspaceRoleChangeProblem,
} from "@mais/core";
import { defineAction, v } from "@/server/action";
import { audit } from "@/server/audit";
import { requireWorkspace, type WorkspaceContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import {
  deactivateOrUnlink,
  emailBrand,
  reactivate,
  resendInvite,
  sendResetByAdmin,
} from "@/server/team";
import { inviteWorkspaceMember, workspaceTeamCounts } from "@/server/workspace-team";

/**
 * Equipe do assinante: convidar, mudar papel, reenviar convite, redefinir
 * senha, desativar/reativar e remover. Só donos e administradores; as regras
 * de "último dono" e "último administrador" ficam em @mais/core/access.
 */

const role = z.enum(WORKSPACE_ROLES);
const ref = { ws: z.string(), userId: z.string().min(1) };

async function managerOf(ws: string) {
  const ctx = await requireWorkspace(ws, "ADMIN");
  return ctx;
}

async function memberOf(ws: string, userId: string) {
  const ctx = await managerOf(ws);
  const m = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId } },
    include: { user: true },
  });
  if (!m) throw new AppError("Pessoa não encontrada nesta equipe.");
  return { ctx, m };
}

const actor = (ctx: WorkspaceContext) => ({
  userId: ctx.viewer.user.id,
  actorLabel: ctx.viewer.user.name,
});

const refresh = (ctx: WorkspaceContext) => revalidatePath(`/console/${ctx.workspace.slug}/equipe`);

export const inviteToWorkspace = defineAction(
  z.object({ ws: z.string(), name: v.text("o nome", 120), email: v.email(), role }),
  async ({ ws, name, email, role }) => {
    const ctx = await managerOf(ws);
    const problem = workspaceInviteProblem(ctx.role, role);
    if (problem) throw new AppError(problem, "FORBIDDEN");
    const r = await prisma.$transaction((tx) =>
      inviteWorkspaceMember(tx, {
        workspace: ctx.workspace,
        name,
        email,
        role,
        actor: { id: ctx.viewer.user.id, name: ctx.viewer.user.name },
      }),
    );
    await audit({
      ...actor(ctx),
      action: r.invite ? "user.invite.send" : "workspace.member.add",
      entityType: "User",
      entityId: r.userId,
      data: { email, role, scope: "workspace", workspaceId: ctx.workspace.id },
    });
    refresh(ctx);
    return { email: r.email, invite: r.invite };
  },
);

export const updateWorkspaceMemberRole = defineAction(
  z.object({ ...ref, role }),
  async ({ ws, userId, role: nextRole }) => {
    const { ctx, m } = await memberOf(ws, userId);
    const problem = workspaceRoleChangeProblem({
      actorRole: ctx.role,
      currentRole: m.role,
      nextRole,
      isSelf: userId === ctx.viewer.user.id,
      counts: await workspaceTeamCounts(ctx.workspace.id),
    });
    if (problem) throw new AppError(problem);
    if (m.role === nextRole) return;
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId } },
      data: { role: nextRole },
    });
    await audit({
      ...actor(ctx),
      action: "workspace.member.role",
      entityType: "User",
      entityId: userId,
      data: { from: m.role, role: nextRole, workspaceId: ctx.workspace.id },
    });
    refresh(ctx);
  },
);

export const removeWorkspaceMember = defineAction(z.object(ref), async ({ ws, userId }) => {
  const { ctx, m } = await memberOf(ws, userId);
  const problem = workspaceRemovalProblem({
    actorRole: ctx.role,
    targetRole: m.role,
    isSelf: userId === ctx.viewer.user.id,
    counts: await workspaceTeamCounts(ctx.workspace.id),
  });
  if (problem) throw new AppError(problem);
  await prisma.workspaceMember.delete({
    where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId } },
  });
  await audit({
    ...actor(ctx),
    action: "workspace.member.remove",
    entityType: "User",
    entityId: userId,
    data: { email: m.user.email, role: m.role, workspaceId: ctx.workspace.id },
  });
  refresh(ctx);
});

export const resendWorkspaceInvite = defineAction(z.object(ref), async ({ ws, userId }) => {
  const { ctx, m } = await memberOf(ws, userId);
  const r = await resendInvite(userId, ctx.viewer.user.id, {
    brand: emailBrand(ctx.workspace),
    contextName: ctx.workspace.name,
    roleLabel: WORKSPACE_ROLE_INFO[m.role].label,
    actorName: ctx.viewer.user.name,
  });
  await audit({
    ...actor(ctx),
    action: "user.invite.resend",
    entityType: "User",
    entityId: userId,
    data: { email: r.email, scope: "workspace", workspaceId: ctx.workspace.id },
  });
  refresh(ctx);
  return r;
});

export const sendWorkspaceMemberReset = defineAction(z.object(ref), async ({ ws, userId }) => {
  const { ctx } = await memberOf(ws, userId);
  const r = await sendResetByAdmin(userId, ctx.viewer.user.id, {
    brand: emailBrand(ctx.workspace),
    actorName: ctx.viewer.user.name,
  });
  await audit({
    ...actor(ctx),
    action: "user.password.reset.send",
    entityType: "User",
    entityId: userId,
    data: { email: r.email, tokenId: r.tokenId, scope: "workspace", workspaceId: ctx.workspace.id },
  });
  return { email: r.email };
});

export const deactivateWorkspaceMember = defineAction(z.object(ref), async ({ ws, userId }) => {
  const { ctx, m } = await memberOf(ws, userId);
  // Desativar o dono equivale a removê-lo: as mesmas travas valem
  const problem = workspaceRemovalProblem({
    actorRole: ctx.role,
    targetRole: m.role,
    isSelf: userId === ctx.viewer.user.id,
    counts: await workspaceTeamCounts(ctx.workspace.id),
  });
  if (problem) throw new AppError(problem);
  const r = await deactivateOrUnlink(ctx.viewer, userId, (tx) =>
    tx.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId } },
    }),
  );
  await audit({
    ...actor(ctx),
    action: r.mode === "DEACTIVATED" ? "user.deactivate" : "workspace.member.remove",
    entityType: "User",
    entityId: userId,
    data: { email: m.user.email, scope: "workspace", workspaceId: ctx.workspace.id },
  });
  refresh(ctx);
  return r;
});

export const reactivateWorkspaceMember = defineAction(z.object(ref), async ({ ws, userId }) => {
  const { ctx, m } = await memberOf(ws, userId);
  await reactivate(ctx.viewer, userId);
  await audit({
    ...actor(ctx),
    action: "user.reactivate",
    entityType: "User",
    entityId: userId,
    data: { email: m.user.email, scope: "workspace", workspaceId: ctx.workspace.id },
  });
  refresh(ctx);
});
