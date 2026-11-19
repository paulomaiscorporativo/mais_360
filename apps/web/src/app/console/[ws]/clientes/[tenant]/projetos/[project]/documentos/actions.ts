"use server";

import { z } from "zod";
import {
  PERSON_DOCUMENT_KINDS,
  readProjectSettings,
  travelSettingsSchema,
  type PersonDocumentKind,
} from "@mais/core";
import type { Prisma } from "@mais/db";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { invalidFields, notFound } from "@/server/errors";
import { saveUpload } from "@/server/files";
import { formObject, requireTravelWriter, syncPersonFromDocument } from "@/server/travel";

const CATEGORIES = ["GENERAL", "VOUCHER", "INSURANCE", "TICKET", "ITINERARY", "OTHER"] as const;
const flag = z
  .union([z.literal("1"), z.literal("0"), z.literal("")])
  .default("0")
  .transform((v) => v === "1");
const file = z.instanceof(File, { message: "Escolha um arquivo." });
const dateOnly = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Data inválida.")
  .default("");

/** Data de calendário (validade) guardada ao meio-dia UTC: não muda de dia em nenhum fuso. */
const calendarDate = (v: string) => (v ? new Date(`${v}T12:00:00Z`) : null);

const personDocSchema = z.object({
  tenant: z.string(),
  projectId: z.string(),
  registrationId: z.string(),
  kind: z.enum(PERSON_DOCUMENT_KINDS as [PersonDocumentKind, ...PersonDocumentKind[]]),
  number: z.string().trim().max(40).default(""),
  country: z.string().trim().toUpperCase().max(2).default(""),
  expiresAt: dateOnly,
  file,
});

/** Documento pessoal do viajante (passaporte, visto…) enviado pela equipe. */
export const uploadPersonDocument = defineAction(
  z.preprocess(formObject, personDocSchema),
  async ({ tenant, projectId, registrationId, kind, number, country, expiresAt, file }) => {
    const p = await requireTravelWriter(tenant, projectId, "DOCUMENTS");
    const reg = await p.db.registration.findFirst({
      where: { id: registrationId, projectId },
      select: { personId: true },
    });
    if (!reg) throw notFound("Viajante não encontrado neste projeto.");
    const stored = await saveUpload({
      tenantId: p.tenantId,
      file,
      kind: "document",
      visibility: "PRIVATE",
      uploadedBy: p.actor,
    });
    const expiry = calendarDate(expiresAt);
    const doc = await p.db.personDocument.create({
      data: {
        tenantId: p.tenantId,
        personId: reg.personId,
        kind,
        number,
        country,
        expiresAt: expiry,
        fileId: stored.id,
        uploadedBy: p.actor,
      },
    });
    await syncPersonFromDocument(p.db, reg.personId, kind, number, expiry);
    await audit({
      action: "person.document.upload",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "PersonDocument",
      entityId: doc.id,
      data: { kind, personId: reg.personId },
    });
    return { id: doc.id };
  },
);

export const deletePersonDocument = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), id: z.string() }),
  async ({ tenant, projectId, id }) => {
    const p = await requireTravelWriter(tenant, projectId, "DOCUMENTS");
    // Só documentos de quem está neste projeto
    const doc = await p.db.personDocument.findFirst({
      where: { id, person: { registrations: { some: { projectId } } } },
    });
    if (!doc) throw notFound("Documento não encontrado.");
    await p.db.personDocument.deleteMany({ where: { id } });
    await audit({
      action: "person.document.delete",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "PersonDocument",
      entityId: id,
      data: { kind: doc.kind, personId: doc.personId },
    });
    return null;
  },
);

const projectDocSchema = z.object({
  tenant: z.string(),
  projectId: z.string(),
  title: z.string().trim().min(2, "Dê um título ao documento.").max(140),
  category: z.enum(CATEGORIES),
  registrationId: z.string().default(""),
  visibleToPerson: flag,
  file,
});

/** Arquivo do projeto: para todos (geral) ou para um viajante. */
export const uploadProjectDocument = defineAction(
  z.preprocess(formObject, projectDocSchema),
  async ({ tenant, projectId, title, category, registrationId, visibleToPerson, file }) => {
    const p = await requireTravelWriter(tenant, projectId, "DOCUMENTS");
    if (registrationId) {
      const n = await p.db.registration.count({ where: { id: registrationId, projectId } });
      if (!n) throw invalidFields({ registrationId: "Escolha um viajante deste projeto." });
    }
    const stored = await saveUpload({
      tenantId: p.tenantId,
      file,
      kind: "document",
      visibility: "PRIVATE",
      uploadedBy: p.actor,
    });
    const doc = await p.db.projectDocument.create({
      data: {
        tenantId: p.tenantId,
        projectId,
        registrationId: registrationId || null,
        title,
        category,
        visibleToPerson,
        fileId: stored.id,
      },
    });
    await audit({
      action: "project.document.upload",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "ProjectDocument",
      entityId: doc.id,
      data: { title, category, registrationId: registrationId || null },
    });
    return { id: doc.id };
  },
);

export const setProjectDocumentVisibility = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), id: z.string(), visible: z.boolean() }),
  async ({ tenant, projectId, id, visible }) => {
    const p = await requireTravelWriter(tenant, projectId, "DOCUMENTS");
    const r = await p.db.projectDocument.updateMany({
      where: { id, projectId },
      data: { visibleToPerson: visible },
    });
    if (!r.count) throw notFound("Documento não encontrado.");
    return null;
  },
);

export const deleteProjectDocument = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), id: z.string() }),
  async ({ tenant, projectId, id }) => {
    const p = await requireTravelWriter(tenant, projectId, "DOCUMENTS");
    const doc = await p.db.projectDocument.findFirst({ where: { id, projectId } });
    if (!doc) throw notFound("Documento não encontrado.");
    await p.db.projectDocument.deleteMany({ where: { id, projectId } });
    await audit({
      action: "project.document.delete",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "ProjectDocument",
      entityId: id,
      data: { title: doc.title },
    });
    return null;
  },
);

/** Exigências de documentos e opções do portal (chave `travel` de Project.settings). */
export const saveTravelSettings = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), travel: travelSettingsSchema }),
  async ({ tenant, projectId, travel }) => {
    const p = await requireTravelWriter(tenant, projectId, "DOCUMENTS");
    const settings = { ...readProjectSettings(p.project.settings), travel };
    await p.db.project.update({
      where: { id: projectId },
      data: { settings: settings as Prisma.InputJsonValue },
    });
    await audit({
      action: "project.travel.settings",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "Project",
      entityId: projectId,
      data: travel as Prisma.InputJsonValue,
    });
    return null;
  },
);
