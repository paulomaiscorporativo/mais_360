"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PLATFORM_ROLE_INFO, platformRoleChangeProblem } from "@mais/core";
import { defineAction, v } from "@/server/action";
import { audit } from "@/server/audit";
import { requirePlatformRole, type Viewer } from "@/server/auth";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import {
  deactivateOrUnlink,
  emailBrand,
  inviteTeamMember,
  reactivate,
  resendInvite,
  sendResetByAdmin,
} from "@/server/team";

/**
 * Equipe da plataforma (superadmins e suporte). Só superadmin gerencia; a
 * plataforma nunca fica sem um superadmin ativo.
 */

const staffRole = z.enum(["SUPERADMIN", "SUPPORT"]);
const ref = { userId: z.string().min(1) };
const PATH = "/console/plataforma/equipe";

const actor = (viewer: Viewer) => ({ userId: viewer.user.id, actorLabel: viewer.user.name });

const activeSuperadmins = () =>
  prisma.user.count({ where: { platformRole: "SUPERADMIN", active: true } });

async function staffMember(userId: string) {
  const viewer = await requirePlatformRole(["SUPERADMIN"]);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.platformRole === "NONE")
    throw new AppError("Pessoa não encontrada na equipe da plataforma.");
  return { viewer, user };
}

export const invitePlatformMember = defineAction(
  z.object({ name: v.text("o nome", 120), email: v.email(), role: staffRole }),
  async ({ name, email, role }) => {
    const viewer = await requirePlatformRole(["SUPERADMIN"]);
    const r = await prisma.$transaction((tx) =>
      inviteTeamMember(tx, {
        name,
        email,
        actorId: viewer.user.id,
        scopeKey: "platform",
        emailContext: {
          brand: emailBrand(null),
          contextName: "equipe da plataforma",
          roleLabel: PLATFORM_ROLE_INFO[role].label,
          actorName: viewer.user.name,
        },
        link: async (userId) => {
          const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
          if (u.platformRole !== "NONE")
            throw new AppError(`${email} já faz parte da equipe da plataforma.`, "CONFLICT");
          return tx.user.update({ where: { id: userId }, data: { platformRole: role } });
        },
      }),
    );
    await audit({
      ...actor(viewer),
      action: r.invite ? "user.invite.send" : "platform.member.add",
      entityType: "User",
      entityId: r.userId,
      data: { email, role, scope: "platform" },
    });
    revalidatePath(PATH);
    return { email: r.email, invite: r.invite };
  },
);

export const updatePlatformRole = defineAction(
  z.object({ ...ref, role: z.enum(["SUPERADMIN", "SUPPORT", "NONE"]) }),
  async ({ userId, role }) => {
    const { viewer, user } = await staffMember(userId);
    const problem = platformRoleChangeProblem({
      currentRole: user.platformRole,
      nextRole: role,
      isSelf: userId === viewer.user.id,
      superadmins: await activeSuperadmins(),
    });
    if (problem) throw new AppError(problem);
    if (user.platformRole === role) return;
    await prisma.user.update({ where: { id: userId }, data: { platformRole: role } });
    await audit({
      ...actor(viewer),
      action: role === "NONE" ? "platform.member.remove" : "platform.member.role",
      entityType: "User",
      entityId: userId,
      data: { email: user.email, from: user.platformRole, role },
    });
    revalidatePath(PATH);
  },
);

export const resendPlatformInvite = defineAction(z.object(ref), async ({ userId }) => {
  const { viewer, user } = await staffMember(userId);
  const r = await resendInvite(userId, viewer.user.id, {
    brand: emailBrand(null),
    contextName: "equipe da plataforma",
    roleLabel: user.platformRole === "NONE" ? "" : PLATFORM_ROLE_INFO[user.platformRole].label,
    actorName: viewer.user.name,
  });
  await audit({
    ...actor(viewer),
    action: "user.invite.resend",
    entityType: "User",
    entityId: userId,
    data: { email: r.email, scope: "platform" },
  });
  revalidatePath(PATH);
  return r;
});

export const sendPlatformMemberReset = defineAction(z.object(ref), async ({ userId }) => {
  const { viewer } = await staffMember(userId);
  const r = await sendResetByAdmin(userId, viewer.user.id, {
    brand: emailBrand(null),
    actorName: viewer.user.name,
  });
  await audit({
    ...actor(viewer),
    action: "user.password.reset.send",
    entityType: "User",
    entityId: userId,
    data: { email: r.email, tokenId: r.tokenId, scope: "platform" },
  });
  return { email: r.email };
});

export const deactivatePlatformMember = defineAction(z.object(ref), async ({ userId }) => {
  const { viewer, user } = await staffMember(userId);
  if (user.platformRole === "SUPERADMIN" && user.active && (await activeSuperadmins()) <= 1)
    throw new AppError("A plataforma precisa de pelo menos um superadmin ativo.");
  // Superadmin administra todos os vínculos: sempre desativa a conta
  const r = await deactivateOrUnlink(viewer, userId, async () => {
    throw new AppError("Não foi possível desativar esta conta.");
  });
  await audit({
    ...actor(viewer),
    action: "user.deactivate",
    entityType: "User",
    entityId: userId,
    data: { email: user.email, scope: "platform" },
  });
  revalidatePath(PATH);
  return r;
});

export const reactivatePlatformMember = defineAction(z.object(ref), async ({ userId }) => {
  const { viewer, user } = await staffMember(userId);
  await reactivate(viewer, userId);
  await audit({
    ...actor(viewer),
    action: "user.reactivate",
    entityType: "User",
    entityId: userId,
    data: { email: user.email, scope: "platform" },
  });
  revalidatePath(PATH);
});
