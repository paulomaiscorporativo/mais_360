import type { ProjectStatus } from "@mais/core";

/** Período legível no fuso do projeto: "12–14 de dez. de 2026". */
export function formatPeriod(start: Date | null, end: Date | null, timeZone: string): string {
  if (!start) return "Datas a definir";
  const day = (d: Date) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", timeZone }).format(d);
  const full = (d: Date) =>
    new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone }).format(d);
  if (!end || full(end) === full(start)) return full(start);
  const sameMonth =
    new Intl.DateTimeFormat("pt-BR", { month: "numeric", year: "numeric", timeZone }).format(start) ===
    new Intl.DateTimeFormat("pt-BR", { month: "numeric", year: "numeric", timeZone }).format(end);
  return sameMonth ? `${day(start)}–${full(end)}` : `${full(start)} – ${full(end)}`;
}

export function statusTone(s: ProjectStatus) {
  switch (s) {
    case "REGISTRATION_OPEN":
      return "info" as const;
    case "IN_PROGRESS":
      return "success" as const;
    case "COMPLETED":
    case "ARCHIVED":
      return "neutral" as const;
    default:
      return "warning" as const;
  }
}

/** Date → "YYYY-MM-DD" (para <input type="date">), no fuso do projeto. */
export function toDateInput(d: Date | null, timeZone: string): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
