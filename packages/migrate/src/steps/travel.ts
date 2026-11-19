import { AIRPORT_TIMEZONE, cleanText, foldText, VOUCHER_A4 } from "@mais/core";
import type { Prisma } from "@mais/db";
import { idOf, importFile, keyOf, on, type Ctx } from "../context";
import {
  FLIGHT_SCOPE,
  MURAL_TARGET,
  PERSON_DOCUMENT_KIND,
  PROJECT_DOCUMENT_CATEGORY,
  TASK_STATUS,
  TICKET_AUTHOR,
  TICKET_STATUS,
  calendarAt,
  calendarNoon,
  convert,
  instant,
  parseJsonText,
  planRooms,
  wallClockToUtc,
} from "../rules";

/** Viagens de grupo: voos, hospedagem, roteiro, checklist, mural, suporte e documentos. */

const regOf = (ctx: Ctx, passengerId: string | null) =>
  passengerId ? (ctx.maps.registrations.get(`Passenger:${passengerId}`) ?? null) : null;

export async function migrateFlights(ctx: Ctx) {
  if (!on(ctx, "voos")) return;
  const { tx, src, report, tenant } = ctx;

  // Catálogo global: só acrescenta o que falta (não sobrescreve o da plataforma)
  for (const a of src.rows("Airline")) {
    report.read("Airline");
    const code = a.str("code").trim().toUpperCase();
    const before = await tx.airline.findUnique({ where: { code } });
    const logo = before?.logoFileId
      ? null
      : await importFile(ctx, {
          entity: "Airline.logoPath",
          legacyId: code,
          relPath: a.str("logoPath"),
          visibility: "PUBLIC",
          global: true,
        });
    if (!before) {
      await tx.airline.create({ data: { code, name: a.str("name"), logoFileId: logo } });
      report.created("Airline");
    } else if (logo) {
      await tx.airline.update({ where: { code }, data: { logoFileId: logo } });
      report.updated("Airline");
    } else report.skipped("Airline");
  }
  const airportTz = new Map<string, string>();
  for (const a of src.rows("Airport")) {
    report.read("Airport");
    const iata = a.str("iata").trim().toUpperCase();
    const before = await tx.airport.findUnique({ where: { iata } });
    if (before) {
      if (before.timezone) airportTz.set(iata, before.timezone);
      report.skipped("Airport");
      continue;
    }
    await tx.airport.create({
      data: {
        iata,
        name: a.str("name"),
        city: a.str("city"),
        country: a.str("country"),
        timezone: AIRPORT_TIMEZONE.get(iata) ?? "",
      },
    });
    report.created("Airport");
  }
  const tzFor = async (iata: string) => {
    const code = iata.trim().toUpperCase();
    const known = AIRPORT_TIMEZONE.get(code) ?? airportTz.get(code);
    if (known) return known;
    const row = await tx.airport.findUnique({ where: { iata: code }, select: { timezone: true } });
    return row?.timezone || null;
  };

  const locatorIds = new Map<string, string>();
  const flights = new Set<string>();
  for (const f of src.rows("Flight")) {
    report.read("Flight");
    const project = ctx.maps.projects.get(f.str("tripId"));
    if (!project) {
      report.skipped("Flight");
      continue;
    }
    const id = idOf(ctx, "Flight", f.str("id"));
    flights.add(f.str("id"));
    const scope = convert(FLIGHT_SCOPE, f.str("scope"), "INTERNATIONAL");
    const zone = async (iata: string, col: string) => {
      const tz = await tzFor(iata);
      if (!tz && f.date(col)) {
        report.warn(
          "LOSSY_CONVERSION",
          "Flight",
          f.str("id"),
          `Fuso do aeroporto ${iata || "(vazio)"} desconhecido: ${col} lido no fuso do projeto (${project.tz}).`,
        );
      }
      return tz ?? project.tz;
    };
    const live = parseJsonText(f.str("liveData"), null);
    if (!live.ok)
      report.warn("INVALID_DATA", "Flight", f.str("id"), "Status ao vivo ilegível: descartado.");
    const data = {
      scope: scope.value,
      airlineCode: f.str("airlineCode").trim().toUpperCase(),
      airlineName: f.str("airlineName"),
      flightNumber: cleanText(f.str("flightNumber")).toUpperCase() || "—",
      operatedBy: f.str("operatedBy"),
      originIata: f.str("originIata").trim().toUpperCase(),
      originName: f.str("originName"),
      destIata: f.str("destIata").trim().toUpperCase(),
      destName: f.str("destName"),
      departureAt: wallClockToUtc(
        f.date("depDateTime"),
        await zone(f.str("originIata"), "depDateTime"),
      ),
      arrivalAt: wallClockToUtc(
        f.date("arrDateTime"),
        await zone(f.str("destIata"), "arrDateTime"),
      ),
      defaultLocator: f.str("locator").trim().toUpperCase(),
      notes: f.str("notes"),
      liveStatus: f.str("liveStatus"),
      liveData: live.ok && live.value !== null ? (live.value as Prisma.InputJsonValue) : undefined,
      liveCheckedAt: instant(f.date("liveCheckedAt")),
    };
    const before = await tx.flight.findUnique({ where: { id }, select: { id: true } });
    await tx.flight.upsert({
      where: { id },
      create: {
        id,
        tenantId: tenant.id,
        projectId: project.id,
        createdAt: instant(f.date("createdAt")) ?? undefined,
        ...data,
      },
      update: data,
    });
    report.saved("Flight", !!before);
  }

  for (const l of src.rows("FlightLocator")) {
    report.read("FlightLocator");
    if (!flights.has(l.str("flightId"))) {
      report.skipped("FlightLocator");
      continue;
    }
    const flightId = idOf(ctx, "Flight", l.str("flightId"));
    const id = idOf(ctx, "FlightLocator", l.str("id"));
    const code = l.str("code").trim().toUpperCase();
    const clash = await tx.flightLocator.findUnique({
      where: { flightId_code: { flightId, code } },
      select: { id: true },
    });
    if (clash && clash.id !== id) {
      locatorIds.set(l.str("id"), clash.id);
      report.skipped("FlightLocator");
      continue;
    }
    const before = await tx.flightLocator.findUnique({ where: { id }, select: { id: true } });
    await tx.flightLocator.upsert({
      where: { id },
      create: { id, flightId, code, notes: l.str("notes") },
      update: { code, notes: l.str("notes") },
    });
    locatorIds.set(l.str("id"), id);
    report.saved("FlightLocator", !!before);
  }

  for (const fp of src.rows("FlightPassenger")) {
    report.read("FlightPassenger");
    const registrationId = regOf(ctx, fp.str("passengerId"));
    if (!flights.has(fp.str("flightId"))) {
      report.skipped("FlightPassenger");
      continue;
    }
    if (!registrationId) {
      report.skipped("FlightPassenger");
      report.warn(
        "MISSING_REFERENCE",
        "FlightPassenger",
        fp.str("passengerId"),
        "Passageiro sem inscrição.",
      );
      continue;
    }
    const flightId = idOf(ctx, "Flight", fp.str("flightId"));
    const where = { flightId_registrationId: { flightId, registrationId } };
    const data = {
      locatorId: fp.ref("locatorId") ? (locatorIds.get(fp.str("locatorId")) ?? null) : null,
      seat: fp.str("seat"),
      ticketNumber: fp.str("ticketNumber"),
      eticket: fp.str("eticket"),
    };
    const before = await tx.flightPassenger.findUnique({ where });
    await tx.flightPassenger.upsert({
      where,
      create: { flightId, registrationId, ...data },
      update: data,
    });
    report.saved("FlightPassenger", !!before);
  }
}

export async function migrateAccommodation(ctx: Ctx) {
  if (!on(ctx, "hospedagem")) return;
  const { tx, src, report, tenant } = ctx;
  const byHotel = new Map<
    string,
    { passengerId: string; roomNumber: string; roomType: string }[]
  >();
  for (const ap of src.rows("AccommodationPassenger")) {
    const list = byHotel.get(ap.str("accommodationId")) ?? [];
    list.push({
      passengerId: ap.str("passengerId"),
      roomNumber: ap.str("roomNumber"),
      roomType: ap.str("roomType"),
    });
    byHotel.set(ap.str("accommodationId"), list);
  }

  for (const a of src.rows("Accommodation")) {
    report.read("Accommodation");
    const project = ctx.maps.projects.get(a.str("tripId"));
    if (!project) {
      report.skipped("Accommodation");
      continue;
    }
    const id = idOf(ctx, "Accommodation", a.str("id"));
    const data = {
      name: cleanText(a.str("name")) || "Hotel",
      address: a.str("address"),
      city: a.str("city"),
      country: a.str("country"),
      phone: a.str("phone"),
      checkIn: calendarAt(a.date("checkIn"), "14:00", project.tz),
      checkOut: calendarAt(a.date("checkOut"), "12:00", project.tz),
      notes: a.str("notes"),
    };
    const before = await tx.accommodation.findUnique({ where: { id }, select: { id: true } });
    await tx.accommodation.upsert({
      where: { id },
      create: { id, tenantId: tenant.id, projectId: project.id, ...data },
      update: data,
    });
    report.saved("Accommodation", !!before);

    const rows = byHotel.get(a.str("id")) ?? [];
    report.read("AccommodationPassenger", rows.length);
    for (const room of planRooms(rows)) {
      const roomId = idOf(ctx, "Room", `${a.str("id")}:${room.key}`);
      const rb = await tx.room.findUnique({ where: { id: roomId }, select: { id: true } });
      const rdata = { number: room.number, type: room.type, typeLabel: room.typeLabel };
      await tx.room.upsert({
        where: { id: roomId },
        create: { id: roomId, accommodationId: id, ...rdata },
        update: rdata,
      });
      report.saved("Room", !!rb);
      if (room.conflictingLabels.length)
        report.warn(
          "REVIEW",
          "AccommodationPassenger",
          `${a.str("id")}:${room.number}`,
          `Quarto ${room.number} com tipos diferentes (${[room.typeLabel, ...room.conflictingLabels].join(", ")}): usado "${room.typeLabel}".`,
        );
      for (const passengerId of room.passengerIds) {
        const registrationId = regOf(ctx, passengerId);
        if (!registrationId) {
          report.skipped("RoomOccupant");
          report.warn(
            "MISSING_REFERENCE",
            "AccommodationPassenger",
            passengerId,
            "Passageiro sem inscrição.",
          );
          continue;
        }
        const where = { roomId_registrationId: { roomId, registrationId } };
        const ob = await tx.roomOccupant.findUnique({ where });
        await tx.roomOccupant.upsert({ where, create: { roomId, registrationId }, update: {} });
        report.saved("RoomOccupant", !!ob);
      }
    }
  }
}

export async function migrateItinerary(ctx: Ctx) {
  if (!on(ctx, "roteiro")) return;
  const { tx, src, report, tenant } = ctx;
  for (const it of src.rows("ItineraryItem")) {
    report.read("ItineraryItem");
    const project = ctx.maps.projects.get(it.str("tripId"));
    if (!project) {
      report.skipped("ItineraryItem");
      continue;
    }
    const status = convert(TASK_STATUS, it.str("status"), "PENDING");
    const rawAudience = cleanText(it.str("audience"));
    const upper = rawAudience.toUpperCase();
    let audience: "ALL" | "STAFF" | "GROUP" = "ALL";
    let audienceId: string | null = null;
    if (upper === "STAFF") audience = "STAFF";
    else if (upper && upper !== "TODOS") {
      const group = ctx.maps.groupsByName.get(`${it.str("tripId")}:${foldText(rawAudience)}`);
      if (group) {
        audience = "GROUP";
        audienceId = group;
      } else
        report.warn(
          "LOSSY_CONVERSION",
          "ItineraryItem",
          it.str("id"),
          `Público "${rawAudience}" não é um grupo do projeto: aberto a todos.`,
        );
    }
    const id = idOf(ctx, "ItineraryItem", it.str("id"));
    const data = {
      date: calendarAt(it.date("date"), "00:00", project.tz),
      startTime: it.str("startTime"),
      endTime: it.str("endTime"),
      timezone: it.str("timezone"),
      title: cleanText(it.str("title")) || "Atividade",
      location: it.str("location"),
      responsible: it.str("responsible"),
      notes: it.str("notes"),
      status: status.value,
      audience,
      audienceId,
      sortOrder: it.num("sortOrder"),
    };
    const before = await tx.itineraryItem.findUnique({ where: { id }, select: { id: true } });
    await tx.itineraryItem.upsert({
      where: { id },
      create: {
        id,
        tenantId: tenant.id,
        projectId: project.id,
        createdAt: instant(it.date("createdAt")) ?? undefined,
        ...data,
      },
      update: data,
    });
    report.saved("ItineraryItem", !!before);
  }

  let order = 0;
  for (const c of src.rows("ChecklistItem")) {
    report.read("ChecklistItem");
    const project = ctx.maps.projects.get(c.str("tripId"));
    if (!project) {
      report.skipped("ChecklistItem");
      continue;
    }
    const status = convert(TASK_STATUS, c.str("status"), "PENDING");
    if (!status.known)
      report.warn(
        "LOSSY_CONVERSION",
        "ChecklistItem",
        c.str("id"),
        `Status "${status.raw}" → PENDING.`,
      );
    const history = c.str("history").trim();
    const id = idOf(ctx, "ChecklistItem", c.str("id"));
    const data = {
      subject: cleanText(c.str("subject")) || "Tarefa",
      category: c.str("category"),
      responsible: c.str("responsible"),
      startDate: calendarAt(c.date("startDate"), "00:00", project.tz),
      dueDate: calendarAt(c.date("endDate"), "23:59", project.tz),
      status: status.value,
      notes: c.str("notes"),
      history: (history ? [{ nota: history }] : []) as Prisma.InputJsonValue,
      sortOrder: order++,
    };
    const before = await tx.checklistItem.findUnique({ where: { id }, select: { id: true } });
    await tx.checklistItem.upsert({
      where: { id },
      create: {
        id,
        tenantId: tenant.id,
        projectId: project.id,
        createdAt: instant(c.date("createdAt")) ?? undefined,
        ...data,
      },
      update: data,
    });
    report.saved("ChecklistItem", !!before);
  }
}

export async function migrateMural(ctx: Ctx) {
  if (!on(ctx, "mural")) return;
  const { tx, src, report, tenant } = ctx;
  for (const m of src.rows("MuralPost")) {
    report.read("MuralPost");
    const project = ctx.maps.projects.get(m.str("tripId"));
    if (!project) {
      report.skipped("MuralPost");
      continue;
    }
    const target = convert(MURAL_TARGET, m.str("targetType"), "ALL");
    let audience = target.value;
    let audienceId: string | null = null;
    const value = m.str("targetValue").trim();
    if (audience === "GROUP") audienceId = ctx.maps.groups.get(value) ?? null;
    if (audience === "INDIVIDUAL") audienceId = regOf(ctx, value);
    if (audience !== "ALL" && !audienceId) {
      report.warn(
        "MISSING_REFERENCE",
        "MuralPost",
        m.str("id"),
        `Destinatário "${value}" não encontrado: recado desativado para revisão.`,
      );
      audience = "ALL";
    }
    const createdAt = instant(m.date("createdAt")) ?? new Date();
    const id = idOf(ctx, "MuralPost", m.str("id"));
    const data = {
      title: cleanText(m.str("title")) || "Recado",
      message: m.str("message"),
      audience,
      audienceId,
      urgent: m.bool("urgent"),
      active: m.bool("active", true) && !(target.value !== "ALL" && !audienceId),
      author: m.str("author"),
      publishAt: createdAt,
    };
    const before = await tx.muralPost.findUnique({ where: { id }, select: { id: true } });
    await tx.muralPost.upsert({
      where: { id },
      create: { id, tenantId: tenant.id, projectId: project.id, createdAt, ...data },
      update: data,
    });
    report.saved("MuralPost", !!before);
  }
}

export async function migrateSupport(ctx: Ctx) {
  if (!on(ctx, "suporte")) return;
  const { tx, src, report, tenant } = ctx;
  const tickets = new Set<string>();
  for (const t of src.rows("Ticket")) {
    report.read("SupportTicket");
    const project = ctx.maps.projects.get(t.str("tripId"));
    const registrationId = regOf(ctx, t.str("passengerId"));
    if (!project || !registrationId) {
      report.skipped("SupportTicket");
      report.warn(
        "MISSING_REFERENCE",
        "Ticket",
        t.str("id"),
        "Projeto ou passageiro não encontrado.",
      );
      continue;
    }
    const status = convert(TICKET_STATUS, t.str("status"), "NEW");
    const id = idOf(ctx, "Ticket", t.str("id"));
    tickets.add(t.str("id"));
    const data = {
      subject: cleanText(t.str("subject")) || "Chamado",
      status: status.value,
      registrationId,
    };
    const before = await tx.supportTicket.findUnique({ where: { id }, select: { id: true } });
    await tx.supportTicket.upsert({
      where: { id },
      create: {
        id,
        tenantId: tenant.id,
        projectId: project.id,
        createdAt: instant(t.date("createdAt")) ?? undefined,
        ...data,
      },
      update: data,
    });
    report.saved("SupportTicket", !!before);
  }
  for (const m of src.rows("TicketMessage")) {
    report.read("SupportTicketMessage");
    if (!tickets.has(m.str("ticketId"))) {
      report.skipped("SupportTicketMessage");
      continue;
    }
    const id = idOf(ctx, "TicketMessage", m.str("id"));
    const data = {
      authorType: convert(TICKET_AUTHOR, m.str("authorType"), "PERSON").value,
      authorName: m.str("authorName"),
      body: m.str("body"),
    };
    const before = await tx.supportTicketMessage.findUnique({
      where: { id },
      select: { id: true },
    });
    await tx.supportTicketMessage.upsert({
      where: { id },
      create: {
        id,
        ticketId: idOf(ctx, "Ticket", m.str("ticketId")),
        createdAt: instant(m.date("createdAt")) ?? undefined,
        ...data,
      },
      update: data,
    });
    report.saved("SupportTicketMessage", !!before);
  }
}

export async function migrateDocuments(ctx: Ctx) {
  if (!on(ctx, "documentos")) return;
  const { tx, src, report, tenant } = ctx;

  for (const d of src.rows("TripDocument")) {
    report.read("ProjectDocument");
    const project = ctx.maps.projects.get(d.str("tripId"));
    if (!project) {
      report.skipped("ProjectDocument");
      continue;
    }
    const fileId = await importFile(ctx, {
      entity: "TripDocument",
      legacyId: d.str("id"),
      relPath: d.str("filePath"),
      fileName: d.str("fileName"),
      mimeType: d.str("mimeType"),
      visibility: "PRIVATE",
      createdAt: instant(d.date("createdAt")),
    });
    if (!fileId) {
      report.skipped("ProjectDocument");
      continue;
    }
    const registrationId = d.ref("passengerId") ? regOf(ctx, d.str("passengerId")) : null;
    if (d.ref("passengerId") && !registrationId)
      report.warn(
        "MISSING_REFERENCE",
        "TripDocument",
        d.str("id"),
        "Passageiro não encontrado: documento ficou geral, oculto ao viajante.",
      );
    const id = idOf(ctx, "TripDocument", d.str("id"));
    const data = {
      registrationId,
      title: cleanText(d.str("title")) || d.str("fileName") || "Documento",
      category: convert(PROJECT_DOCUMENT_CATEGORY, d.str("category"), "GENERAL").value,
      fileId,
      visibleToPerson:
        d.bool("visibleToPassenger", true) && !(d.ref("passengerId") && !registrationId),
    };
    const before = await tx.projectDocument.findUnique({ where: { id }, select: { id: true } });
    await tx.projectDocument.upsert({
      where: { id },
      create: {
        id,
        tenantId: tenant.id,
        projectId: project.id,
        createdAt: instant(d.date("createdAt")) ?? undefined,
        ...data,
      },
      update: data,
    });
    report.saved("ProjectDocument", !!before);
  }

  for (const d of src.rows("PassengerDocument")) {
    report.read("PersonDocument");
    const personId = ctx.maps.people.get(keyOf(ctx, "Passenger", d.str("passengerId")));
    if (!personId) {
      report.skipped("PersonDocument");
      continue;
    }
    const fileId = await importFile(ctx, {
      entity: "PassengerDocument",
      legacyId: d.str("id"),
      relPath: d.str("filePath"),
      fileName: d.str("fileName"),
      mimeType: d.str("mimeType"),
      visibility: "PRIVATE",
      uploadedBy: d.str("uploadedBy"),
      createdAt: instant(d.date("createdAt")),
    });
    if (!fileId) {
      report.skipped("PersonDocument");
      continue;
    }
    const id = idOf(ctx, "PassengerDocument", d.str("id"));
    const data = {
      kind: convert(PERSON_DOCUMENT_KIND, d.str("kind"), "OTHER").value,
      fileId,
      uploadedBy: d.str("uploadedBy"),
    };
    const before = await tx.personDocument.findUnique({ where: { id }, select: { id: true } });
    await tx.personDocument.upsert({
      where: { id },
      create: {
        id,
        tenantId: tenant.id,
        personId,
        createdAt: instant(d.date("createdAt")) ?? undefined,
        ...data,
      },
      update: data,
    });
    report.saved("PersonDocument", !!before);
  }

  // Modelos de voucher: recriados sobre o modelo A4 padrão do motor de documentos
  for (const v of src.rows("VoucherTemplate")) {
    report.read("DocumentTemplate");
    const project = ctx.maps.projects.get(v.str("tripId"));
    if (!project) {
      report.skipped("DocumentTemplate");
      continue;
    }
    const backgroundFileId = await importFile(ctx, {
      entity: "VoucherTemplate.backgroundPdfPath",
      legacyId: v.str("id"),
      relPath: v.str("backgroundPdfPath"),
      visibility: "PRIVATE",
    });
    const placed = parseJsonText(v.str("fields"), []);
    const hasPlaced = Array.isArray(placed.value) && placed.value.length > 0;
    const texts = [v.str("headerText"), v.str("footerText")].filter((s) => s.trim());
    const id = idOf(ctx, "VoucherTemplate", v.str("id"));
    const data = {
      name: cleanText(v.str("name")) || "Voucher",
      description: [
        "Migrado do sistema anterior: layout recriado a partir do modelo A4 padrão — revisar.",
        ...texts.map((t, i) => `${i === 0 ? "Cabeçalho" : "Rodapé"} original: ${t}`),
      ].join("\n"),
      definition: VOUCHER_A4 as unknown as Prisma.InputJsonValue,
      backgroundFileId,
      visibleToPerson: v.bool("visibleToPassenger"),
    };
    const before = await tx.documentTemplate.findUnique({ where: { id }, select: { id: true } });
    await tx.documentTemplate.upsert({
      where: { id },
      create: {
        id,
        tenantId: tenant.id,
        projectId: project.id,
        kind: "VOUCHER",
        createdBy: "migração",
        ...data,
      },
      update: data,
    });
    report.saved("DocumentTemplate", !!before);
    report.warn(
      "REVIEW",
      "VoucherTemplate",
      v.str("id"),
      `"${data.name}" recriado sobre o modelo A4 padrão${hasPlaced ? " (os campos posicionados sobre o PDF de fundo precisam ser refeitos no editor)" : ""}.`,
    );
  }
}
