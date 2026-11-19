/**
 * Status de voo ao vivo (fila `flights.refresh`).
 *
 * A web só enfileira o pedido (ao abrir a tela de voos ou no botão "Atualizar");
 * aqui o worker consulta a fonte — o actor da Apify `apt_marble/flight-status-tracker`,
 * o mesmo do portal da ABIEC — e grava o resultado no próprio voo, que serve de cache.
 * Uma varredura periódica enfileira sozinha os projetos com voos perto da partida
 * ou em andamento, para o portal do viajante mostrar o status sem ninguém pedir.
 *
 * As regras (cache, agrupamento por data, casamento das linhas) são puras e
 * ficam em @mais/core/travel.
 */
import { z } from "zod";
import type { Prisma, PrismaClient } from "@mais/db";
import { enqueueJob } from "@mais/messaging";
import { inLiveSweepWindow, matchLiveRows, planLiveRefresh, staleFlights } from "@mais/core/travel";
import type { JobHandler, Logger } from "./runner";

export const FLIGHTS_REFRESH_QUEUE = "flights.refresh";

const ACTOR = "apt_marble~flight-status-tracker";
const RUN_TIMEOUT_S = 90;

/** Consulta a fonte: números de voo + data de operação ("" = atual/próxima). */
export type FlightStatusSource = (
  numbers: string[],
  date: string,
) => Promise<Record<string, unknown>[]>;

export function apifyFlightSource(
  token: string,
  fetchImpl: typeof fetch = fetch,
): FlightStatusSource {
  return async (numbers, date) => {
    const input: Record<string, unknown> = {
      flights: numbers,
      includeHistory: false,
      market: "BR",
    };
    if (date) input.date = date;
    const res = await fetchImpl(
      `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=${RUN_TIMEOUT_S}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout((RUN_TIMEOUT_S + 15) * 1000),
      },
    );
    if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) throw new Error("Apify: resposta inesperada (não é uma lista).");
    return rows.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
  };
}

const payloadSchema = z.object({
  projectId: z.string().min(1),
  force: z.boolean().default(false),
});

/** Atualiza o status ao vivo dos voos do projeto cujo cache venceu. */
export async function refreshProjectFlights(
  db: PrismaClient,
  source: FlightStatusSource,
  input: { projectId: string; force: boolean },
  now = new Date(),
): Promise<{ consulted: number; updated: number }> {
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: {
      timezone: true,
      archivedAt: true,
      tenant: { select: { timezone: true } },
      flights: {
        select: {
          id: true,
          flightNumber: true,
          originIata: true,
          departureAt: true,
          liveCheckedAt: true,
          liveData: true,
        },
      },
    },
  });
  if (!project || project.archivedAt) return { consulted: 0, updated: 0 };

  const stale = staleFlights(project.flights, { force: input.force, now });
  if (!stale.length) return { consulted: 0, updated: 0 };

  const fallbackTz =
    project.timezone ||
    project.tenant.timezone ||
    process.env.DEFAULT_TIMEZONE ||
    "America/Sao_Paulo";
  const airports = await db.airport.findMany({
    where: { iata: { in: [...new Set(stale.map((f) => f.originIata).filter(Boolean))] } },
    select: { iata: true, timezone: true },
  });
  const tzByIata = new Map(airports.map((a) => [a.iata, a.timezone]));

  const groups = planLiveRefresh(
    stale.map((f) => ({
      id: f.id,
      flightNumber: f.flightNumber,
      departureAt: f.departureAt,
      originTimeZone: tzByIata.get(f.originIata) || fallbackTz,
    })),
    now,
  );

  let updated = 0;
  for (const g of groups) {
    const rows = await source(g.numbers, g.date);
    const flights = stale.filter((f) => g.flightIds.includes(f.id));
    const live = matchLiveRows(flights, rows, now);
    for (const [id, value] of live) {
      await db.flight.update({
        where: { id },
        data: {
          liveStatus: value.phase,
          liveData: value as unknown as Prisma.InputJsonValue,
          liveCheckedAt: now,
        },
      });
      updated++;
    }
  }
  return { consulted: groups.length, updated };
}

export function flightJobHandlers(
  db: PrismaClient,
  source: FlightStatusSource,
  log: Logger = console,
): Record<string, JobHandler> {
  return {
    [FLIGHTS_REFRESH_QUEUE]: async (payload) => {
      const parsed = payloadSchema.safeParse(payload);
      if (!parsed.success) {
        log.warn(`[voos] pedido inválido ignorado: ${parsed.error.message}`);
        return;
      }
      const r = await refreshProjectFlights(db, source, parsed.data);
      if (r.updated)
        log.info(`[voos] ${r.updated} voo(s) atualizado(s) em ${r.consulted} consulta(s)`);
    },
  };
}

/**
 * Enfileira (sem duplicar) os projetos com algum voo dentro da janela de
 * acompanhamento. O handler ainda respeita o cache de cada voo.
 */
export async function sweepLiveFlights(db: PrismaClient, now = new Date()): Promise<number> {
  const from = new Date(now.getTime() - 24 * 3_600_000);
  const to = new Date(now.getTime() + 6 * 3_600_000);
  const flights = await db.flight.findMany({
    where: {
      departureAt: { gte: from, lte: to },
      flightNumber: { not: "" },
      project: { archivedAt: null },
    },
    select: { projectId: true, departureAt: true, arrivalAt: true },
  });
  const projects = new Set(
    flights
      .filter((f) => inLiveSweepWindow(f.departureAt, f.arrivalAt, now))
      .map((f) => f.projectId),
  );
  for (const projectId of projects)
    await enqueueJob(db, {
      queue: FLIGHTS_REFRESH_QUEUE,
      payload: { projectId, force: false },
      uniqueKey: `flights:${projectId}`,
      maxAttempts: 3,
    });
  return projects.size;
}
