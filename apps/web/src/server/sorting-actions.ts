"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readProjectSettings } from "@mais/core";
import { describeSortSpec, readSortingSettings, sortSpecSchema } from "@mais/core/sorting";
import type { Prisma } from "@mais/db";
import { defineAction } from "./action";
import { audit } from "./audit";
import { requireTenant } from "./auth";
import { prisma } from "./db";
import { requireProjectWriter } from "./projects";

/**
 * Padrões de ordenação das listas: do cliente (Tenant.settings.sorting) e do
 * projeto (Project.settings.sorting). `null` = herdar do nível de cima.
 */

function settingsObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>) }
    : {};
}

export const saveTenantSorting = defineAction(
  z.object({ tenant: z.string(), spec: sortSpecSchema.nullable() }),
  async ({ tenant, spec }) => {
    const ctx = await requireTenant(tenant, "MANAGER");
    const settings = settingsObject(ctx.tenant.settings);
    const before = readSortingSettings(settings);
    if (spec) settings.sorting = spec;
    else delete settings.sorting;
    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { settings: settings as Prisma.InputJsonObject },
    });
    await audit({
      action: "tenant.sorting.update",
      userId: ctx.viewer.user.id,
      tenantId: ctx.tenantId,
      entityType: "Tenant",
      entityId: ctx.tenantId,
      data: {
        before: before ? describeSortSpec(before) : null,
        after: spec ? describeSortSpec(spec) : null,
        spec: spec ?? null,
      },
    });
    revalidatePath("/console", "layout");
    return null;
  },
);

export const saveProjectSorting = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), spec: sortSpecSchema.nullable() }),
  async ({ tenant, projectId, spec }) => {
    const p = await requireProjectWriter(tenant, projectId);
    const before = readSortingSettings(p.project.settings);
    // Mantém as outras chaves (form, travel, invites…) — nunca sobrescreve o objeto
    const settings: Record<string, unknown> = {
      ...settingsObject(p.project.settings),
      ...readProjectSettings(p.project.settings),
    };
    if (spec) settings.sorting = spec;
    else delete settings.sorting;
    await p.db.project.updateMany({
      where: { id: p.projectId },
      data: { settings: settings as Prisma.InputJsonObject },
    });
    await audit({
      action: "project.sorting.update",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "Project",
      entityId: p.projectId,
      data: {
        before: before ? describeSortSpec(before) : null,
        after: spec ? describeSortSpec(spec) : null,
        spec: spec ?? null,
      },
    });
    revalidatePath("/console", "layout");
    return null;
  },
);
