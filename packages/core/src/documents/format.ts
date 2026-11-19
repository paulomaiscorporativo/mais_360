/** Formatação PT-BR usada nos documentos. Sempre no fuso informado, nunca no do servidor. */

const DEFAULT_TZ = "America/Sao_Paulo";

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(v: Date | string | null | undefined, timeZone = DEFAULT_TZ): string {
  const d = toDate(v);
  if (!d) return "";
  return d.toLocaleDateString("pt-BR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "14h30" — o formato usado em vouchers de viagem. */
export function formatTime(v: Date | string | null | undefined, timeZone = DEFAULT_TZ): string {
  const d = toDate(v);
  if (!d) return "";
  return d
    .toLocaleTimeString("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .replace(":", "h");
}

export function formatDateTime(v: Date | string | null | undefined, timeZone = DEFAULT_TZ): string {
  const date = formatDate(v, timeZone);
  return date ? `${date} às ${formatTime(v, timeZone)}` : "";
}

/** "10 a 12 de novembro de 2026" / "30 de novembro a 2 de dezembro de 2026". */
export function formatPeriod(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  timeZone = DEFAULT_TZ,
): string {
  const s = toDate(start);
  const e = toDate(end);
  if (!s) return "";
  const parts = (d: Date) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("pt-BR", { timeZone, day: "numeric", month: "long", year: "numeric" })
        .formatToParts(d)
        .map((x) => [x.type, x.value]),
    );
    return { day: p.day ?? "", month: p.month ?? "", year: p.year ?? "" };
  };
  const a = parts(s);
  if (!e) return `${a.day} de ${a.month} de ${a.year}`;
  const b = parts(e);
  if (a.year !== b.year) return `${a.day} de ${a.month} de ${a.year} a ${b.day} de ${b.month} de ${b.year}`;
  if (a.month !== b.month) return `${a.day} de ${a.month} a ${b.day} de ${b.month} de ${b.year}`;
  if (a.day === b.day) return `${a.day} de ${a.month} de ${a.year}`;
  return `${a.day} a ${b.day} de ${a.month} de ${a.year}`;
}

export function formatCpf(v: string | undefined): string {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length !== 11) return v ?? "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Telefone E.164 brasileiro (5511999998888) → "(11) 99999-8888". */
export function formatPhone(v: string | undefined): string {
  let d = (v ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v ?? "";
}

export const ROLE_LABELS: Record<string, string> = {
  TRAVELER: "Viajante",
  COMPANION: "Acompanhante",
  GUEST: "Convidado",
  ATTENDEE: "Participante",
  EXHIBITOR: "Expositor",
  SPEAKER: "Palestrante",
  STAFF: "Organização",
  PRESS: "Imprensa",
};
