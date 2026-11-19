"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { foldText, parseYes, splitFullName } from "@mais/core";
import { defineAction, v } from "@/server/action";
import { audit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { upsertPerson } from "@/server/people";
import { newRegistrationToken, requireProjectWriter, shortCodeAllocator } from "@/server/projects";

const ROLES = [
  "TRAVELER",
  "COMPANION",
  "GUEST",
  "ATTENDEE",
  "EXHIBITOR",
  "SPEAKER",
  "STAFF",
  "PRESS",
] as const;
const STATUSES = ["PENDING", "INVITED", "CONFIRMED", "DECLINED", "WAITLIST", "CANCELED"] as const;

const personFields = z.object({
  firstName: v.text("o nome", 80),
  lastName: v.optionalText(120),
  email: z.string().trim().max(160).default(""),
  phone: z.string().trim().max(40).default(""),
  cpf: z.string().trim().max(20).default(""),
  organization: v.optionalText(160),
  jobTitle: v.optionalText(120),
});

// ---------------------------------------------------------------------------
// Busca de pessoas do cliente (para "adicionar pessoa existente")
// ---------------------------------------------------------------------------

export const searchPeople = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), q: z.string().trim().max(80) }),
  async ({ tenant, projectId, q }) => {
    const p = await requireProjectWriter(tenant, projectId);
    const term = foldText(q);
    if (term.length < 2) return [];
    const digits = q.replace(/\D/g, "");
    const people = await p.db.person.findMany({
      where: {
        archivedAt: null,
        OR: [
          { searchText: { contains: term } },
          ...(digits.length >= 6
            ? [{ cpf: { contains: digits } }, { phone: { contains: digits } }]
            : []),
        ],
      },
      take: 8,
      orderBy: { firstName: "asc" },
      include: {
        registrations: { where: { projectId }, select: { id: true } },
        organizations: { include: { organization: true }, take: 1 },
      },
    });
    return people.map((x) => ({
      id: x.id,
      name: `${x.firstName} ${x.lastName}`.trim(),
      detail: x.organizations[0]?.organization.name || x.email || x.jobTitle || "",
      alreadyIn: x.registrations.length > 0,
    }));
  },
);

// ---------------------------------------------------------------------------
// Adicionar uma inscrição
// ---------------------------------------------------------------------------

export const addRegistration = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    personId: z.string().nullable(),
    person: personFields.nullable(),
    role: z.enum(ROLES).default("ATTENDEE"),
    categoryId: z.string().nullable(),
    groupId: z.string().nullable(),
    status: z.enum(STATUSES).default("CONFIRMED"),
    companionOfId: z.string().nullable().default(null),
  }),
  async (input) => {
    const p = await requireProjectWriter(input.tenant, input.projectId);
    let personId = input.personId;
    let organization = input.person?.organization ?? "";
    if (!personId) {
      if (!input.person) throw new AppError("Informe a pessoa.");
      personId = (await upsertPerson(p.db, p.tenantId, input.person)).person.id;
    } else {
      const exists = await p.db.person.findFirst({
        where: { id: personId },
        include: { organizations: { include: { organization: true }, take: 1 } },
      });
      if (!exists) throw new AppError("Pessoa não encontrada.");
      organization = exists.organizations[0]?.organization.name ?? "";
    }
    await assertRefs(p, input.categoryId, input.groupId, input.companionOfId);

    const already = await p.db.registration.findFirst({
      where: { projectId: p.projectId, personId, role: input.role },
    });
    if (already) throw new AppError("Esta pessoa já está inscrita neste projeto com este papel.");

    const nextCode = await shortCodeAllocator(p.db, p.projectId);
    const reg = await p.db.registration.create({
      data: {
        tenantId: p.tenantId,
        projectId: p.projectId,
        personId,
        role: input.companionOfId ? "COMPANION" : input.role,
        status: input.status,
        source: "MANUAL",
        categoryId: input.categoryId,
        groupId: input.groupId,
        companionOfId: input.companionOfId,
        displayCompany: organization,
        displayJobTitle: input.person?.jobTitle ?? "",
        token: newRegistrationToken(),
        shortCode: nextCode(),
        confirmedAt: input.status === "CONFIRMED" ? new Date() : null,
      },
    });
    await audit({
      action: "registration.create",
      userId: p.viewer.user.id,
      actorLabel: p.viewer.user.name,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "Registration",
      entityId: reg.id,
    });
    revalidatePath("/console", "layout");
    return { id: reg.id };
  },
);

async function assertRefs(
  p: Awaited<ReturnType<typeof requireProjectWriter>>,
  categoryId: string | null,
  groupId: string | null,
  companionOfId: string | null,
) {
  if (
    categoryId &&
    !(await p.db.registrationCategory.findFirst({
      where: { id: categoryId, projectId: p.projectId },
    }))
  )
    throw new AppError("Categoria inválida.");
  if (
    groupId &&
    !(await p.db.projectGroup.findFirst({ where: { id: groupId, projectId: p.projectId } }))
  )
    throw new AppError("Grupo inválido.");
  if (
    companionOfId &&
    !(await p.db.registration.findFirst({ where: { id: companionOfId, projectId: p.projectId } }))
  )
    throw new AppError("Titular inválido.");
}

// ---------------------------------------------------------------------------
// Atualizar / cancelar
// ---------------------------------------------------------------------------

export const updateRegistration = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    ids: z.array(z.string()).min(1).max(1000),
    patch: z.object({
      status: z.enum(STATUSES).optional(),
      categoryId: z.string().nullable().optional(),
      groupId: z.string().nullable().optional(),
    }),
  }),
  async ({ tenant, projectId, ids, patch }) => {
    const p = await requireProjectWriter(tenant, projectId);
    await assertRefs(p, patch.categoryId ?? null, patch.groupId ?? null, null);
    const now = new Date();
    const data = {
      ...patch,
      ...(patch.status === "CONFIRMED" ? { confirmedAt: now } : {}),
      ...(patch.status === "CANCELED" ? { canceledAt: now, canceledBy: p.viewer.user.name } : {}),
    };
    const r = await p.db.registration.updateMany({
      where: { projectId: p.projectId, id: { in: ids } },
      data,
    });
    await audit({
      action: "registration.update",
      userId: p.viewer.user.id,
      actorLabel: p.viewer.user.name,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "Registration",
      data: { count: r.count, patch },
    });
    revalidatePath("/console", "layout");
    return { count: r.count };
  },
);

// ---------------------------------------------------------------------------
// Importação de planilha (linhas já mapeadas no navegador)
// ---------------------------------------------------------------------------

const importRow = z.object({
  fullName: z.string().max(200).optional(),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(120).optional(),
  badgeName: z.string().max(80).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  cpf: z.string().max(20).optional(),
  organization: z.string().max(160).optional(),
  jobTitle: z.string().max(120).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(20).optional(),
  category: z.string().max(60).optional(),
  group: z.string().max(60).optional(),
  consent: z.string().max(40).optional(),
  externalId: z.string().max(80).optional(),
  notes: z.string().max(1000).optional(),
});

export const importRegistrations = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    rows: z.array(importRow).min(1).max(5000),
    defaultCategoryId: z.string().nullable(),
    status: z.enum(["CONFIRMED", "PENDING"]),
    createMissingCategories: z.boolean(),
  }),
  async (input) => {
    const p = await requireProjectWriter(input.tenant, input.projectId);
    const cats = await p.db.registrationCategory.findMany({ where: { projectId: p.projectId } });
    const groups = await p.db.projectGroup.findMany({ where: { projectId: p.projectId } });
    const catByName = new Map(cats.map((c) => [foldText(c.name), c.id]));
    const groupByName = new Map(groups.map((g) => [foldText(g.name), g.id]));
    if (input.defaultCategoryId && !cats.some((c) => c.id === input.defaultCategoryId))
      throw new AppError("Categoria padrão inválida.");

    const nextCode = await shortCodeAllocator(p.db, p.projectId);
    const stats = {
      created: 0,
      existingPeople: 0,
      alreadyRegistered: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const [i, row] of input.rows.entries()) {
      const names = row.fullName && !row.firstName ? splitFullName(row.fullName) : null;
      const firstName =
        (names?.firstName ?? row.firstName ?? "").trim() || (row.lastName ?? "").trim();
      if (!firstName) {
        stats.skipped++;
        continue;
      }
      try {
        const { person, created } = await upsertPerson(p.db, p.tenantId, {
          firstName,
          lastName: names?.lastName ?? (row.firstName ? row.lastName : "") ?? "",
          badgeName: row.badgeName,
          email: row.email,
          phone: row.phone,
          cpf: row.cpf,
          organization: row.organization,
          jobTitle: row.jobTitle,
          city: row.city,
          state: row.state,
          externalIds: row.externalId ? { planilha: row.externalId } : undefined,
        });
        if (!created) stats.existingPeople++;

        let categoryId = input.defaultCategoryId;
        if (row.category) {
          const key = foldText(row.category);
          let id = catByName.get(key);
          if (!id && input.createMissingCategories) {
            const c = await p.db.registrationCategory.create({
              data: {
                tenantId: p.tenantId,
                projectId: p.projectId,
                name: row.category.trim().slice(0, 60),
                sortOrder: catByName.size,
              },
            });
            id = c.id;
            catByName.set(key, id);
          }
          if (id) categoryId = id;
        }
        let groupId: string | null = null;
        if (row.group) {
          const key = foldText(row.group);
          let id = groupByName.get(key);
          if (!id) {
            const g = await p.db.projectGroup.create({
              data: {
                tenantId: p.tenantId,
                projectId: p.projectId,
                name: row.group.trim().slice(0, 60),
              },
            });
            id = g.id;
            groupByName.set(key, id);
          }
          groupId = id;
        }

        const exists = await p.db.registration.findFirst({
          where: { projectId: p.projectId, personId: person.id, role: "ATTENDEE" },
          select: { id: true },
        });
        if (exists) {
          stats.alreadyRegistered++;
          continue;
        }
        await p.db.registration.create({
          data: {
            tenantId: p.tenantId,
            projectId: p.projectId,
            personId: person.id,
            role: "ATTENDEE",
            status: input.status,
            source: "IMPORT",
            categoryId,
            groupId,
            displayCompany: row.organization ?? "",
            displayJobTitle: row.jobTitle ?? "",
            notes: row.notes ?? "",
            token: newRegistrationToken(),
            shortCode: nextCode(),
            confirmedAt: input.status === "CONFIRMED" ? new Date() : null,
          },
        });
        if (row.consent !== undefined) {
          await p.db.consent.create({
            data: {
              tenantId: p.tenantId,
              personId: person.id,
              projectId: p.projectId,
              purpose: "CONTACT_SHARING",
              granted: parseYes(row.consent),
              source: "importacao",
            },
          });
        }
        stats.created++;
      } catch (err) {
        stats.errors.push(
          `Linha ${i + 2}: ${err instanceof Error ? err.message : "erro desconhecido"}`,
        );
        if (stats.errors.length > 50) break;
      }
    }

    await audit({
      action: "registration.import",
      userId: p.viewer.user.id,
      actorLabel: p.viewer.user.name,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "Project",
      entityId: p.projectId,
      data: { ...stats, errors: stats.errors.length },
    });
    revalidatePath("/console", "layout");
    return stats;
  },
);
