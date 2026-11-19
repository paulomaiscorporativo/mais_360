/**
 * Utilidades de fuso horário.
 *
 * Regra de ouro (incidente de 17/11/2026): NUNCA usar getHours()/setHours()
 * do relógio do servidor para decidir horário de envio. Todo cálculo de
 * "que horas são no evento" passa por Intl com timeZone explícito.
 */

export type ZonedParts = {
  /** "AAAA-MM-DD" no fuso informado */
  day: string;
  year: number;
  month: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
  second: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Valida um identificador IANA ("America/Sao_Paulo"). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of formatterFor(timeZone).formatToParts(date)) parts[p.type] = p.value;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const dayOfMonth = Number(parts.day);
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    year,
    month,
    dayOfMonth,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Diferença (ms) entre o relógio local do fuso e o UTC naquele instante. */
function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.dayOfMonth, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Instante UTC correspondente a uma data/hora "de parede" no fuso.
 * Corrige o deslocamento duas vezes para atravessar trocas de horário de verão.
 */
export function zonedTimeToUtc(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
  let result = guess - offsetMs(new Date(guess), timeZone);
  result = guess - offsetMs(new Date(result), timeZone);
  return new Date(result);
}

/** Meia-noite de hoje no fuso, como instante UTC. */
export function startOfZonedDay(now: Date, timeZone: string): Date {
  const p = zonedParts(now, timeZone);
  return zonedTimeToUtc(
    { year: p.year, month: p.month, day: p.dayOfMonth, hour: 0, minute: 0 },
    timeZone,
  );
}

/** Soma dias a uma data de calendário "AAAA-MM-DD" (sem fuso envolvido). */
export function addCalendarDays(
  day: string,
  days: number,
): { year: number; month: number; day: number } {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/** Dias de calendário entre hoje (no fuso) e a data alvo (no fuso). Negativo se já passou. */
export function calendarDaysUntil(target: Date, now: Date, timeZone: string): number {
  const a = zonedParts(now, timeZone);
  const b = zonedParts(target, timeZone);
  const da = Date.UTC(a.year, a.month - 1, a.dayOfMonth);
  const db = Date.UTC(b.year, b.month - 1, b.dayOfMonth);
  return Math.round((db - da) / 86_400_000);
}

export function formatDateBR(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatTimeBR(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** "hoje às 08:00", "amanhã às 08:00" ou "19/11/2026 às 08:00" — no fuso informado. */
export function describeWhenBR(target: Date, now: Date, timeZone: string): string {
  const diff = calendarDaysUntil(target, now, timeZone);
  const hora = formatTimeBR(target, timeZone);
  if (diff === 0) return `hoje às ${hora}`;
  if (diff === 1) return `amanhã às ${hora}`;
  return `${formatDateBR(target, timeZone)} às ${hora}`;
}
