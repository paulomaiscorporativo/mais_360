"use server";

import { z } from "zod";
import { flightScope, normalizeFlightNumber, parseLocalDateTime } from "@mais/core";
import { defineAction } from "@/server/action";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { invalidFields, notFound } from "@/server/errors";
import {
  airportTimezones,
  assertRegistrations,
  requestFlightRefresh,
  requireTravelWriter,
} from "@/server/travel";

const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use o código IATA de 3 letras (ex.: GRU).");

const flightSchema = z.object({
  tenant: z.string(),
  projectId: z.string(),
  flightId: z.string().nullable(),
  airlineCode: z.string().trim().toUpperCase().max(3).default(""),
  airlineName: z.string().trim().max(80).default(""),
  flightNumber: z
    .string()
    .trim()
    .min(2, "Informe o número do voo.")
    .max(12, "Número de voo muito longo."),
  operatedBy: z.string().trim().max(80).default(""),
  originIata: iata,
  destIata: iata,
  departureLocal: z.string().trim().default(""),
  arrivalLocal: z.string().trim().default(""),
  notes: z.string().trim().max(1000).default(""),
  locators: z
    .array(
      z.object({
        id: z.string().nullable(),
        code: z.string().trim().toUpperCase().min(1).max(12),
        notes: z.string().trim().max(120).default(""),
      }),
    )
    .max(30)
    .default([]),
});

export const saveFlight = defineAction(flightSchema, async (input) => {
  const p = await requireTravelWriter(input.tenant, input.projectId, "FLIGHTS");
  if (input.originIata === input.destIata)
    throw invalidFields({ destIata: "Origem e destino precisam ser diferentes." });

  const air = await airportTimezones([input.originIata, input.destIata], p.tz);
  const departureAt = input.departureLocal
    ? parseLocalDateTime(input.departureLocal, air.tz(input.originIata))
    : null;
  const arrivalAt = input.arrivalLocal
    ? parseLocalDateTime(input.arrivalLocal, air.tz(input.destIata))
    : null;
  if (input.departureLocal && !departureAt)
    throw invalidFields({ departureLocal: "Data e hora inválidas." });
  if (input.arrivalLocal && !arrivalAt)
    throw invalidFields({ arrivalLocal: "Data e hora inválidas." });
  if (departureAt && arrivalAt && arrivalAt <= departureAt)
    throw invalidFields({ arrivalLocal: "A chegada precisa ser depois da partida." });

  const codes = input.locators.map((l) => l.code);
  if (new Set(codes).size !== codes.length)
    throw invalidFields({ locators: "Há localizadores repetidos." });

  const o = air.info(input.originIata);
  const d = air.info(input.destIata);
  const airlineCode = input.airlineCode || input.flightNumber.slice(0, 2).toUpperCase();
  const airline = await prisma.airline.findUnique({ where: { code: airlineCode } });
  const data = {
    airlineCode,
    airlineName: input.airlineName || airline?.name || "",
    flightNumber: normalizeFlightNumber(input.flightNumber),
    operatedBy: input.operatedBy,
    originIata: input.originIata,
    originName: o ? `${o.city} · ${o.name}` : "",
    destIata: input.destIata,
    destName: d ? `${d.city} · ${d.name}` : "",
    departureAt,
    arrivalAt,
    scope: flightScope(o?.country ?? "", d?.country ?? ""),
    defaultLocator: codes[0] ?? "",
    notes: input.notes,
  };

  const flight = input.flightId
    ? await p.db.flight.findFirst({ where: { id: input.flightId, projectId: p.projectId } })
    : null;
  if (input.flightId && !flight) throw notFound("Voo não encontrado.");

  const saved = await (flight
    ? p.db.flight.update({
        where: { id: flight.id },
        // número ou data mudou → descarta o status ao vivo antigo
        data: {
          ...data,
          ...(flight.flightNumber !== data.flightNumber ||
          flight.departureAt?.getTime() !== departureAt?.getTime()
            ? { liveStatus: "", liveData: undefined, liveCheckedAt: null }
            : {}),
        },
      })
    : p.db.flight.create({ data: { ...data, projectId: p.projectId, tenantId: p.tenantId } }));

  // Localizadores: atualiza, cria e remove (passageiros do removido ficam sem localizador)
  const existing = await p.db.flightLocator.findMany({ where: { flightId: saved.id } });
  const keep = new Set(input.locators.map((l) => l.id).filter(Boolean));
  const toDelete = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
  await p.db.$transaction([
    p.db.flightLocator.deleteMany({ where: { id: { in: toDelete } } }),
    ...input.locators
      .filter((l) => l.id && existing.some((e) => e.id === l.id))
      .map((l) =>
        p.db.flightLocator.update({ where: { id: l.id! }, data: { code: l.code, notes: l.notes } }),
      ),
  ]);
  const created = input.locators.filter((l) => !l.id || !existing.some((e) => e.id === l.id));
  if (created.length)
    await p.db.flightLocator.createMany({
      data: created.map((l) => ({ flightId: saved.id, code: l.code, notes: l.notes })),
      skipDuplicates: true,
    });

  await audit({
    action: flight ? "flight.update" : "flight.create",
    userId: p.viewer.user.id,
    tenantId: p.tenantId,
    projectId: p.projectId,
    entityType: "Flight",
    entityId: saved.id,
    data: { flightNumber: saved.flightNumber, route: `${saved.originIata}-${saved.destIata}` },
  });
  return { id: saved.id };
});

export const deleteFlight = defineAction(
  z.object({ tenant: z.string(), projectId: z.string(), flightId: z.string() }),
  async ({ tenant, projectId, flightId }) => {
    const p = await requireTravelWriter(tenant, projectId, "FLIGHTS");
    const f = await p.db.flight.findFirst({ where: { id: flightId, projectId } });
    if (!f) throw notFound("Voo não encontrado.");
    await p.db.flight.delete({ where: { id: f.id } });
    await audit({
      action: "flight.delete",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "Flight",
      entityId: f.id,
      data: { flightNumber: f.flightNumber },
    });
    return null;
  },
);

/** Define quem está no voo (lista completa), com localizador, assento e bilhete. */
export const setFlightPassengers = defineAction(
  z.object({
    tenant: z.string(),
    projectId: z.string(),
    flightId: z.string(),
    passengers: z
      .array(
        z.object({
          registrationId: z.string(),
          locatorId: z.string().nullable(),
          seat: z.string().trim().toUpperCase().max(6).default(""),
          ticketNumber: z.string().trim().max(20).default(""),
        }),
      )
      .max(2000),
  }),
  async ({ tenant, projectId, flightId, passengers }) => {
    const p = await requireTravelWriter(tenant, projectId, "FLIGHTS");
    const flight = await p.db.flight.findFirst({
      where: { id: flightId, projectId },
      include: { locators: true },
    });
    if (!flight) throw notFound("Voo não encontrado.");
    await assertRegistrations(
      p.db,
      projectId,
      passengers.map((x) => x.registrationId),
    );
    const locatorIds = new Set(flight.locators.map((l) => l.id));
    const seats = passengers.map((x) => x.seat).filter(Boolean);
    if (new Set(seats).size !== seats.length)
      throw invalidFields({ passengers: "Há assentos repetidos neste voo." });

    await p.db.$transaction([
      p.db.flightPassenger.deleteMany({ where: { flightId } }),
      p.db.flightPassenger.createMany({
        data: passengers.map((x) => ({
          flightId,
          registrationId: x.registrationId,
          locatorId: x.locatorId && locatorIds.has(x.locatorId) ? x.locatorId : null,
          seat: x.seat,
          ticketNumber: x.ticketNumber,
        })),
      }),
    ]);
    await audit({
      action: "flight.passengers",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId,
      entityType: "Flight",
      entityId: flightId,
      data: { count: passengers.length },
    });
    return { count: passengers.length };
  },
);

export const refreshFlightStatus = defineAction(
  z.object({ tenant: z.string(), projectId: z.string() }),
  async ({ tenant, projectId }) => {
    await requireTravelWriter(tenant, projectId, "FLIGHTS");
    const queued = await requestFlightRefresh(projectId, true);
    return { queued };
  },
);
