import { zonedTimeToUtc } from "@mais/core";

/**
 * Conversões de valores: dinheiro e datas.
 *
 * Datas do legado (Prisma + SQLite) chegam em milissegundos desde 1970 e têm
 * TRÊS significados diferentes, conforme o campo:
 *
 * 1. Instante real — createdAt, confirmedAt, lastLoginAt…: gravados por
 *    `new Date()` no servidor; já estão em UTC e passam sem conversão.
 * 2. Data de calendário — nascimento, validade, início da viagem…: o legado
 *    guardava "AAAA-MM-DD" como meia-noite UTC (`Date.UTC(y, m, d)`). A
 *    plataforma guarda o dia ao meio-dia UTC, que cai no mesmo dia em qualquer
 *    fuso das Américas e da Europa.
 * 3. Horário "de parede" — partida/chegada de voo: o legado gravava o horário
 *    digitado como se fosse UTC (`"2026-11-18T21:45" + "Z"`). O instante certo
 *    sai interpretando esse horário no fuso do lugar (aeroporto; na falta,
 *    America/Sao_Paulo).
 */

/** Reais (Float) → centavos inteiros. */
export function reaisToCents(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/**
 * Orçamento digitado livremente ("R$ 15.000,00", "15000", "até 8 mil") →
 * centavos quando é um número reconhecível; senão null (o texto vai para as notas).
 */
export function parseBudgetCents(text: string | null | undefined): number | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/^r\$\s*/i, "")
    .replace(/\s+/g, "")
    .trim();
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  let normalized: string;
  if (cleaned.includes(",")) normalized = cleaned.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) normalized = cleaned.replace(/\./g, "");
  else normalized = cleaned;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

/** Valor bruto do SQLite (ms, texto ISO ou null) → Date, ou null se inválido. */
export function toDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const d =
    typeof raw === "number" || typeof raw === "bigint"
      ? new Date(Number(raw))
      : typeof raw === "string" && /^\d+$/.test(raw)
        ? new Date(Number(raw))
        : new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Instante real: passa como está. */
export function instant(raw: unknown): Date | null {
  return toDate(raw);
}

/** Dia de calendário ("AAAA-MM-DD") lido do legado. */
export function calendarDay(raw: unknown): string | null {
  const d = toDate(raw);
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Data de calendário → meio-dia UTC do mesmo dia (convenção da plataforma). */
export function calendarNoon(raw: unknown): Date | null {
  const day = calendarDay(raw);
  return day ? new Date(`${day}T12:00:00Z`) : null;
}

/**
 * Data de calendário + horário "HH:MM" no fuso → instante UTC.
 * Ex.: check-in do hotel às 14:00, prazo da tarefa às 23:59.
 */
export function calendarAt(raw: unknown, time: string, timeZone: string): Date | null {
  const day = calendarDay(raw);
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!day || !m) return null;
  const [y, mo, d] = day.split("-").map(Number) as [number, number, number];
  return zonedTimeToUtc({ year: y, month: mo, day: d, hour: +m[1]!, minute: +m[2]! }, timeZone);
}

/** Horário de parede gravado como UTC → instante correto no fuso informado. */
export function wallClockToUtc(raw: unknown, timeZone: string): Date | null {
  const d = toDate(raw);
  if (!d) return null;
  return zonedTimeToUtc(
    {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
    },
    timeZone,
  );
}

/** Json guardado como texto no legado → valor, ou `fallback` quando inválido. */
export function parseJsonText(
  text: string | null | undefined,
  fallback: unknown,
): { value: unknown; ok: boolean } {
  const raw = String(text ?? "").trim();
  if (!raw) return { value: fallback, ok: true };
  try {
    return { value: JSON.parse(raw) as unknown, ok: true };
  } catch {
    return { value: fallback, ok: false };
  }
}

/** Cor hex válida (#rgb ou #rrggbb) em minúsculas, ou "". */
export function hexColor(value: string | null | undefined): string {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v) ? v : "";
}
