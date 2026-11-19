import { AIRPORTS, normalizeCpf, normalizeEmail } from "@mais/core";
import type { Prisma } from "@mais/db";
import { idOf, keyOf, legacyJson, on, type Ctx } from "../context";
import {
  ACTOR_TYPE,
  TIME_PREFERENCE,
  TRAVEL_DOC_TYPE,
  TRAVEL_PASSENGER_TYPE,
  TRAVEL_REQUEST_KIND,
  TRAVEL_REQUEST_STATUS,
  TRIP_TYPE,
  calendarNoon,
  convert,
  convertTravelServices,
  formatProtocol,
  instant,
  nextProtocolSeq,
  parseBudgetCents,
  reaisToCents,
} from "../rules";
import { orgIdFor } from "./core";

/**
 * Linha direta (TravelRequest e filhos) → viagens corporativas.
 * Revisar após integrar a frente `linha-direta`, que pode ajustar
 * corporate-travel.prisma e o formato de serviceDetails/protocolo.
 */

const COUNTRY_OF = new Map(AIRPORTS.map(([iata, , , country]) => [iata, country]));

/** Nacional × internacional pelos códigos IATA entre parênteses ("São Paulo (GRU)"). */
export function scopeFromPlaces(places: readonly string[]): "DOMESTIC" | "INTERNATIONAL" {
  const countries = new Set<string>();
  for (const p of places) {
    for (const m of p.matchAll(/\(([A-Z]{3})\)/g)) {
      const c = COUNTRY_OF.get(m[1]!);
      if (c) countries.add(c);
    }
  }
  return countries.size > 1 || [...countries].some((c) => c !== "BR")
    ? "INTERNATIONAL"
    : "DOMESTIC";
}

export async function migrateCorporate(ctx: Ctx) {
  if (!on(ctx, "linha-direta")) return;
  const { tx, src, report, tenant } = ctx;

  const requests = src.rows("TravelRequest");
  const segmentsOf = new Map<string, ReturnType<typeof src.rows>>();
  for (const s of src.rows("TravelSegment")) {
    const list = segmentsOf.get(s.str("requestId")) ?? [];
    list.push(s);
    segmentsOf.set(s.str("requestId"), list);
  }

  const taken = new Set(
    (
      await tx.travelRequest.findMany({
        where: { tenantId: tenant.id },
        select: { protocol: true },
      })
    ).map((r) => r.protocol),
  );
  const people = await tx.person.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, cpf: true, passportNumber: true, emailNorm: true },
  });

  const migrated = new Set<string>();
  for (const r of requests) {
    report.read("TravelRequest");
    const legacyId = r.str("id");
    const id = idOf(ctx, "TravelRequest", legacyId);
    const before = await tx.travelRequest.findUnique({ where: { id }, select: { protocol: true } });
    const createdAt = instant(r.date("createdAt")) ?? new Date();
    let protocol = before?.protocol ?? "";
    if (!protocol) {
      const year = createdAt.getUTCFullYear();
      protocol = formatProtocol(year, nextProtocolSeq(year, taken));
      taken.add(protocol);
    }

    const map = <T extends string>(
      table: Readonly<Record<string, T>>,
      col: string,
      fb: T,
      what: string,
    ) => {
      const c = convert(table, r.str(col), fb);
      if (!c.known)
        report.warn("LOSSY_CONVERSION", "TravelRequest", legacyId, `${what} "${c.raw}" → ${fb}.`);
      return c.value;
    };
    const services = convertTravelServices({
      needsFlight: r.bool("needsFlight", true),
      cabinClass: r.str("cabinClass"),
      preferredAirline: r.str("preferredAirline"),
      checkedBaggage: r.bool("checkedBaggage", true),
      seatPreference: r.str("seatPreference"),
      loyaltyProgram: r.str("loyaltyProgram"),
      needsHotel: r.bool("needsHotel"),
      hotelCity: r.str("hotelCity"),
      hotelCheckIn: calendarNoon(r.date("hotelCheckIn")),
      hotelCheckOut: calendarNoon(r.date("hotelCheckOut")),
      hotelCategory: r.str("hotelCategory"),
      hotelRooms: r.num("hotelRooms", 1),
      hotelRoomType: r.str("hotelRoomType"),
      hotelChain: r.str("hotelChain"),
      hotelBreakfast: r.bool("hotelBreakfast", true),
      hotelReference: r.str("hotelReference"),
      needsTransfer: r.bool("needsTransfer"),
      needsCarRental: r.bool("needsCarRental"),
      carCategory: r.str("carCategory"),
      carPickup: r.str("carPickup"),
      carDropoff: r.str("carDropoff"),
      carExtraDriver: r.bool("carExtraDriver"),
      needsChauffeur: r.bool("needsChauffeur"),
      transferNotes: r.str("transferNotes"),
      needsInsurance: r.bool("needsInsurance"),
      needsCurrency: r.bool("needsCurrency"),
      currencyNotes: r.str("currencyNotes"),
      needsVisa: r.bool("needsVisa"),
      visaNotes: r.str("visaNotes"),
      needsConnectivity: r.bool("needsConnectivity"),
      needsEventTicket: r.bool("needsEventTicket"),
      eventName: r.str("eventName"),
    });
    for (const u of services.unknownValues)
      report.warn("LOSSY_CONVERSION", "TravelRequest", legacyId, `Serviços: ${u}.`);

    const budgetText = r.str("budget").trim();
    const budgetCents = parseBudgetCents(budgetText);
    const notes = [
      r.str("notes").trim(),
      budgetText && budgetCents === null ? `Orçamento informado: ${budgetText}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (budgetText && budgetCents === null)
      report.warn(
        "LOSSY_CONVERSION",
        "TravelRequest",
        legacyId,
        `Orçamento "${budgetText}" não numérico: guardado nas observações.`,
      );

    const associate = r.ref("associateId");
    const requesterPersonId = associate
      ? (ctx.maps.people.get(keyOf(ctx, "Associate", associate)) ?? null)
      : null;
    const segs = segmentsOf.get(legacyId) ?? [];
    const data = {
      protocol,
      requesterPersonId,
      requesterName: r.str("requesterName"),
      requesterEmail: r.str("requesterEmail"),
      requesterPhone: r.str("requesterPhone"),
      organizationId:
        (requesterPersonId && ctx.maps.personOrg.get(requesterPersonId)) ||
        orgIdFor(ctx, r.str("companyName")),
      companyName: r.str("companyName"),
      kind: map(TRAVEL_REQUEST_KIND, "kind", "AIR", "Tipo"),
      tripType: map(TRIP_TYPE, "tripType", "ROUND_TRIP", "Tipo de trecho"),
      origin: r.str("origin"),
      destination: r.str("destination"),
      departDate: calendarNoon(r.date("departDate")),
      returnDate: calendarNoon(r.date("returnDate")),
      scope: scopeFromPlaces([
        r.str("origin"),
        r.str("destination"),
        ...segs.flatMap((s) => [s.str("origin"), s.str("destination")]),
      ]),
      flexibleDates: r.bool("flexibleDates"),
      pax: Math.max(1, r.num("pax", 1)),
      budgetCents,
      purpose: r.str("purpose"),
      notes,
      requestedServices: services.requested,
      serviceDetails: JSON.parse(JSON.stringify(services.details)) as Prisma.InputJsonValue,
      status: map(TRAVEL_REQUEST_STATUS, "status", "NEW", "Status"),
      handledBy: r.str("handledBy"),
      decidedAt: instant(r.date("decidedAt")),
      editedAt: instant(r.date("editedAt")),
      sendCopy: r.bool("sendCopy", true),
      copyLog: r.str("copyLog"),
      dispatchLog: r.str("dispatchLog"),
    };
    await tx.travelRequest.upsert({
      where: { id },
      create: { id, tenantId: tenant.id, createdAt, ...data },
      update: data,
    });
    report.saved("TravelRequest", !!before);
    migrated.add(legacyId);
  }

  const child = async (
    entity: string,
    table: "TravelSegment" | "TravelPassenger" | "TravelQuote" | "TravelRequestEvent",
    write: (
      row: ReturnType<typeof src.rows>[number],
      id: string,
      requestId: string,
    ) => Promise<void>,
  ) => {
    for (const row of src.rows(table)) {
      report.read(entity);
      if (!migrated.has(row.str("requestId"))) {
        report.skipped(entity);
        continue;
      }
      const id = idOf(ctx, table, row.str("id"));
      await write(row, id, idOf(ctx, "TravelRequest", row.str("requestId")));
    }
  };

  await child("TravelRequestSegment", "TravelSegment", async (s, id, requestId) => {
    const data = {
      sortOrder: s.num("sortOrder"),
      origin: s.str("origin"),
      destination: s.str("destination"),
      date: calendarNoon(s.date("date")),
      timePreference: convert(TIME_PREFERENCE, s.str("timePreference"), "ANY").value,
      notes: s.str("notes"),
    };
    const before = await tx.travelRequestSegment.findUnique({
      where: { id },
      select: { id: true },
    });
    await tx.travelRequestSegment.upsert({
      where: { id },
      create: { id, requestId, ...data },
      update: data,
    });
    report.saved("TravelRequestSegment", !!before);
  });

  await child("TravelRequestPassenger", "TravelPassenger", async (p, id, requestId) => {
    const docType = convert(TRAVEL_DOC_TYPE, p.str("docType"), "OTHER").value;
    const doc = p.str("docNumber").trim();
    const email = normalizeEmail(p.str("email"));
    // Liga à Person pelo documento; na falta, pelo e-mail
    const person =
      (docType === "CPF" && doc && people.find((x) => x.cpf && x.cpf === normalizeCpf(doc))) ||
      (docType === "PASSPORT" &&
        doc &&
        people.find((x) => x.passportNumber && x.passportNumber === doc.toUpperCase())) ||
      (email && people.find((x) => x.emailNorm === email)) ||
      null;
    const data = {
      personId: person ? person.id : null,
      sortOrder: p.num("sortOrder"),
      name: p.str("name") || "Passageiro",
      type: convert(TRAVEL_PASSENGER_TYPE, p.str("type"), "HOLDER").value,
      birthDate: calendarNoon(p.date("birthDate")),
      docType,
      docNumber: doc,
      docExpiry: calendarNoon(p.date("docExpiry")),
      nationality: p.str("nationality"),
      email: p.str("email"),
      phone: p.str("phone"),
      loyalty: p.str("loyalty"),
      notes: p.str("notes"),
    };
    const before = await tx.travelRequestPassenger.findUnique({
      where: { id },
      select: { id: true },
    });
    await tx.travelRequestPassenger.upsert({
      where: { id },
      create: { id, requestId, ...data },
      update: data,
    });
    report.saved("TravelRequestPassenger", !!before);
  });

  await child("TravelQuote", "TravelQuote", async (q, id, requestId) => {
    const data = {
      sortOrder: q.num("sortOrder"),
      title: q.str("title") || "Opção",
      description: q.str("description"),
      currency: (q.str("currency") || "BRL").toUpperCase().slice(0, 3),
      totalCents: reaisToCents(q.num("totalAmount")),
      perPaxCents: reaisToCents(q.num("perPaxAmount")),
      validUntil: calendarNoon(q.date("validUntil")),
      createdBy: q.str("createdBy"),
    };
    const before = await tx.travelQuote.findUnique({ where: { id }, select: { id: true } });
    await tx.travelQuote.upsert({
      where: { id },
      create: { id, requestId, createdAt: instant(q.date("createdAt")) ?? undefined, ...data },
      update: data,
    });
    report.saved("TravelQuote", !!before);
  });

  await child("TravelRequestEvent", "TravelRequestEvent", async (e, id, requestId) => {
    const data = {
      status: convert(TRAVEL_REQUEST_STATUS, e.str("status"), "NEW").value,
      note: e.str("note"),
      actorName: e.str("actorName"),
      actorType: convert(ACTOR_TYPE, e.str("actorType"), "USER").value,
    };
    const before = await tx.travelRequestEvent.findUnique({ where: { id }, select: { id: true } });
    await tx.travelRequestEvent.upsert({
      where: { id },
      create: { id, requestId, createdAt: instant(e.date("createdAt")) ?? undefined, ...data },
      update: data,
    });
    report.saved("TravelRequestEvent", !!before);
  });

  // Cotação escolhida: só depois das cotações gravadas
  const quotes = new Set(src.rows("TravelQuote").map((q) => q.str("id")));
  for (const r of requests) {
    const chosen = r.ref("chosenQuoteId");
    if (!chosen || !migrated.has(r.str("id"))) continue;
    if (!quotes.has(chosen)) {
      report.warn(
        "MISSING_REFERENCE",
        "TravelRequest",
        r.str("id"),
        "Cotação escolhida não encontrada.",
      );
      continue;
    }
    await tx.travelRequest.update({
      where: { id: idOf(ctx, "TravelRequest", r.str("id")) },
      data: { chosenQuoteId: idOf(ctx, "TravelQuote", chosen) },
    });
  }
}

/** ActivityLog → AuditLog (histórico, com a origem em data.legado). */
export async function migrateAudit(ctx: Ctx) {
  if (!on(ctx, "auditoria")) return;
  const { tx, src, report, tenant } = ctx;
  const rows = src.rows("ActivityLog");
  const ids = rows.map((l) => idOf(ctx, "ActivityLog", l.str("id")));
  const existing = new Set(
    (await tx.auditLog.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(
      (r) => r.id,
    ),
  );
  for (const l of rows) {
    report.read("AuditLog");
    const id = idOf(ctx, "ActivityLog", l.str("id"));
    const actor = convert(ACTOR_TYPE, l.str("actorType"), "SYSTEM");
    if (!actor.known)
      report.warn("LOSSY_CONVERSION", "ActivityLog", l.str("id"), `Autor "${actor.raw}" → SYSTEM.`);
    const userId = l.ref("userId") ? (ctx.maps.users.get(l.str("userId")) ?? null) : null;
    const projectId = l.ref("tripId") ? (ctx.maps.projects.get(l.str("tripId"))?.id ?? null) : null;
    const data = {
      tenantId: tenant.id,
      projectId,
      userId,
      actorType: actor.value,
      actorLabel: l.str("actorName"),
      action: l.str("action") || "legado",
      data: {
        ...legacyJson(ctx, "ActivityLog", l.str("id")),
        detalhes: l.str("details"),
      } as Prisma.InputJsonValue,
    };
    await tx.auditLog.upsert({
      where: { id },
      create: { id, createdAt: instant(l.date("createdAt")) ?? undefined, ...data },
      update: data,
    });
    report.saved("AuditLog", existing.has(id));
  }
}
