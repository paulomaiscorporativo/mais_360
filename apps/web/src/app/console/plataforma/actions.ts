"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, v } from "@/server/action";
import { audit } from "@/server/audit";
import { requirePlatformRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { inviteWorkspaceMember } from "@/server/workspace-team";
import { RESERVED_SLUGS } from "@/config/terms";

const createWorkspaceSchema = z.object({
  name: v.text("o nome do assinante", 80),
  slug: v.slug().refine((s) => !RESERVED_SLUGS.has(s), "Este identificador é reservado."),
  legalName: v.optionalText(160),
  document: v.optionalText(20),
  billingEmail: z.union([v.email(), z.literal("")]),
  planId: z.string().min(1, "Escolha um plano."),
  trialDays: z.number().int().min(0).max(90),
  whiteLabel: z.boolean(),
  owner: z.object({ name: v.text("o nome do responsável", 120), email: v.email() }),
});

export const createWorkspace = defineAction(createWorkspaceSchema, async (input) => {
  const viewer = await requirePlatformRole(["SUPERADMIN"]);
  if (await prisma.workspace.findUnique({ where: { slug: input.slug } })) {
    throw new AppError(`O identificador "${input.slug}" já está em uso.`);
  }
  const plan = await prisma.plan.findUnique({ where: { id: input.planId } });
  if (!plan || plan.archivedAt) throw new AppError("Plano indisponível.");

  const trialEndsAt =
    input.trialDays > 0 ? new Date(Date.now() + input.trialDays * 86_400_000) : null;
  const result = await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        name: input.name,
        slug: input.slug,
        legalName: input.legalName,
        document: input.document.replace(/\D/g, ""),
        billingEmail: input.billingEmail,
        whiteLabel: input.whiteLabel,
        status: trialEndsAt ? "TRIAL" : "ACTIVE",
        trialEndsAt,
        subscription: {
          create: {
            planId: plan.id,
            status: trialEndsAt ? "TRIALING" : "ACTIVE",
            provider: "manual",
            currentPeriodEnd: trialEndsAt,
          },
        },
      },
    });
    const owner = await inviteWorkspaceMember(tx, {
      workspace,
      name: input.owner.name,
      email: input.owner.email,
      role: "OWNER",
      actor: { id: viewer.user.id, name: viewer.user.name },
    });
    return { workspace, owner };
  });

  await audit({
    action: "workspace.create",
    userId: viewer.user.id,
    actorLabel: viewer.user.name,
    entityType: "Workspace",
    entityId: result.workspace.id,
    data: { plan: plan.code, owner: input.owner.email },
  });
  if (result.owner.invite) {
    await audit({
      action: "user.invite.send",
      userId: viewer.user.id,
      actorLabel: viewer.user.name,
      entityType: "User",
      entityId: result.owner.userId,
      data: {
        email: result.owner.email,
        role: "OWNER",
        scope: "workspace",
        workspaceId: result.workspace.id,
      },
    });
  }
  revalidatePath("/console", "layout");
  return {
    slug: result.workspace.slug,
    ownerEmail: result.owner.email,
    invite: result.owner.invite,
  };
});
