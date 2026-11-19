"use server";

import { z } from "zod";
import { appendHistory, parseLocalDateTime, type TaskStatus } from "@mais/core";
import type { Prisma } from "@mais/db";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { invalidFields, notFound } from "@/server/errors";
import { requireTravelWriter } from "@/server/travel";

const STATUSES = ["PENDING", "IN_PROGRESS", "DONE", "LATE", "CANCELED"] as const;
const day = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Data inválida.")
  .default("");

export const saveChecklistItem = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    id: z.string().nullable(),
    subject: z.string().trim().min(2, "Descreva a tarefa.").max(200),
    category: z.string().trim().max(60).default(""),
    responsible: z.string().trim().max(120).default(""),
    startDate: day,
    dueDate: day,
    status: z.enum(STATUSES),
    notes: z.string().trim().max(2000).default(""),
  }),
  async ({ tenant, projectId, id, startDate, dueDate, status, ...rest }) => {
    const p = await requireTravelWriter(tenant, projectId, "CHECKLIST");
    const start = startDate ? parseLocalDateTime(startDate, p.tz) : null;
    // Prazo vale até o fim do dia no fuso do projeto
    const due = dueDate ? parseLocalDateTime(`${dueDate}T23:59`, p.tz) : null;
    if (start && due && due < start) throw invalidFields({ dueDate: "O prazo é antes do início." });
    const stored: TaskStatus = status === "LATE" ? "PENDING" : status;

    if (id) {
      const it = await p.db.checklistItem.findFirst({ where: { id, projectId } });
      if (!it) throw notFound("Tarefa não encontrada.");
      const history =
        it.status !== stored
          ? appendHistory(it.history, {
              at: new Date().toISOString(),
              by: p.actor,
              from: it.status,
              to: stored,
            })
          : it.history;
      await p.db.checklistItem.update({
        where: { id },
        data: {
          ...rest,
          startDate: start,
          dueDate: due,
          status: stored,
          history: history as Prisma.InputJsonValue,
        },
      });
      return { id };
    }
    const created = await p.db.checklistItem.create({
      data: {
        ...rest,
        startDate: start,
        dueDate: due,
        status: stored,
        projectId,
        tenantId: p.tenantId,
      },
    });
    return { id: created.id };
  },
);

export const setChecklistStatus = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), id: z.string(), status: z.enum(STATUSES) }),
  async ({ tenant, projectId, id, status }) => {
    const p = await requireTravelWriter(tenant, projectId, "CHECKLIST");
    const it = await p.db.checklistItem.findFirst({ where: { id, projectId } });
    if (!it) throw notFound("Tarefa não encontrada.");
    const to: TaskStatus = status === "LATE" ? "PENDING" : status;
    await p.db.checklistItem.update({
      where: { id },
      data: {
        status: to,
        history: appendHistory(it.history, {
          at: new Date().toISOString(),
          by: p.actor,
          from: it.status,
          to,
        }) as Prisma.InputJsonValue,
      },
    });
    return null;
  },
);

export const deleteChecklistItem = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), id: z.string() }),
  async ({ tenant, projectId, id }) => {
    const p = await requireTravelWriter(tenant, projectId, "CHECKLIST");
    const it = await p.db.checklistItem.findFirst({ where: { id, projectId } });
    if (!it) throw notFound("Tarefa não encontrada.");
    await p.db.checklistItem.deleteMany({ where: { id, projectId } });
    await audit({
      action: "checklist.delete",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "ChecklistItem",
      entityId: id,
      data: { subject: it.subject },
    });
    return null;
  },
);
