"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { firstFreeSeat } from "@mais/core";
import { Prisma } from "@mais/db";
import { defineAction, v } from "@/server/action";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireEventWriter } from "@/server/events";

/**
 * Mapa de mesas. `SeatAssignment` não tem `tenantId` próprio: toda escrita nele
 * passa antes pela mesa e pela inscrição, ambas lidas com escopo do cliente.
 */

const ref = { tenant: z.string(), projectId: z.string() };
const refresh = (tenant: string) =>
  revalidatePath(`/console/[ws]/clientes/${tenant}/projetos/[project]/mesas`, "page");

type Scope = Awaited<ReturnType<typeof requireEventWriter>>;

async function tableOf(p: Scope, tableId: string) {
  const t = await p.db.eventTable.findFirst({
    where: { id: tableId, projectId: p.projectId },
    include: { seats: true },
  });
  if (!t) throw new AppError("Mesa não encontrada.");
  return t;
}

export const createTables = defineAction(
  z.object({
    ...ref,
    count: z.coerce.number().int().min(1).max(100),
    capacity: z.coerce.number().int().min(1).max(40),
    shape: z.enum(["ROUND", "RECTANGULAR"]),
  }),
  async (i) => {
    const p = await requireEventWriter(i.tenant, i.projectId, "TABLES");
    const existing = await p.db.eventTable.findMany({
      where: { projectId: p.projectId },
      select: { number: true },
    });
    const max = existing.reduce((m, t) => Math.max(m, t.number), 0);
    // Distribui em grade a partir da última posição usada
    const perRow = 6;
    await p.db.eventTable.createMany({
      data: Array.from({ length: i.count }, (_, k) => {
        const n = existing.length + k;
        return {
          tenantId: p.tenantId,
          projectId: p.projectId,
          number: max + k + 1,
          capacity: i.capacity,
          shape: i.shape,
          x: 120 + (n % perRow) * 180,
          y: 140 + Math.floor(n / perRow) * 180,
        };
      }),
    });
    await audit({
      action: "event.tables.create",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId: p.projectId,
      data: { count: i.count, capacity: i.capacity, shape: i.shape },
    });
    refresh(i.tenant);
    return null;
  },
);

export const updateTable = defineAction(
  z.object({
    ...ref,
    id: z.string(),
    number: z.coerce.number().int().min(1).max(999).optional(),
    name: v.optionalText(60).optional(),
    capacity: z.coerce.number().int().min(1).max(40).optional(),
    shape: z.enum(["ROUND", "RECTANGULAR"]).optional(),
    reservedFor: v.optionalText(80).optional(),
    x: z.number().min(0).max(4000).optional(),
    y: z.number().min(0).max(4000).optional(),
    rotation: z.number().min(-360).max(360).optional(),
  }),
  async ({ tenant, projectId, id, ...data }) => {
    const p = await requireEventWriter(tenant, projectId, "TABLES");
    const t = await tableOf(p, id);
    if (data.capacity !== undefined) {
      const highest = t.seats.reduce((m, s) => Math.max(m, s.seat ?? 0), 0);
      if (data.capacity < t.seats.length || data.capacity < highest)
        throw new AppError(
          `A mesa tem ${t.seats.length} pessoa(s) acomodada(s). Libere as cadeiras antes de reduzir.`,
        );
    }
    if (data.number !== undefined && data.number !== t.number) {
      const clash = await p.db.eventTable.findFirst({
        where: { projectId: p.projectId, number: data.number },
      });
      if (clash) throw new AppError(`Já existe a mesa ${data.number}.`);
    }
    await p.db.eventTable.update({ where: { id: t.id }, data });
    // Posição muda a todo arrasto: não revalida a página inteira
    if (data.x === undefined && data.y === undefined) refresh(tenant);
    return null;
  },
);

export const deleteTable = defineAction(z.object({ ...ref, id: z.string() }), async (i) => {
  const p = await requireEventWriter(i.tenant, i.projectId, "TABLES");
  const t = await tableOf(p, i.id);
  await p.db.eventTable.delete({ where: { id: t.id } }); // assentos saem em cascata
  await audit({
    action: "event.tables.delete",
    userId: p.viewer.user.id,
    tenantId: p.tenantId,
    projectId: p.projectId,
    entityType: "EventTable",
    entityId: t.id,
    data: { number: t.number, freed: t.seats.length },
  });
  refresh(i.tenant);
  return { freed: t.seats.length };
});

export const assignSeat = defineAction(
  z.object({
    ...ref,
    registrationId: z.string(),
    tableId: z.string(),
    seat: z.coerce.number().int().min(1).max(40).nullable(),
  }),
  async (i) => {
    const p = await requireEventWriter(i.tenant, i.projectId, "TABLES");
    const t = await tableOf(p, i.tableId);
    const reg = await p.db.registration.findFirst({
      where: { id: i.registrationId, projectId: p.projectId, status: { not: "CANCELED" } },
      include: { person: true },
    });
    if (!reg) throw new AppError("Convidado não encontrado.");
    const others = t.seats.filter((s) => s.registrationId !== reg.id);
    if (others.length >= t.capacity) throw new AppError(`A mesa ${t.number} está completa.`);
    const seat =
      i.seat ??
      firstFreeSeat(
        t.capacity,
        others.map((s) => s.seat),
      );
    if (seat && seat > t.capacity) throw new AppError("Cadeira fora da capacidade da mesa.");
    if (seat && others.some((s) => s.seat === seat))
      throw new AppError(`A cadeira ${seat} da mesa ${t.number} já está ocupada.`);
    try {
      await prisma.seatAssignment.upsert({
        where: { registrationId: reg.id },
        create: { registrationId: reg.id, tableId: t.id, seat },
        update: { tableId: t.id, seat, assignedAt: new Date() },
      });
    } catch (err) {
      // Duas pessoas acomodando ao mesmo tempo: o índice único da cadeira decide
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
        throw new AppError(`A cadeira ${seat ?? ""} da mesa ${t.number} acabou de ser ocupada.`);
      throw err;
    }
    await audit({
      action: "event.seat.assign",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "Registration",
      entityId: reg.id,
      data: { table: t.number, seat },
    });
    refresh(i.tenant);
    return { seat };
  },
);

export const unassignSeat = defineAction(
  z.object({ ...ref, registrationId: z.string() }),
  async (i) => {
    const p = await requireEventWriter(i.tenant, i.projectId, "TABLES");
    const reg = await p.db.registration.findFirst({
      where: { id: i.registrationId, projectId: p.projectId },
    });
    if (!reg) throw new AppError("Convidado não encontrado.");
    await prisma.seatAssignment.deleteMany({ where: { registrationId: reg.id } });
    await audit({
      action: "event.seat.unassign",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "Registration",
      entityId: reg.id,
    });
    refresh(i.tenant);
    return null;
  },
);
