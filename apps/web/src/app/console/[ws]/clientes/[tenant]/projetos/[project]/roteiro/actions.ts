"use server";

import { z } from "zod";
import { parseLocalDateTime } from "@mais/core";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { invalidFields, notFound } from "@/server/errors";
import { checkAudience, requireTravelWriter } from "@/server/travel";

const AUDIENCES = ["ALL", "STAFF", "GROUP", "CATEGORY", "INDIVIDUAL"] as const;
const STATUSES = ["PENDING", "IN_PROGRESS", "DONE", "LATE", "CANCELED"] as const;
const time = z
  .string()
  .trim()
  .regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, "Hora inválida.")
  .default("");

export const saveItineraryItem = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    id: z.string().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o dia."),
    startTime: time,
    endTime: time,
    title: z.string().trim().min(2, "Dê um título à atividade.").max(160),
    location: z.string().trim().max(200).default(""),
    responsible: z.string().trim().max(120).default(""),
    notes: z.string().trim().max(2000).default(""),
    audience: z.enum(AUDIENCES),
    audienceId: z.string().nullable(),
  }),
  async ({ tenant, projectId, id, date, audience, audienceId, ...rest }) => {
    const p = await requireTravelWriter(tenant, projectId, "ITINERARY");
    if (rest.startTime && rest.endTime && rest.endTime <= rest.startTime)
      throw invalidFields({ endTime: "O fim precisa ser depois do início." });
    const data = {
      ...rest,
      date: parseLocalDateTime(date, p.tz),
      audience,
      audienceId: await checkAudience(p.db, projectId, audience, audienceId),
    };
    if (id) {
      const it = await p.db.itineraryItem.findFirst({ where: { id, projectId } });
      if (!it) throw notFound("Atividade não encontrada.");
      await p.db.itineraryItem.update({ where: { id }, data });
      return { id };
    }
    const created = await p.db.itineraryItem.create({
      data: { ...data, projectId, tenantId: p.tenantId },
    });
    return { id: created.id };
  },
);

export const setItineraryStatus = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    id: z.string(),
    status: z.enum(STATUSES),
  }),
  async ({ tenant, projectId, id, status }) => {
    const p = await requireTravelWriter(tenant, projectId, "ITINERARY");
    const r = await p.db.itineraryItem.updateMany({ where: { id, projectId }, data: { status } });
    if (!r.count) throw notFound("Atividade não encontrada.");
    return null;
  },
);

export const deleteItineraryItem = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), id: z.string() }),
  async ({ tenant, projectId, id }) => {
    const p = await requireTravelWriter(tenant, projectId, "ITINERARY");
    const it = await p.db.itineraryItem.findFirst({ where: { id, projectId } });
    if (!it) throw notFound("Atividade não encontrada.");
    await p.db.itineraryItem.deleteMany({ where: { id, projectId } });
    await audit({
      action: "itinerary.delete",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "ItineraryItem",
      entityId: id,
      data: { title: it.title },
    });
    return null;
  },
);
