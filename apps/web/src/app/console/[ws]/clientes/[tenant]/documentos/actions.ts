"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DOCUMENT_KINDS, safeParseDefinition } from "@mais/core";
import type { Prisma } from "@mais/db";
import { defineAction, v } from "@/server/action";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import {
  getTemplateForTenant,
  requireDocumentsTenant,
  starterDefinition,
} from "@/server/documents";
import { AppError } from "@/server/errors";

const ref = { tenant: z.string().min(1) };
const kind = z.enum(DOCUMENT_KINDS);
const STARTS = ["BLANK", "LABEL_80X40", "BADGE_A6", "VOUCHER_A4"] as const;

function revalidate(slug: string) {
  revalidatePath(`/console/[ws]/clientes/${slug}/documentos`, "layout");
}

function json(def: unknown): Prisma.InputJsonValue {
  return def as Prisma.InputJsonValue;
}

export const createTemplate = defineAction(
  z.object({ ...ref, kind, name: v.text("o nome do modelo", 120), start: z.enum(STARTS) }),
  async ({ tenant: slug, kind, name, start }) => {
    const ctx = await requireDocumentsTenant(slug, "MANAGER");
    const def = starterDefinition(kind, start);
    const isFirst = (await prisma.documentTemplate.count({
      where: { tenantId: ctx.tenantId, kind, projectId: null, archivedAt: null },
    })) === 0;
    const t = await prisma.documentTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        kind,
        name,
        definition: json({ ...def, kind }),
        isDefault: isFirst,
        createdBy: ctx.viewer.user.name,
      },
    });
    await audit({
      action: "document.template.create",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      entityType: "DocumentTemplate",
      entityId: t.id,
      data: { kind, name, start },
    });
    revalidate(slug);
    return { id: t.id };
  },
);

export const duplicateTemplate = defineAction(
  z.object({ ...ref, templateId: z.string() }),
  async ({ tenant: slug, templateId }) => {
    const ctx = await requireDocumentsTenant(slug, "MANAGER");
    const src = await getTemplateForTenant(templateId, ctx.tenantId);
    const t = await prisma.documentTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        projectId: src.projectId,
        kind: src.kind,
        name: `${src.name} (cópia)`.slice(0, 120),
        description: src.description,
        definition: json(src.definition),
        backgroundFileId: src.backgroundFileId,
        visibleToPerson: src.visibleToPerson,
        createdBy: ctx.viewer.user.name,
      },
    });
    await audit({
      action: "document.template.duplicate",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      entityType: "DocumentTemplate",
      entityId: t.id,
      data: { from: src.id },
    });
    revalidate(slug);
    return { id: t.id };
  },
);

export const setDefaultTemplate = defineAction(
  z.object({ ...ref, templateId: z.string() }),
  async ({ tenant: slug, templateId }) => {
    const ctx = await requireDocumentsTenant(slug, "MANAGER");
    const t = await getTemplateForTenant(templateId, ctx.tenantId);
    await prisma.$transaction([
      prisma.documentTemplate.updateMany({
        where: { tenantId: ctx.tenantId, kind: t.kind, projectId: t.projectId, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.documentTemplate.update({ where: { id: t.id }, data: { isDefault: true } }),
    ]);
    await audit({
      action: "document.template.default",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      entityType: "DocumentTemplate",
      entityId: t.id,
    });
    revalidate(slug);
  },
);

export const archiveTemplate = defineAction(
  z.object({ ...ref, templateId: z.string() }),
  async ({ tenant: slug, templateId }) => {
    const ctx = await requireDocumentsTenant(slug, "MANAGER");
    const t = await getTemplateForTenant(templateId, ctx.tenantId);
    await prisma.documentTemplate.update({
      where: { id: t.id },
      data: { archivedAt: new Date(), isDefault: false },
    });
    await audit({
      action: "document.template.archive",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      entityType: "DocumentTemplate",
      entityId: t.id,
    });
    revalidate(slug);
  },
);

/**
 * Salva a definição. A versão anterior fica guardada na auditoria
 * (`document.template.save`), o que permite listar e restaurar versões.
 */
export const saveTemplate = defineAction(
  z.object({
    ...ref,
    templateId: z.string(),
    name: v.text("o nome do modelo", 120),
    visibleToPerson: z.boolean(),
    definition: z.unknown(),
    expectedVersion: z.number().int(),
  }),
  async ({ tenant: slug, templateId, name, visibleToPerson, definition, expectedVersion }) => {
    const ctx = await requireDocumentsTenant(slug, "MANAGER");
    const t = await getTemplateForTenant(templateId, ctx.tenantId);
    const parsed = safeParseDefinition(definition);
    if (!parsed.success) throw new AppError("O modelo tem dados inválidos. Revise os elementos destacados.");
    if (parsed.data.kind !== t.kind) throw new AppError("O tipo do documento não pode mudar.");
    if (t.version !== expectedVersion) {
      throw new AppError(
        "Outra pessoa salvou este modelo enquanto você editava. Recarregue para ver a versão atual.",
        "CONFLICT",
      );
    }
    const bg = parsed.data.page.background?.fileId ?? null;
    const updated = await prisma.documentTemplate.update({
      where: { id: t.id },
      data: {
        name,
        visibleToPerson,
        definition: json(parsed.data),
        backgroundFileId: bg,
        version: { increment: 1 },
      },
    });
    await audit({
      action: "document.template.save",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      entityType: "DocumentTemplate",
      entityId: t.id,
      data: { version: t.version, name: t.name, definition: json(t.definition) },
    });
    revalidate(slug);
    return { version: updated.version };
  },
);

/** Volta o modelo para uma versão anterior (gera uma nova versão). */
export const restoreTemplateVersion = defineAction(
  z.object({ ...ref, templateId: z.string(), auditId: z.string() }),
  async ({ tenant: slug, templateId, auditId }) => {
    const ctx = await requireDocumentsTenant(slug, "MANAGER");
    const t = await getTemplateForTenant(templateId, ctx.tenantId);
    const log = await prisma.auditLog.findFirst({
      where: {
        id: auditId,
        tenantId: ctx.tenantId,
        entityType: "DocumentTemplate",
        entityId: t.id,
        action: "document.template.save",
      },
    });
    const old = (log?.data as { definition?: unknown; version?: number } | null) ?? null;
    const parsed = safeParseDefinition(old?.definition);
    if (!parsed.success) throw new AppError("Esta versão não pode mais ser restaurada.");
    const updated = await prisma.documentTemplate.update({
      where: { id: t.id },
      data: {
        definition: json(parsed.data),
        backgroundFileId: parsed.data.page.background?.fileId ?? null,
        version: { increment: 1 },
      },
    });
    await audit({
      action: "document.template.save",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      entityType: "DocumentTemplate",
      entityId: t.id,
      data: {
        version: t.version,
        name: t.name,
        definition: json(t.definition),
        restoredFrom: old?.version ?? null,
      },
    });
    revalidate(slug);
    return { version: updated.version, definition: parsed.data };
  },
);
