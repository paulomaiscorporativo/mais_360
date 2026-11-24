import { readTravelSettings, requiredDocumentKinds, type PersonDocumentKind } from "@mais/core";
import type { TravelerDocumentState } from "@mais/core/automations";
import type { PrismaClient } from "@mais/db";

/**
 * Leituras de viagem em grupo usadas pelas réguas e pelo contexto das
 * mensagens: documentos exigidos de cada viajante e o voo do lembrete.
 */

type Db = Pick<
  PrismaClient,
  "flight" | "personDocument" | "person" | "airport" | "flightPassenger"
>;

/** Mesma regra da tela de documentos: viagem internacional se houver voo internacional. */
export async function projectRequiredDocuments(
  db: Db,
  project: { id: string; settings: unknown },
): Promise<PersonDocumentKind[]> {
  const international =
    (await db.flight.count({ where: { projectId: project.id, scope: "INTERNATIONAL" } })) > 0;
  return requiredDocumentKinds(readTravelSettings(project.settings), international);
}

/** Situação documental de várias pessoas de uma vez (para lotes da régua). */
export async function travelerDocumentStates(
  db: Db,
  tenantId: string,
  personIds: string[],
  required: PersonDocumentKind[],
  tripEnd: Date | null,
): Promise<Map<string, TravelerDocumentState>> {
  const ids = [...new Set(personIds)];
  const [docs, people] = await Promise.all([
    db.personDocument.findMany({
      where: { tenantId, personId: { in: ids } },
      select: { id: true, personId: true, kind: true, expiresAt: true, createdAt: true },
    }),
    db.person.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, passportNumber: true, passportExpiry: true },
    }),
  ]);
  const out = new Map<string, TravelerDocumentState>();
  for (const p of people)
    out.set(p.id, {
      required,
      uploaded: docs.filter((d) => d.personId === p.id),
      passportNumber: p.passportNumber,
      passportExpiry: p.passportExpiry,
      tripEnd,
    });
  return out;
}

export type ReminderFlight = {
  number: string;
  route: string;
  departureAt: Date | null;
  departureTimeZone: string;
  locator?: string;
};

/** O voo do lembrete (ou o próximo voo da inscrição), pronto para o contexto. */
export async function reminderFlight(
  db: Db,
  registrationId: string,
  fallbackTz: string,
  opts: { flightId?: string; now: Date },
): Promise<ReminderFlight | null> {
  const fp = await db.flightPassenger.findFirst({
    where: {
      registrationId,
      ...(opts.flightId
        ? { flightId: opts.flightId }
        : { flight: { departureAt: { gte: opts.now } } }),
    },
    orderBy: { flight: { departureAt: "asc" } },
    include: { flight: true, locator: { select: { code: true } } },
  });
  if (!fp) return null;
  const f = fp.flight;
  const airport = await db.airport.findUnique({
    where: { iata: f.originIata },
    select: { timezone: true },
  });
  return {
    number: [f.airlineCode, f.flightNumber.replace(new RegExp(`^${f.airlineCode}`), "")]
      .filter(Boolean)
      .join(" ")
      .trim(),
    route: `${f.originIata} → ${f.destIata}`,
    departureAt: f.departureAt,
    departureTimeZone: airport?.timezone || fallbackTz,
    locator: fp.locator?.code || f.defaultLocator || undefined,
  };
}
