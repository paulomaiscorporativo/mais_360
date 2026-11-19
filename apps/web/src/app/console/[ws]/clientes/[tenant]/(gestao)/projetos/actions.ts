"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  PROJECT_FEATURES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  RESERVED_PROJECT_SLUGS,
  availableProjectFeatures,
  projectTemplate,
  projectSettingsSchema,
  readProjectSettings,
} from "@mais/core";
import { Prisma } from "@mais/db";
import { defineAction, v } from "@/server/action";
import { audit } from "@/server/audit";
import { requireTenant } from "@/server/auth";
import { AppError } from "@/server/errors";
import { modulesForTenant } from "@/server/modules";
import { requireProjectWriter } from "@/server/projects";
import { tenantDb } from "@/server/tenant-db";
import { slugify } from "@/server/tenants";
import { TIMEZONES } from "@/config/terms";

const feature = z.enum(PROJECT_FEATURES);
const dateOrNull = z
  .string()
  .trim()
  .transform((s) => (s ? new Date(`${s}T12:00:00Z`) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), "Data inválida.");

const projectData = z
  .object({
    name: v.text("o nome do projeto", 120),
    code: v.optionalText(40),
    description: v.optionalText(4000),
    startsAt: dateOrNull,
    endsAt: dateOrNull,
    timezone: z.enum(TIMEZONES.map((t) => t.value) as [string, ...string[]]),
    venueName: v.optionalText(160),
    venueAddress: v.optionalText(300),
    destination: v.optionalText(160),
  })
  .refine((d) => !d.startsAt || !d.endsAt || d.endsAt >= d.startsAt, {
    message: "O fim precisa ser depois do início.",
    path: ["endsAt"],
  });

async function uniqueSlug(db: ReturnType<typeof tenantDb>, base: string) {
  let root = slugify(base) || "projeto";
  if (RESERVED_PROJECT_SLUGS.has(root)) root = `${root}-1`;
  let slug = root;
  for (let i = 2; await db.project.findFirst({ where: { slug }, select: { id: true } }); i++) {
    slug = `${root}-${i}`;
  }
  return slug;
}

// ---------------------------------------------------------------------------
// Criar projeto
// ---------------------------------------------------------------------------

export const createProject = defineAction(
  z.object({
    tenant: z.string(),
    type: z.enum(PROJECT_TYPES),
    data: projectData,
    features: z.array(feature),
  }),
  async (input) => {
    const ctx = await requireTenant(input.tenant, "MANAGER");
    const db = tenantDb(ctx);
    const available = availableProjectFeatures(await modulesForTenant(ctx.tenant));
    const features = [...new Set(input.features)].filter((f) => available.has(f));
    const template = projectTemplate(input.type);
    const slug = await uniqueSlug(db, input.data.name);

    const project = await db.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          tenantId: ctx.tenantId,
          type: input.type,
          slug,
          ...input.data,
          timezone: input.data.timezone,
          settings: projectSettingsSchema.parse({}) as Prisma.InputJsonValue,
          features: { create: features.map((f) => ({ feature: f, enabled: true })) },
        },
      });
      if (template.categories.length) {
        await tx.registrationCategory.createMany({
          data: template.categories.map((c, i) => ({
            tenantId: ctx.tenantId,
            projectId: p.id,
            name: c.name,
            color: c.color,
            sortOrder: i,
          })),
        });
      }
      return p;
    });

    await audit({
      action: "project.create",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      projectId: project.id,
      entityType: "Project",
      entityId: project.id,
      data: { type: input.type, features },
    });
    revalidatePath(`/console/[ws]/clientes/${input.tenant}`, "layout");
    return { slug: project.slug };
  },
);

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------

export const updateProject = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    data: projectData,
    status: z.enum(PROJECT_STATUSES),
  }),
  async (input) => {
    const p = await requireProjectWriter(input.tenant, input.projectId);
    await p.db.project.update({
      where: { id: p.projectId },
      data: { ...input.data, status: input.status },
    });
    await audit({
      action: "project.update",
      userId: p.viewer.user.id,
      actorLabel: p.viewer.user.name,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "Project",
      entityId: p.projectId,
    });
    revalidatePath("/console", "layout");
  },
);

export const setProjectFeature = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), feature, enabled: z.boolean() }),
  async (input) => {
    const p = await requireProjectWriter(input.tenant, input.projectId);
    if (input.enabled && !p.available.has(input.feature)) {
      throw new AppError("Este recurso depende de um módulo que o cliente não contratou.");
    }
    await p.db.projectFeatureToggle.upsert({
      where: { projectId_feature: { projectId: p.projectId, feature: input.feature } },
      create: { projectId: p.projectId, feature: input.feature, enabled: input.enabled },
      update: { enabled: input.enabled },
    });
    await audit({
      action: input.enabled ? "project.feature.enable" : "project.feature.disable",
      userId: p.viewer.user.id,
      actorLabel: p.viewer.user.name,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "Project",
      entityId: p.projectId,
      data: { feature: input.feature },
    });
    revalidatePath("/console", "layout");
  },
);

export const updateFormSettings = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    form: projectSettingsSchema.shape.form,
  }),
  async (input) => {
    const p = await requireProjectWriter(input.tenant, input.projectId);
    if (input.form.defaultCategoryId) {
      const cat = await p.db.registrationCategory.findFirst({
        where: { id: input.form.defaultCategoryId, projectId: p.projectId },
      });
      if (!cat) throw new AppError("Categoria inválida.");
    }
    const current = readProjectSettings(p.project.settings);
    await p.db.project.update({
      where: { id: p.projectId },
      data: { settings: { ...current, form: input.form } as Prisma.InputJsonValue },
    });
    revalidatePath("/console", "layout");
  },
);

// ---------------------------------------------------------------------------
// Categorias e grupos
// ---------------------------------------------------------------------------

const labelItem = z.object({
  id: z.string().optional(),
  name: v.text("o nome", 60),
  color: v.hex(),
});

export const saveCategories = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    kind: z.enum(["category", "group"]),
    items: z.array(labelItem).max(40),
  }),
  async (input) => {
    const p = await requireProjectWriter(input.tenant, input.projectId);
    const names = input.items.map((i) => i.name.toLowerCase());
    if (new Set(names).size !== names.length) throw new AppError("Há nomes repetidos na lista.");

    await p.db.$transaction(async (tx) => {
      const model = input.kind === "category" ? tx.registrationCategory : tx.projectGroup;
      // `model` é uma união dos dois delegates; o Prisma não unifica as assinaturas.
      const m = model as unknown as typeof tx.registrationCategory;
      const existing = await m.findMany({ where: { projectId: p.projectId } });
      const keep = new Set(input.items.flatMap((i) => (i.id ? [i.id] : [])));
      for (const row of existing) {
        if (!keep.has(row.id)) await m.delete({ where: { id: row.id } });
      }
      // nomes temporários evitam colisão do índice único ao trocar nomes entre itens
      for (const it of input.items) {
        if (it.id && existing.some((e) => e.id === it.id)) {
          await m.update({ where: { id: it.id }, data: { name: `__tmp_${it.id}` } });
        }
      }
      for (const [i, it] of input.items.entries()) {
        const data =
          input.kind === "category"
            ? { name: it.name, color: it.color, sortOrder: i }
            : { name: it.name, color: it.color };
        if (it.id && existing.some((e) => e.id === it.id)) {
          await m.update({ where: { id: it.id }, data });
        } else {
          await m.create({ data: { tenantId: p.tenantId, projectId: p.projectId, ...data } });
        }
      }
    });
    revalidatePath("/console", "layout");
  },
);

export const archiveProject = defineAction(
  z.object({ tenant: z.string(), projectId: z.string() }),
  async (input) => {
    const p = await requireProjectWriter(input.tenant, input.projectId);
    if (p.role !== "ADMIN" && p.role !== "MANAGER")
      throw new AppError("Só gestores arquivam projetos.");
    await p.db.project.update({
      where: { id: p.projectId },
      data: { archivedAt: new Date(), status: "ARCHIVED" },
    });
    await audit({
      action: "project.archive",
      userId: p.viewer.user.id,
      actorLabel: p.viewer.user.name,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "Project",
      entityId: p.projectId,
    });
    revalidatePath("/console", "layout");
  },
);
