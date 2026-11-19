"use server";

import { z } from "zod";
import { parseLocalDateTime, roomCapacity, roomingIssues, ROOM_TYPE_LABEL } from "@mais/core";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { invalidFields, notFound } from "@/server/errors";
import { assertRegistrations, requireTravelWriter } from "@/server/travel";

const ROOM_TYPES = ["SINGLE", "DOUBLE", "TWIN", "TRIPLE", "QUAD", "SUITE", "OTHER"] as const;
const date = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Data inválida.")
  .default("");

/** Datas de hotel: dia de calendário no fuso do projeto (check-in 14h, check-out 12h). */
function hotelDate(day: string, tz: string, kind: "in" | "out") {
  return day ? parseLocalDateTime(`${day}T${kind === "in" ? "14:00" : "12:00"}`, tz) : null;
}

export const saveAccommodation = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    id: z.string().nullable(),
    name: z.string().trim().min(2, "Informe o nome do hotel.").max(160),
    address: z.string().trim().max(240).default(""),
    city: z.string().trim().max(80).default(""),
    country: z.string().trim().max(60).default(""),
    phone: z.string().trim().max(40).default(""),
    checkIn: date,
    checkOut: date,
    notes: z.string().trim().max(1000).default(""),
  }),
  async ({ tenant, projectId, id, checkIn, checkOut, ...rest }) => {
    const p = await requireTravelWriter(tenant, projectId, "ACCOMMODATION");
    const data = {
      ...rest,
      checkIn: hotelDate(checkIn, p.tz, "in"),
      checkOut: hotelDate(checkOut, p.tz, "out"),
    };
    if (data.checkIn && data.checkOut && data.checkOut <= data.checkIn)
      throw invalidFields({ checkOut: "O check-out precisa ser depois do check-in." });
    if (id) {
      const a = await p.db.accommodation.findFirst({ where: { id, projectId } });
      if (!a) throw notFound("Hotel não encontrado.");
      await p.db.accommodation.update({ where: { id }, data });
    } else {
      const a = await p.db.accommodation.create({
        data: { ...data, projectId, tenantId: p.tenantId },
      });
      id = a.id;
    }
    await audit({
      action: "accommodation.save",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "Accommodation",
      entityId: id,
      data: { name: rest.name },
    });
    return { id };
  },
);

export const deleteAccommodation = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), id: z.string() }),
  async ({ tenant, projectId, id }) => {
    const p = await requireTravelWriter(tenant, projectId, "ACCOMMODATION");
    const a = await p.db.accommodation.findFirst({ where: { id, projectId } });
    if (!a) throw notFound("Hotel não encontrado.");
    await p.db.accommodation.delete({ where: { id } });
    await audit({
      action: "accommodation.delete",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "Accommodation",
      entityId: id,
      data: { name: a.name },
    });
    return null;
  },
);

export const saveRoom = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    accommodationId: z.string(),
    id: z.string().nullable(),
    number: z.string().trim().max(20).default(""),
    type: z.enum(ROOM_TYPES),
    typeLabel: z.string().trim().max(80).default(""),
    checkIn: date,
    checkOut: date,
    confirmation: z.string().trim().max(40).default(""),
    notes: z.string().trim().max(500).default(""),
    occupants: z.array(z.string()).max(8),
  }),
  async ({ tenant, projectId, accommodationId, id, occupants, checkIn, checkOut, ...rest }) => {
    const p = await requireTravelWriter(tenant, projectId, "ACCOMMODATION");
    const hotel = await p.db.accommodation.findFirst({
      where: { id: accommodationId, projectId },
      include: { rooms: { include: { occupants: true } } },
    });
    if (!hotel) throw notFound("Hotel não encontrado.");
    await assertRegistrations(p.db, projectId, occupants);

    const cap = roomCapacity(rest.type);
    if (occupants.length > cap)
      throw invalidFields({
        occupants: `${ROOM_TYPE_LABEL[rest.type]} comporta ${cap} pessoa${cap === 1 ? "" : "s"}.`,
      });

    const data = {
      ...rest,
      checkIn: hotelDate(checkIn, p.tz, "in"),
      checkOut: hotelDate(checkOut, p.tz, "out"),
    };
    // Mesma pessoa em dois quartos com datas sobrepostas não pode
    const others = hotel.rooms.filter((r) => r.id !== id);
    const issues = roomingIssues([
      ...others.map((r) => ({
        id: r.id,
        type: r.type,
        checkIn: r.checkIn ?? hotel.checkIn,
        checkOut: r.checkOut ?? hotel.checkOut,
        occupants: r.occupants.map((o) => o.registrationId),
      })),
      {
        id: id ?? "new",
        type: rest.type,
        checkIn: data.checkIn ?? hotel.checkIn,
        checkOut: data.checkOut ?? hotel.checkOut,
        occupants,
      },
    ]).filter((i) => i.kind === "DOUBLE_BOOKED");
    if (issues.length) {
      const reg = await p.db.registration.findFirst({
        where: { id: issues[0]!.kind === "DOUBLE_BOOKED" ? issues[0]!.registrationId : "" },
        include: { person: true },
      });
      throw invalidFields({
        occupants: `${reg ? `${reg.person.firstName} ${reg.person.lastName}`.trim() : "Uma pessoa"} já está em outro quarto deste hotel nas mesmas datas.`,
      });
    }

    let roomId = id;
    if (roomId) {
      const r = others.length === hotel.rooms.length ? null : hotel.rooms.find((x) => x.id === id);
      if (!r) throw notFound("Quarto não encontrado.");
      await p.db.room.update({ where: { id: roomId }, data });
    } else {
      roomId = (await p.db.room.create({ data: { ...data, accommodationId } })).id;
    }
    await p.db.$transaction([
      p.db.roomOccupant.deleteMany({ where: { roomId } }),
      p.db.roomOccupant.createMany({
        data: occupants.map((registrationId) => ({ roomId: roomId!, registrationId })),
      }),
    ]);
    return { id: roomId };
  },
);

export const deleteRoom = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), id: z.string() }),
  async ({ tenant, projectId, id }) => {
    const p = await requireTravelWriter(tenant, projectId, "ACCOMMODATION");
    const r = await p.db.room.findFirst({ where: { id, accommodation: { projectId } } });
    if (!r) throw notFound("Quarto não encontrado.");
    await p.db.room.delete({ where: { id } });
    return null;
  },
);
