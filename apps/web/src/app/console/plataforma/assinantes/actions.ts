"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  extendTrial,
  MAX_STATUS_REASON,
  MAX_TRIAL_EXTENSION_DAYS,
  planStatusTransition,
  subscriptionStatusFor,
  WORKSPACE_STATUS_ACTIONS,
  WORKSPACE_STATUSES,
} from "@mais/core/workspaces";
import { defineAction, v } from "@/server/action";
import { audit } from "@/server/audit";
import { requirePlatformRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { AppError, invalidFields, notFound } from "@/server/errors";

/**
 * Gestão de um assinante pela plataforma. Só SUPERADMIN altera; o suporte
 * (SUPPORT) apenas consulta a página. Toda mudança vai para o AuditLog com
 * entityType "Workspace" — é o histórico exibido na página do assinante.
 */

async function loadWorkspace(id: string) {
  const ws = await prisma.workspace.findUnique({
    where: { id },
    include: { subscription: { include: { plan: true } } },
  });
  if (!ws) throw notFound("Assinante não encontrado.");
  return ws;
}

function done(slug: string) {
  revalidatePath(`/console/plataforma/assinantes/${slug}`);
  revalidatePath("/console", "layout");
}

const detailsSchema = z.object({
  workspaceId: z.string().min(1),
  name: v.text("o nome do assinante", 80),
  legalName: v.optionalText(160),
  document: v.optionalText(20),
  billingEmail: z.union([v.email(), z.literal("")]),
  whiteLabel: z.boolean(),
});

export const updateWorkspaceDetails = defineAction(detailsSchema, async (input) => {
  const viewer = await requirePlatformRole(["SUPERADMIN"]);
  const ws = await loadWorkspace(input.workspaceId);
  const document = input.document.replace(/\D/g, "");
  if (document && document.length !== 14)
    throw invalidFields({ document: "O CNPJ tem 14 números." });
  const next = {
    name: input.name,
    legalName: input.legalName,
    document,
    billingEmail: input.billingEmail,
    whiteLabel: input.whiteLabel,
  };
  const changed = Object.fromEntries(
    Object.entries(next).filter(([k, val]) => ws[k as keyof typeof next] !== val),
  );
  if (!Object.keys(changed).length) return { slug: ws.slug };
  await prisma.workspace.update({ where: { id: ws.id }, data: next });
  await audit({
    action: "workspace.update",
    userId: viewer.user.id,
    actorLabel: viewer.user.name,
    entityType: "Workspace",
    entityId: ws.id,
    data: {
      changed: Object.keys(changed),
      before: Object.fromEntries(Object.keys(changed).map((k) => [k, ws[k as keyof typeof next]])),
      after: changed,
    },
  });
  done(ws.slug);
  return { slug: ws.slug };
});

export const changeWorkspacePlan = defineAction(
  z.object({ workspaceId: z.string().min(1), planId: z.string().min(1, "Escolha um plano.") }),
  async (input) => {
    const viewer = await requirePlatformRole(["SUPERADMIN"]);
    const ws = await loadWorkspace(input.workspaceId);
    const plan = await prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan || plan.archivedAt) throw new AppError("Plano indisponível.");
    if (ws.subscription?.planId === plan.id)
      throw new AppError(`${ws.name} já está no plano ${plan.name}.`);
    await prisma.subscription.upsert({
      where: { workspaceId: ws.id },
      create: {
        workspaceId: ws.id,
        planId: plan.id,
        provider: "manual",
        status: subscriptionStatusFor(ws.status) ?? "ACTIVE",
        currentPeriodEnd: ws.status === "TRIAL" ? ws.trialEndsAt : null,
      },
      update: { planId: plan.id },
    });
    await audit({
      action: "workspace.plan.change",
      userId: viewer.user.id,
      actorLabel: viewer.user.name,
      entityType: "Workspace",
      entityId: ws.id,
      data: { from: ws.subscription?.plan.name ?? null, to: plan.name },
    });
    done(ws.slug);
    return { plan: plan.name };
  },
);

export const extendWorkspaceTrial = defineAction(
  z.object({
    workspaceId: z.string().min(1),
    days: z
      .number({ error: "Informe a quantidade de dias." })
      .int("Use um número inteiro de dias.")
      .min(1, "Informe pelo menos 1 dia.")
      .max(MAX_TRIAL_EXTENSION_DAYS, `Use no máximo ${MAX_TRIAL_EXTENSION_DAYS} dias.`),
  }),
  async (input) => {
    const viewer = await requirePlatformRole(["SUPERADMIN"]);
    const ws = await loadWorkspace(input.workspaceId);
    const r = extendTrial(ws, input.days);
    if (!r.ok) throw new AppError(r.error);
    await prisma.$transaction([
      prisma.workspace.update({ where: { id: ws.id }, data: { trialEndsAt: r.trialEndsAt } }),
      prisma.subscription.updateMany({
        where: { workspaceId: ws.id },
        data: { currentPeriodEnd: r.trialEndsAt },
      }),
    ]);
    await audit({
      action: "workspace.trial.extend",
      userId: viewer.user.id,
      actorLabel: viewer.user.name,
      entityType: "Workspace",
      entityId: ws.id,
      data: {
        days: input.days,
        from: ws.trialEndsAt?.toISOString() ?? null,
        to: r.trialEndsAt.toISOString(),
      },
    });
    done(ws.slug);
    return { trialEndsAt: r.trialEndsAt.toISOString() };
  },
);

export const changeWorkspaceStatus = defineAction(
  z.object({
    workspaceId: z.string().min(1),
    action: z.enum(WORKSPACE_STATUS_ACTIONS),
    /** Situação que a pessoa viu na tela — evita aplicar sobre uma mudança concorrente. */
    expected: z.enum(WORKSPACE_STATUSES),
    reason: z
      .string()
      .trim()
      .min(1, "Explique o motivo da mudança.")
      .max(MAX_STATUS_REASON, `Use no máximo ${MAX_STATUS_REASON} caracteres.`),
  }),
  async (input) => {
    const viewer = await requirePlatformRole(["SUPERADMIN"]);
    const ws = await loadWorkspace(input.workspaceId);
    if (ws.status !== input.expected)
      throw new AppError(
        "A situação deste assinante mudou enquanto você editava. Recarregue a página.",
      );
    const t = planStatusTransition(ws.status, input.action, input.reason);
    if (!t.ok) throw invalidFields({ reason: t.error }, t.error);

    const subStatus = subscriptionStatusFor(t.to);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // Atualiza só se a situação ainda for a lida (corrida entre duas pessoas)
      const updated = await tx.workspace.updateMany({
        where: { id: ws.id, status: ws.status },
        data: { status: t.to, statusReason: t.reason, statusChangedAt: now },
      });
      if (updated.count !== 1)
        throw new AppError("A situação deste assinante acabou de mudar. Recarregue a página.");
      if (subStatus)
        await tx.subscription.updateMany({
          where: { workspaceId: ws.id },
          data: { status: subStatus },
        });
    });
    await audit({
      action: "workspace.status.change",
      userId: viewer.user.id,
      actorLabel: viewer.user.name,
      entityType: "Workspace",
      entityId: ws.id,
      data: { action: input.action, from: t.from, to: t.to, reason: t.reason },
    });
    done(ws.slug);
    return { status: t.to };
  },
);
