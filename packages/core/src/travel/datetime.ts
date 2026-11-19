import { zonedParts, zonedTimeToUtc } from "../messaging/timezone";

/**
 * Datas de viagem: o operador digita sempre o horário LOCAL (o do bilhete);
 * guardamos o instante UTC correto usando o fuso do aeroporto/hotel/projeto.
 * Assim um voo GRU 21:40 → LIS 11:05 é exibido certo em qualquer lugar.
 */

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/;

/** "2026-12-01T21:40" (ou "2026-12-01") no fuso → Date UTC. Inválido → null. */
export function parseLocalDateTime(value: string, timeZone: string): Date | null {
  const m = LOCAL_RE.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00"] = m;
  const wall = { year: +y!, month: +mo!, day: +d!, hour: +h, minute: +mi };
  if (wall.month < 1 || wall.month > 12 || wall.day < 1 || wall.day > 31) return null;
  if (wall.hour > 23 || wall.minute > 59) return null;
  return zonedTimeToUtc(wall, timeZone);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Date → "2026-12-01T21:40" no fuso (para <input type="datetime-local">). */
export function toLocalInput(date: Date | null, timeZone: string): string {
  if (!date) return "";
  const p = zonedParts(date, timeZone);
  return `${p.day}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Date → "2026-12-01" no fuso. */
export function toLocalDate(date: Date | null, timeZone: string): string {
  return date ? zonedParts(date, timeZone).day : "";
}

/** Formatação pt-BR no fuso. */
export function formatInZone(
  date: Date | null | undefined,
  timeZone: string,
  style: "date" | "time" | "datetime" | "weekday" | "short" = "datetime",
): string {
  if (!date) return "";
  const opts: Intl.DateTimeFormatOptions =
    style === "date"
      ? { day: "2-digit", month: "short", year: "numeric" }
      : style === "time"
        ? { hour: "2-digit", minute: "2-digit" }
        : style === "weekday"
          ? { weekday: "long", day: "numeric", month: "long" }
          : style === "short"
            ? { day: "2-digit", month: "short" }
            : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" };
  return new Intl.DateTimeFormat("pt-BR", { timeZone, ...opts }).format(date).replace(".", "");
}

/** Duração entre dois instantes: "11h25" / "45 min". */
export function formatDuration(start: Date | null, end: Date | null): string {
  if (!start || !end) return "";
  const min = Math.round((end.getTime() - start.getTime()) / 60_000);
  if (min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${pad(m)}` : `${m} min`;
}

/** Diferença em dias de calendário entre a chegada e a partida (+1 = dia seguinte). */
export function dayOffset(start: Date | null, startTz: string, end: Date | null, endTz: string) {
  if (!start || !end) return 0;
  const a = zonedParts(start, startTz);
  const b = zonedParts(end, endTz);
  const da = Date.UTC(a.year, a.month - 1, a.dayOfMonth);
  const db = Date.UTC(b.year, b.month - 1, b.dayOfMonth);
  return Math.round((db - da) / 86_400_000);
}

export type Countdown = { past: boolean; days: number; hours: number; minutes: number };

/** Contagem regressiva até o instante alvo. */
export function countdown(target: Date, now = new Date()): Countdown {
  const diff = target.getTime() - now.getTime();
  const abs = Math.max(0, diff);
  return {
    past: diff <= 0,
    days: Math.floor(abs / 86_400_000),
    hours: Math.floor((abs % 86_400_000) / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
  };
}
