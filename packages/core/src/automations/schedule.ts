import { addCalendarDays, zonedParts } from "../messaging/timezone";

/**
 * Agenda das réguas automáticas — regras puras.
 *
 * Princípios (ver docs/REGUAS.md):
 *  • Todo horário é calculado no fuso do projeto (ou do cliente), nunca no do
 *    servidor; o banco guarda instantes UTC.
 *  • "D-1 às 09:00" é a data de calendário do início, no fuso do projeto, menos
 *    um dia, às 09:00 de parede — atravessando horário de verão corretamente.
 *  • Anti-avalanche: uma régua só dispara dentro da janela [instante,
 *    instante + tolerância). Régua criada, ligada ou reagendada depois disso não
 *    envia o que já passou. A tolerância (6 h) cobre o worker fora do ar por
 *    algumas horas sem transformar uma régua nova em disparo em massa atrasado.
 */

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** Atraso máximo aceito entre o instante previsto e o envio (ver cabeçalho). */
export const DUE_TOLERANCE_MS = 6 * HOUR_MS;

export const AUTOMATION_TRIGGERS = [
  "REGISTRATION_CREATED",
  "REGISTRATION_CONFIRMED",
  "CHECKED_IN",
  "DAYS_BEFORE_START",
  "DAYS_AFTER_END",
  "INVITE_DEADLINE_BEFORE",
  "FLIGHT_DEPARTURE_BEFORE",
  "PASSPORT_EXPIRING",
  "DOCUMENTS_PENDING",
] as const;

export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

/** Disparados por um acontecimento da inscrição (fila `automations.event`). */
export const EVENT_TRIGGERS: ReadonlySet<AutomationTrigger> = new Set([
  "REGISTRATION_CREATED",
  "REGISTRATION_CONFIRMED",
  "CHECKED_IN",
]);

/** Disparados por data, encontrados pela varredura periódica do worker. */
export const SCHEDULED_TRIGGERS: ReadonlySet<AutomationTrigger> = new Set([
  "DAYS_BEFORE_START",
  "DAYS_AFTER_END",
  "INVITE_DEADLINE_BEFORE",
  "FLIGHT_DEPARTURE_BEFORE",
  "PASSPORT_EXPIRING",
  "DOCUMENTS_PENDING",
]);

/** Lembretes que repetem até a pendência ser resolvida. */
export const REPEATING_TRIGGERS: ReadonlySet<AutomationTrigger> = new Set([
  "PASSPORT_EXPIRING",
  "DOCUMENTS_PENDING",
]);

export const isEventTrigger = (t: string): boolean => EVENT_TRIGGERS.has(t as AutomationTrigger);
export const isScheduledTrigger = (t: string): boolean =>
  SCHEDULED_TRIGGERS.has(t as AutomationTrigger);

/** Limites aceitos na tela e no servidor. */
export const AUTOMATION_LIMITS = {
  offsetDays: 365,
  offsetHours: 24 * 14,
  repeatEveryDays: 30,
  maxSends: 10,
} as const;

// ---------------------------------------------------------------------------
// Horário de parede → instante
// ---------------------------------------------------------------------------

const SEND_AT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseSendAt(sendAt: string): { hour: number; minute: number } {
  const m = SEND_AT_RE.exec(sendAt.trim());
  if (!m) return { hour: 9, minute: 0 };
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

type Wall = { year: number; month: number; day: number; hour: number; minute: number };

function sameWall(date: Date, wall: Wall, timeZone: string): boolean {
  const p = zonedParts(date, timeZone);
  return (
    p.year === wall.year &&
    p.month === wall.month &&
    p.dayOfMonth === wall.day &&
    p.hour === wall.hour &&
    p.minute === wall.minute
  );
}

/** Deslocamento (ms) do fuso em relação ao UTC num instante. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.dayOfMonth, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Instante UTC de um horário de parede no fuso, tratando as duas bordas do
 * horário de verão:
 *  • horário repetido (o relógio volta): vale a PRIMEIRA ocorrência;
 *  • horário inexistente (o relógio adianta): empurra para depois do salto
 *    (02:30 que não existe vira 03:30), em vez de voltar para antes dele.
 */
export function wallTimeToUtc(wall: Wall, timeZone: string): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
  const offBefore = zoneOffsetMs(new Date(guess - 12 * HOUR_MS), timeZone);
  const offAfter = zoneOffsetMs(new Date(guess + 12 * HOUR_MS), timeZone);
  const candidates = [guess - offBefore, guess - offAfter]
    .map((t) => new Date(t))
    .filter((d) => sameWall(d, wall, timeZone))
    .sort((a, b) => a.getTime() - b.getTime());
  if (candidates[0]) return candidates[0];
  // Lacuna do horário de verão: interpreta com o deslocamento de antes do salto
  return new Date(guess - offBefore);
}

/** Data de calendário ("AAAA-MM-DD") de um instante no fuso. */
export const localDay = (date: Date, timeZone: string): string => zonedParts(date, timeZone).day;

/** Dia de calendário (no fuso) de `anchor` deslocado em `days`, às `sendAt`. */
export function dayShiftedAt(anchor: Date, days: number, sendAt: string, timeZone: string): Date {
  const d = addCalendarDays(localDay(anchor, timeZone), days);
  const t = parseSendAt(sendAt);
  return wallTimeToUtc({ ...d, ...t }, timeZone);
}

// ---------------------------------------------------------------------------
// Ocorrências por régua
// ---------------------------------------------------------------------------

export type AutomationSchedule = {
  trigger: AutomationTrigger;
  offsetDays: number;
  offsetHours: number;
  sendAt: string;
  repeatEveryDays: number;
  maxSends: number;
};

export type ProjectDates = {
  timeZone: string;
  startsAt: Date | null;
  endsAt: Date | null;
  inviteDeadline?: Date | null;
};

/**
 * Um disparo previsto. `key` identifica a ocorrência (entra na chave de
 * idempotência do envio e do job); `windowEnd` é o limite para ainda enviar.
 */
export type Occurrence = { key: string; at: Date; windowEnd: Date; index: number };

function occurrence(key: string, at: Date, index: number, cap?: Date | null): Occurrence {
  let end = at.getTime() + DUE_TOLERANCE_MS;
  // Lembrete "antes de" nunca sai depois do próprio acontecimento
  if (cap && cap.getTime() > at.getTime()) end = Math.min(end, cap.getTime());
  return { key, at, windowEnd: new Date(end), index };
}

/**
 * Ocorrências das réguas de nível do projeto (todas as pessoas no mesmo
 * instante). Eventos e voos não entram aqui: os de evento disparam na hora e
 * os de voo têm um instante por voo (`flightOccurrence`).
 */
export function projectOccurrences(a: AutomationSchedule, p: ProjectDates): Occurrence[] {
  const tz = p.timeZone;
  switch (a.trigger) {
    case "DAYS_BEFORE_START": {
      if (!p.startsAt) return [];
      const at = dayShiftedAt(p.startsAt, -a.offsetDays, a.sendAt, tz);
      return [occurrence(`d${localDay(at, tz)}`, at, 0, p.startsAt)];
    }
    case "DAYS_AFTER_END": {
      const end = p.endsAt ?? p.startsAt;
      if (!end) return [];
      const at = dayShiftedAt(end, a.offsetDays, a.sendAt, tz);
      return [occurrence(`d${localDay(at, tz)}`, at, 0)];
    }
    case "INVITE_DEADLINE_BEFORE": {
      if (!p.inviteDeadline) return [];
      const at = dayShiftedAt(p.inviteDeadline, -a.offsetDays, a.sendAt, tz);
      return [occurrence(`d${localDay(at, tz)}`, at, 0, p.inviteDeadline)];
    }
    case "PASSPORT_EXPIRING":
    case "DOCUMENTS_PENDING": {
      if (!p.startsAt) return [];
      const first = dayShiftedAt(p.startsAt, -a.offsetDays, a.sendAt, tz);
      const firstDay = localDay(first, tz);
      const total = a.repeatEveryDays > 0 ? Math.max(1, a.maxSends) : 1;
      const out: Occurrence[] = [];
      for (let k = 0; k < total; k++) {
        const at = dayShiftedAt(p.startsAt, -a.offsetDays + k * a.repeatEveryDays, a.sendAt, tz);
        // Depois do embarque, cobrar documento não ajuda mais
        if (at.getTime() >= p.startsAt.getTime()) break;
        out.push(occurrence(`r${firstDay}:${k + 1}`, at, k, p.startsAt));
      }
      return out;
    }
    default:
      return [];
  }
}

/** Lembrete de voo: `offsetHours` (+ `offsetDays`) antes da partida. */
export function flightOccurrence(
  a: Pick<AutomationSchedule, "offsetDays" | "offsetHours">,
  flight: { id: string; departureAt: Date },
): Occurrence {
  const lead = (a.offsetDays * 24 + a.offsetHours) * HOUR_MS;
  const at = new Date(flight.departureAt.getTime() - lead);
  return occurrence(`f${flight.id}:${flight.departureAt.toISOString()}`, at, 0, flight.departureAt);
}

/** Antecedência total de um lembrete de voo, em ms (para a varredura buscar voos). */
export const flightLeadMs = (a: Pick<AutomationSchedule, "offsetDays" | "offsetHours">) =>
  (a.offsetDays * 24 + a.offsetHours) * HOUR_MS;

/**
 * A ocorrência deve disparar agora?
 *  • dentro da janela [at, windowEnd);
 *  • e a régua já estava ligada antes de `at + tolerância` (anti-avalanche:
 *    régua ligada depois disso não recupera o que passou).
 */
export function isDue(occ: Occurrence, now: Date, activatedAt: Date | null): boolean {
  const t = now.getTime();
  if (t < occ.at.getTime() || t >= occ.windowEnd.getTime()) return false;
  if (activatedAt && activatedAt.getTime() > occ.at.getTime() + DUE_TOLERANCE_MS) return false;
  return true;
}

/** Próximo disparo previsto (o que ainda está na janela conta como "agora"). */
export function nextOccurrence(occs: readonly Occurrence[], now: Date): Occurrence | null {
  const t = now.getTime();
  return (
    [...occs]
      .filter((o) => o.windowEnd.getTime() > t)
      .sort((a, b) => a.at.getTime() - b.at.getTime())[0] ?? null
  );
}

// ---------------------------------------------------------------------------
// Gatilhos por evento
// ---------------------------------------------------------------------------

/**
 * Até quanto tempo depois do acontecimento a mensagem ainda faz sentido (fila
 * parada, worker fora do ar). Boas-vindas do check-in envelhecem rápido; a
 * credencial da inscrição continua útil por alguns dias.
 */
export const EVENT_MAX_DELAY_MS: Record<
  "REGISTRATION_CREATED" | "REGISTRATION_CONFIRMED" | "CHECKED_IN",
  number
> = {
  REGISTRATION_CREATED: 3 * DAY_MS,
  REGISTRATION_CONFIRMED: 3 * DAY_MS,
  CHECKED_IN: DUE_TOLERANCE_MS,
};

/**
 * A régua vale para um acontecimento em `eventAt`? Não vale se foi ligada
 * depois dele (além da tolerância) nem se o acontecimento é velho demais.
 */
export function eventDispatchable(
  trigger: "REGISTRATION_CREATED" | "REGISTRATION_CONFIRMED" | "CHECKED_IN",
  eventAt: Date,
  now: Date,
  activatedAt: Date | null,
): { ok: true } | { ok: false; reason: "ACTIVATED_LATER" | "TOO_OLD" } {
  if (activatedAt && activatedAt.getTime() > eventAt.getTime() + DUE_TOLERANCE_MS)
    return { ok: false, reason: "ACTIVATED_LATER" };
  if (now.getTime() - eventAt.getTime() > EVENT_MAX_DELAY_MS[trigger])
    return { ok: false, reason: "TOO_OLD" };
  return { ok: true };
}

/** Uma régua precisa ter `activatedAt` renovado ao salvar? (ligada ou reagendada) */
export function scheduleChanged(
  before: (AutomationSchedule & { active: boolean }) | null,
  after: AutomationSchedule & { active: boolean },
): boolean {
  if (!after.active) return false;
  if (!before || !before.active) return true;
  return (
    before.trigger !== after.trigger ||
    before.offsetDays !== after.offsetDays ||
    before.offsetHours !== after.offsetHours ||
    before.sendAt !== after.sendAt ||
    before.repeatEveryDays !== after.repeatEveryDays ||
    before.maxSends !== after.maxSends
  );
}
