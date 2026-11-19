import "server-only";
import {
  AIRLINES,
  AIRPORTS,
  dayOffset,
  formatDuration,
  formatInZone,
  parseFlightLive,
  type ProjectFeature,
} from "@mais/core";
import type { FlightView } from "@/components/travel/flight-route";
import { enqueueJob } from "@mais/messaging";
import { prisma } from "./db";
import { forbidden, notFound } from "./errors";
import { requireProjectWriter } from "./projects";
import type { TenantDb } from "./tenant-db";

/**
 * Serviços de servidor das viagens de grupo (voos, hospedagem, roteiro,
 * checklist, mural, suporte, documentos, vouchers). As páginas entram por
 * `requireProjectFeature` (contrato dos projetos); as actions por
 * `requireTravelWriter`, que também exige o recurso ligado.
 */

export const FLIGHTS_REFRESH_QUEUE = "flights.refresh";

/** Server Action: permissão de edição + recurso ligado no projeto. */
export async function requireTravelWriter(
  tenantSlug: string,
  projectId: string,
  feature: ProjectFeature,
) {
  const p = await requireProjectWriter(tenantSlug, projectId);
  if (!p.features.has(feature)) throw notFound("Este recurso não está ligado no projeto.");
  const actor = p.viewer.user.name || p.viewer.user.email;
  return { ...p, tz: p.project.timezone ?? p.tenant.timezone, actor };
}

export function projectTz(p: {
  project: { timezone: string | null };
  tenant: { timezone: string };
}) {
  return p.project.timezone ?? p.tenant.timezone;
}

/** Semeia companhias e aeroportos na primeira vez que alguém usa voos. */
export async function ensureAviationCatalog() {
  const [airlines, airports] = await Promise.all([prisma.airline.count(), prisma.airport.count()]);
  if (!airlines)
    await prisma.airline.createMany({
      data: AIRLINES.map(([code, name]) => ({ code, name })),
      skipDuplicates: true,
    });
  if (!airports)
    await prisma.airport.createMany({
      data: AIRPORTS.map(([iata, name, city, country, timezone]) => ({
        iata,
        name,
        city,
        country,
        timezone,
      })),
      skipDuplicates: true,
    });
}

/** Fuso do aeroporto (catálogo), com o do projeto como reserva. */
export async function airportTimezones(iatas: string[], fallback: string) {
  const rows = await prisma.airport.findMany({
    where: { iata: { in: [...new Set(iatas.filter(Boolean))] } },
    select: { iata: true, timezone: true, name: true, city: true, country: true },
  });
  const map = new Map(rows.map((r) => [r.iata, r]));
  return {
    tz: (iata: string) => map.get(iata)?.timezone || fallback,
    info: (iata: string) => map.get(iata) ?? null,
  };
}

type FlightRow = {
  id: string;
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  operatedBy: string;
  originIata: string;
  originName: string;
  destIata: string;
  destName: string;
  departureAt: Date | null;
  arrivalAt: Date | null;
  scope: "DOMESTIC" | "INTERNATIONAL";
  liveData: unknown;
  liveCheckedAt: Date | null;
};

/** Voos prontos para exibição: horários no fuso de cada aeroporto. */
export async function toFlightViews(
  flights: FlightRow[],
  fallbackTz: string,
): Promise<FlightView[]> {
  const air = await airportTimezones(
    flights.flatMap((f) => [f.originIata, f.destIata]),
    fallbackTz,
  );
  return flights.map((f) => {
    const oTz = air.tz(f.originIata);
    const dTz = air.tz(f.destIata);
    return {
      id: f.id,
      airlineCode: f.airlineCode,
      airlineName: f.airlineName,
      flightNumber: f.flightNumber,
      operatedBy: f.operatedBy,
      originIata: f.originIata,
      originCity: air.info(f.originIata)?.city || f.originName.split(" · ")[0] || "",
      destIata: f.destIata,
      destCity: air.info(f.destIata)?.city || f.destName.split(" · ")[0] || "",
      depDate: formatInZone(f.departureAt, oTz, "weekday"),
      depTime: formatInZone(f.departureAt, oTz, "time"),
      arrTime: formatInZone(f.arrivalAt, dTz, "time"),
      dayOffset: dayOffset(f.departureAt, oTz, f.arrivalAt, dTz),
      duration: formatDuration(f.departureAt, f.arrivalAt),
      scope: f.scope,
      departureIso: f.departureAt?.toISOString() ?? null,
      live: parseFlightLive(f.liveData),
      liveCheckedLabel: f.liveCheckedAt
        ? formatInZone(f.liveCheckedAt, fallbackTz, "datetime")
        : "",
    };
  });
}

/** Pede ao worker para atualizar o status ao vivo dos voos do projeto. */
export async function requestFlightRefresh(projectId: string, force = false) {
  if (!process.env.APIFY_TOKEN) return false;
  await enqueueJob(prisma, {
    queue: FLIGHTS_REFRESH_QUEUE,
    payload: { projectId, force },
    uniqueKey: `flights:${projectId}`,
    maxAttempts: 3,
  });
  return true;
}

export const liveStatusEnabled = () => !!process.env.APIFY_TOKEN;

/** Viajantes (inscrições ativas) do projeto, para seletores. */
export async function travelersOf(db: TenantDb, projectId: string) {
  const rows = await db.registration.findMany({
    where: { projectId, status: { notIn: ["CANCELED", "DECLINED"] } },
    orderBy: [{ person: { firstName: "asc" } }, { person: { lastName: "asc" } }],
    select: {
      id: true,
      role: true,
      groupId: true,
      categoryId: true,
      shortCode: true,
      person: { select: { firstName: true, lastName: true } },
      group: { select: { name: true, color: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: `${r.person.firstName} ${r.person.lastName}`.trim(),
    role: r.role,
    shortCode: r.shortCode,
    groupId: r.groupId,
    categoryId: r.categoryId,
    group: r.group,
  }));
}

export type TravelerOption = Awaited<ReturnType<typeof travelersOf>>[number];

/** Garante que todas as inscrições informadas são do projeto. */
export async function assertRegistrations(db: TenantDb, projectId: string, ids: string[]) {
  if (!ids.length) return;
  const n = await db.registration.count({ where: { projectId, id: { in: ids } } });
  if (n !== new Set(ids).size) throw forbidden("Há pessoas que não pertencem a este projeto.");
}
