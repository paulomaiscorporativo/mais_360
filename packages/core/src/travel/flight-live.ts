/**
 * Status de voo em tempo real — normalização da fonte (Apify ·
 * flight-status-tracker) para um formato estável, usado pelo console, pelo
 * portal do viajante e pelo worker. Puro: sem I/O.
 */
import { toLocalDate } from "./datetime";

export type LivePhase =
  | "SCHEDULED"
  | "DELAYED"
  | "DEPARTED"
  | "AIRBORNE"
  | "LANDED"
  | "CANCELED"
  | "DIVERTED"
  | "NO_DATA";

export type FlightLiveSide = {
  iata: string | null;
  airport: string | null;
  city: string | null;
  terminal: string | null;
  gate: string | null;
  timeZone: string | null;
  /** ISO em UTC */
  scheduled: string | null;
  estimated: string | null;
  actual: string | null;
  delayMinutes: number | null;
};

export type FlightLive = {
  phase: LivePhase;
  sourceStatus: string | null;
  flightName: string | null;
  operatingFlight: string | null;
  origin: FlightLiveSide;
  destination: FlightLiveSide;
  aircraft: string | null;
  registration: string | null;
  altitudeFeet: number | null;
  groundspeedKmh: number | null;
  distanceRemainingKm: number | null;
  distanceTotalKm: number | null;
  notes: string[];
  collectedAt: string;
};

export type LiveTone = "success" | "warning" | "info" | "danger" | "neutral";

export const LIVE_PHASE: Record<LivePhase, { label: string; tone: LiveTone }> = {
  SCHEDULED: { label: "No horário", tone: "success" },
  DELAYED: { label: "Atrasado", tone: "warning" },
  DEPARTED: { label: "Saiu do portão", tone: "info" },
  AIRBORNE: { label: "Em voo", tone: "info" },
  LANDED: { label: "Pousou", tone: "success" },
  CANCELED: { label: "Cancelado", tone: "danger" },
  DIVERTED: { label: "Desviado", tone: "danger" },
  NO_DATA: { label: "Sem dados ao vivo", tone: "neutral" },
};

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function phaseOf(r: Row): LivePhase {
  if (r.resultUnknown || r.recordType === "none") return "NO_DATA";
  if (r.isCancelled) return "CANCELED";
  if (r.isDiverted) return "DIVERTED";
  if (r.hasLanded || r.actualArrival || r.actualLanding) return "LANDED";
  if (r.isAirborne || r.actualTakeoff) return "AIRBORNE";
  if (r.actualDeparture) return "DEPARTED";
  if ((num(r.departureDelayMinutes) ?? 0) >= 15) return "DELAYED";
  return "SCHEDULED";
}

function side(r: Row, p: "origin" | "destination"): FlightLiveSide {
  const dir = p === "origin" ? "Departure" : "Arrival";
  return {
    iata: str(r[`${p}Iata`]),
    airport: str(r[`${p}Airport`]),
    city: str(r[`${p}City`]),
    terminal: str(r[`${p}Terminal`]),
    gate: str(r[`${p}Gate`]),
    timeZone: str(r[`${p}TimeZone`]),
    scheduled: str(r[`scheduled${dir}`]),
    estimated: str(r[`estimated${dir}`]),
    actual: str(r[`actual${dir}`]),
    delayMinutes: num(r[p === "origin" ? "departureDelayMinutes" : "arrivalDelayMinutes"]),
  };
}

/** Linha crua da fonte → formato estável. */
export function normalizeFlightRow(r: Row, now = new Date()): FlightLive {
  const notes = [r.originDelayNotes, r.destinationDelayNotes]
    .flatMap((n) => (Array.isArray(n) ? n : []))
    .filter((n): n is string => typeof n === "string" && n.length > 0);
  return {
    phase: phaseOf(r),
    sourceStatus: str(r.flightStatus),
    flightName: str(r.flightName),
    operatingFlight: str(r.flightIdentifier),
    origin: side(r, "origin"),
    destination: side(r, "destination"),
    aircraft: str(r.aircraftTypeName) ?? str(r.aircraftType),
    registration: str(r.registration),
    altitudeFeet: num(r.altitudeFeet),
    groundspeedKmh: num(r.groundspeedKmh),
    distanceRemainingKm: num(r.distanceRemainingKm),
    distanceTotalKm: num(r.distanceTotalKm),
    notes,
    collectedAt: str(r.collectedAt) ?? now.toISOString(),
  };
}

export function emptyFlightLive(now = new Date()): FlightLive {
  const blank: FlightLiveSide = {
    iata: null,
    airport: null,
    city: null,
    terminal: null,
    gate: null,
    timeZone: null,
    scheduled: null,
    estimated: null,
    actual: null,
    delayMinutes: null,
  };
  return {
    phase: "NO_DATA",
    sourceStatus: null,
    flightName: null,
    operatingFlight: null,
    origin: blank,
    destination: { ...blank },
    aircraft: null,
    registration: null,
    altitudeFeet: null,
    groundspeedKmh: null,
    distanceRemainingKm: null,
    distanceTotalKm: null,
    notes: [],
    collectedAt: now.toISOString(),
  };
}

/** Lê o Json gravado no banco com tolerância (versões antigas, lixo). */
export function parseFlightLive(raw: unknown): FlightLive | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Partial<FlightLive>;
  if (typeof v.phase !== "string" || !(v.phase in LIVE_PHASE)) return null;
  if (!v.origin || !v.destination) return null;
  return v as FlightLive;
}

/** Número do voo normalizado para comparação: "la 8065" → "LA8065". */
export function normalizeFlightNumber(n: string): string {
  return n.replace(/\s+/g, "").toUpperCase();
}

/**
 * Tempo de cache conforme a fase: em voo ou perto da partida atualiza a cada
 * 3 min; pousado/cancelado, 1 h; demais, 20 min. Sem dado ainda: buscar já.
 */
export function liveCacheTtlMs(
  live: FlightLive | null,
  departureAt: Date | null,
  now = new Date(),
): number {
  if (!live) return 0;
  if (live.phase === "LANDED" || live.phase === "CANCELED") return 60 * 60_000;
  if (live.phase === "AIRBORNE" || live.phase === "DEPARTED") return 3 * 60_000;
  const dep = live.origin.estimated ?? live.origin.scheduled ?? departureAt?.toISOString();
  if (dep && Math.abs(new Date(dep).getTime() - now.getTime()) < 4 * 3_600_000) return 3 * 60_000;
  return 20 * 60_000;
}

/**
 * Data de operação a pedir à fonte (AAAA-MM-DD no fuso da origem). A fonte só
 * publica ~10 dias para trás e ~2 para frente; fora disso devolve "" (a fonte
 * responde com a operação atual/próxima do número de voo).
 */
export function operationDate(departureAt: Date | null, originDay: string, now = new Date()) {
  if (!departureAt) return "";
  const diffDays = (departureAt.getTime() - now.getTime()) / 86_400_000;
  if (diffDays < -9 || diffDays > 2) return "";
  return originDay;
}

/** Voos cujo cache venceu e devem ser consultados agora. */
export function staleFlights<
  F extends {
    flightNumber: string;
    departureAt: Date | null;
    liveCheckedAt: Date | null;
    liveData: unknown;
  },
>(flights: F[], opts: { force?: boolean; now?: Date } = {}): F[] {
  const now = opts.now ?? new Date();
  return flights.filter((f) => {
    if (!f.flightNumber.trim()) return false;
    if (!f.liveCheckedAt) return true;
    const age = now.getTime() - f.liveCheckedAt.getTime();
    // "forçar" ainda respeita 60 s para cliques repetidos não gastarem créditos
    const ttl = opts.force
      ? 60_000
      : liveCacheTtlMs(parseFlightLive(f.liveData), f.departureAt, now);
    return age > ttl;
  });
}

// ---------------------------------------------------------------------------
// Planejamento da consulta à fonte (o worker só faz o I/O)
// ---------------------------------------------------------------------------

/**
 * Janela da varredura automática: de 6 h antes da partida até 2 h depois da
 * chegada (sem chegada cadastrada, até 20 h depois da partida). Fora dela o
 * status só é consultado quando alguém abre a tela de voos.
 */
export function inLiveSweepWindow(
  departureAt: Date | null,
  arrivalAt: Date | null,
  now = new Date(),
): boolean {
  if (!departureAt) return false;
  const start = departureAt.getTime() - 6 * 3_600_000;
  const end =
    (arrivalAt ?? new Date(departureAt.getTime() + 18 * 3_600_000)).getTime() + 2 * 3_600_000;
  const t = now.getTime();
  return t >= start && t <= end;
}

export type LiveRefreshGroup = {
  /** "" = a fonte escolhe a operação atual/próxima do número de voo */
  date: string;
  flightIds: string[];
  /** Números normalizados, sem repetição, para uma única chamada */
  numbers: string[];
};

/**
 * Agrupa os voos a consultar por data de operação (no fuso do aeroporto de
 * origem), para fazer uma única chamada à fonte por data.
 */
export function planLiveRefresh(
  flights: { id: string; flightNumber: string; departureAt: Date | null; originTimeZone: string }[],
  now = new Date(),
): LiveRefreshGroup[] {
  const groups = new Map<string, LiveRefreshGroup>();
  for (const f of flights) {
    const number = normalizeFlightNumber(f.flightNumber);
    if (!number) continue;
    const day = f.departureAt ? toLocalDate(f.departureAt, f.originTimeZone) : "";
    const date = operationDate(f.departureAt, day, now);
    const g = groups.get(date) ?? { date, flightIds: [], numbers: [] };
    g.flightIds.push(f.id);
    if (!g.numbers.includes(number)) g.numbers.push(number);
    groups.set(date, g);
  }
  return [...groups.values()];
}

/**
 * Casa as linhas devolvidas pela fonte com os voos do grupo. Voo sem linha
 * correspondente recebe "Sem dados ao vivo" (a consulta foi feita).
 */
export function matchLiveRows(
  flights: { id: string; flightNumber: string }[],
  rows: Record<string, unknown>[],
  now = new Date(),
): Map<string, FlightLive> {
  const byNumber = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const raw = r.requestedFlight;
    const key = typeof raw === "string" ? normalizeFlightNumber(raw) : "";
    if (key && !byNumber.has(key)) byNumber.set(key, r);
  }
  const out = new Map<string, FlightLive>();
  for (const f of flights) {
    const row = byNumber.get(normalizeFlightNumber(f.flightNumber));
    out.set(f.id, row ? normalizeFlightRow(row, now) : emptyFlightLive(now));
  }
  return out;
}
