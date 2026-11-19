import { toLocalInput } from "@mais/core";
import { guard } from "@/server/auth";
import { prisma } from "@/server/db";
import { requireProjectFeature } from "@/server/projects";
import {
  airportTimezones,
  ensureAviationCatalog,
  liveStatusEnabled,
  projectTz,
  requestFlightRefresh,
  toFlightViews,
  travelersOf,
} from "@/server/travel";
import { FlightsManager, type FlightRowData } from "./flights";

export default async function FlightsPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  const p = await guard(requireProjectFeature(ws, tenant, project, "FLIGHTS"));
  const tz = projectTz(p);
  await ensureAviationCatalog();

  const [flights, travelers, airlines, airports] = await Promise.all([
    p.db.flight.findMany({
      where: { projectId: p.projectId },
      orderBy: [{ departureAt: "asc" }, { createdAt: "asc" }],
      include: {
        locators: { orderBy: { code: "asc" } },
        passengers: {
          select: { registrationId: true, locatorId: true, seat: true, ticketNumber: true },
        },
      },
    }),
    travelersOf(p.db, p.projectId),
    prisma.airline.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.airport.findMany({ orderBy: { iata: "asc" } }),
  ]);

  // Atualiza o status ao vivo em segundo plano (respeita o cache por fase)
  if (flights.length) void requestFlightRefresh(p.projectId).catch(() => null);

  const views = await toFlightViews(flights, tz);
  const air = await airportTimezones(
    flights.flatMap((f) => [f.originIata, f.destIata]),
    tz,
  );
  const rows: FlightRowData[] = flights.map((f, i) => ({
    view: views[i]!,
    edit: {
      airlineCode: f.airlineCode,
      airlineName: f.airlineName,
      flightNumber: f.flightNumber,
      operatedBy: f.operatedBy,
      originIata: f.originIata,
      destIata: f.destIata,
      departureLocal: toLocalInput(f.departureAt, air.tz(f.originIata)),
      arrivalLocal: toLocalInput(f.arrivalAt, air.tz(f.destIata)),
      notes: f.notes,
      locators: f.locators.map((l) => ({ id: l.id, code: l.code, notes: l.notes })),
    },
    passengers: f.passengers,
  }));

  return (
    <FlightsManager
      tenant={tenant}
      projectId={p.projectId}
      canEdit={p.canEdit}
      liveEnabled={liveStatusEnabled()}
      flights={rows}
      travelers={travelers}
      airlines={airlines.map((a) => ({ code: a.code, name: a.name }))}
      airports={airports.map((a) => ({ iata: a.iata, label: `${a.city} · ${a.name}` }))}
    />
  );
}
