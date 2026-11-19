import { foldText } from "../people";

/**
 * EVENTOS E CONVITES — regras puras (sem I/O).
 *
 * Portado e corrigido da ABIEC (src/lib/invites.ts) e do sistema_convite:
 * cotas por empresa, expiração da data-limite, status do convite, leitura do
 * QR no check-in, assento livre na mesa e arquivo de agenda (.ics).
 */

type RandomInt = (max: number) => number;

// ---------------------------------------------------------------------------
// Status do convite (visão do convidado/organizador)
// ---------------------------------------------------------------------------

export const INVITE_STATUSES = [
  "PENDING",
  "SENT",
  "CONFIRMED",
  "DECLINED",
  "CHECKED_IN",
  "CANCELED",
] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

export const INVITE_STATUS_LABELS: Record<InviteStatus, string> = {
  PENDING: "Não enviado",
  SENT: "Enviado",
  CONFIRMED: "Confirmado",
  DECLINED: "Recusou",
  CHECKED_IN: "Credenciado",
  CANCELED: "Cancelado",
};

/**
 * O status do convite é DERIVADO da inscrição (fonte única), nunca guardado à
 * parte: cancelamento > check-in > resposta do convidado > envio.
 */
export function inviteStatus(r: {
  status: "PENDING" | "INVITED" | "CONFIRMED" | "DECLINED" | "WAITLIST" | "CANCELED";
  checkedInAt?: Date | null;
  sentAt?: Date | null;
}): InviteStatus {
  if (r.status === "CANCELED") return "CANCELED";
  if (r.checkedInAt) return "CHECKED_IN";
  if (r.status === "CONFIRMED") return "CONFIRMED";
  if (r.status === "DECLINED") return "DECLINED";
  if (r.sentAt || r.status === "INVITED") return "SENT";
  return "PENDING";
}

// ---------------------------------------------------------------------------
// Cotas das empresas
// ---------------------------------------------------------------------------

export type QuotaState = {
  quota: number;
  /** Convites ativos (não cancelados) da empresa, responsável incluso */
  used: number;
  lockedAt?: Date | null;
};

export type QuotaCheck =
  | { ok: true; remaining: number }
  | { ok: false; reason: "LOCKED" | "DEADLINE" | "FULL"; message: string };

/** A empresa pode inscrever mais um convidado agora? */
export function canCompanyRegister(
  c: QuotaState,
  deadline: Date | null | undefined,
  now: Date = new Date(),
  count = 1,
): QuotaCheck {
  if (c.lockedAt)
    return {
      ok: false,
      reason: "LOCKED",
      message: "O prazo para inscrever convidados terminou. Fale com a organização.",
    };
  if (deadline && now > deadline)
    return {
      ok: false,
      reason: "DEADLINE",
      message: "A data-limite para usar os convites já passou.",
    };
  const remaining = Math.max(0, c.quota - c.used);
  if (remaining < count)
    return {
      ok: false,
      reason: "FULL",
      message:
        remaining === 0
          ? "Todos os convites da cota já foram usados."
          : `Restam só ${remaining} convite(s) na cota.`,
    };
  return { ok: true, remaining: remaining - count };
}

export type ExpirationPlan = {
  /** Pode processar agora (data-limite passou ou o organizador antecipou) */
  allowed: boolean;
  companies: { id: string; returned: number }[];
  totalReturned: number;
};

/**
 * Expiração da data-limite: cada empresa ainda aberta devolve ao pool
 * individual o que não usou e para de inscrever. Idempotente: empresas já
 * travadas não devolvem de novo. `force` permite antecipar com confirmação.
 */
export function planQuotaExpiration(
  companies: readonly (QuotaState & { id: string })[],
  deadline: Date | null | undefined,
  now: Date = new Date(),
  force = false,
): ExpirationPlan {
  const allowed = force || (!!deadline && now > deadline);
  const list = companies
    .filter((c) => !c.lockedAt)
    .map((c) => ({ id: c.id, returned: Math.max(0, c.quota - c.used) }));
  return {
    allowed,
    companies: allowed ? list : [],
    totalReturned: allowed ? list.reduce((s, c) => s + c.returned, 0) : 0,
  };
}

/** Pool individual: quantos convites livres a organização ainda pode emitir. */
export function poolAvailable(pool: number, individualUsed: number): number {
  return Math.max(0, pool - individualUsed);
}

// ---------------------------------------------------------------------------
// Credenciais da empresa
// ---------------------------------------------------------------------------

/** Login legível e único a partir do nome: "Frigorífico Horizonte S/A" → "frigorificohorizonte". */
export function companyLogin(name: string, isTaken: (login: string) => boolean): string {
  const stop = new Set(["ltda", "sa", "s", "a", "me", "eireli", "epp", "de", "da", "do", "e"]);
  const words = foldText(name)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !stop.has(w));
  let base = words.join("").slice(0, 24) || "empresa";
  if (base.length < 4) base = `${base}empresa`;
  if (!isTaken(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}${i}`;
    if (!isTaken(candidate)) return candidate;
  }
  return `${base}${Date.now() % 100000}`;
}

/** Senha provisória legível (sem 0/O, 1/l/I): 10 caracteres com letras e números. */
export function provisionalPassword(randomInt: RandomInt, length = 10): string {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = letters + digits;
  const out: string[] = [];
  for (let i = 0; i < length; i++) out.push(all[randomInt(all.length)]!);
  // garante ao menos uma letra e um número (política de senha da plataforma)
  out[0] = letters[randomInt(letters.length)]!;
  out[length - 1] = digits[randomInt(digits.length)]!;
  return out.join("");
}

// ---------------------------------------------------------------------------
// Check-in: o que foi lido pela câmera, leitor USB ou digitado
// ---------------------------------------------------------------------------

export type ScanTarget = { kind: "token"; token: string } | { kind: "code"; code: string };

/**
 * Aceita a URL da credencial (…/c/<token>), o token cru ou o código curto de
 * 6 dígitos (digitado na recepção). Devolve null para leituras inúteis.
 */
export function parseScan(raw: string): ScanTarget | null {
  const value = raw.trim();
  if (!value) return null;
  const fromUrl = /\/c\/([A-Za-z0-9_-]{8,64})/.exec(value);
  if (fromUrl?.[1]) return { kind: "token", token: fromUrl[1] };
  const digits = value.replace(/[\s.-]/g, "");
  if (/^\d{6,8}$/.test(digits)) return { kind: "code", code: digits };
  if (/^[A-Za-z0-9_-]{12,64}$/.test(value)) return { kind: "token", token: value };
  return null;
}

// ---------------------------------------------------------------------------
// Mesas
// ---------------------------------------------------------------------------

/** Primeira cadeira livre (1..capacidade) ou null se a mesa está cheia. */
export function firstFreeSeat(capacity: number, taken: readonly (number | null)[]): number | null {
  const used = new Set(taken.filter((s): s is number => s != null));
  for (let s = 1; s <= capacity; s++) if (!used.has(s)) return s;
  return null;
}

/** Posições das cadeiras ao redor da mesa (para o desenho do mapa). */
export function seatPositions(
  shape: "ROUND" | "RECTANGULAR",
  capacity: number,
  size: { radius: number; width: number; height: number },
): { seat: number; x: number; y: number }[] {
  const out: { seat: number; x: number; y: number }[] = [];
  if (capacity <= 0) return out;
  if (shape === "ROUND") {
    const r = size.radius + 16;
    for (let i = 0; i < capacity; i++) {
      const a = (i / capacity) * Math.PI * 2 - Math.PI / 2;
      out.push({ seat: i + 1, x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    return out;
  }
  // Retangular: metade em cima, metade embaixo, distribuídas na largura
  const top = Math.ceil(capacity / 2);
  const bottom = capacity - top;
  const place = (n: number, y: number, offset: number) => {
    for (let i = 0; i < n; i++) {
      const x = -size.width / 2 + ((i + 0.5) * size.width) / n;
      out.push({ seat: offset + i + 1, x, y });
    }
  };
  place(top, -size.height / 2 - 16, 0);
  place(bottom, size.height / 2 + 16, top);
  return out;
}

// ---------------------------------------------------------------------------
// Agenda (.ics)
// ---------------------------------------------------------------------------

const icsEscape = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const icsDate = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** Quebra linhas longas em 75 octetos, como pede a RFC 5545. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(e: {
  uid: string;
  title: string;
  start: Date;
  end?: Date | null;
  location?: string;
  description?: string;
  url?: string;
  now?: Date;
}): string {
  const end = e.end && e.end > e.start ? e.end : new Date(e.start.getTime() + 4 * 3600_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mais 360//Convites//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${icsDate(e.now ?? new Date())}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * Combina a data do projeto (startsAt, em UTC) com o horário "HH:MM" do evento
 * no fuso informado. Usado no convite e no .ics.
 */
export function eventStartAt(startsAt: Date, time: string, timeZone: string): Date {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!m) return startsAt;
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(startsAt);
  // Descobre o deslocamento do fuso naquele dia e monta o instante exato.
  const guess = new Date(`${ymd}T${m[1]}:${m[2]}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}

// ---------------------------------------------------------------------------
// Configurações do evento (Json do EventInviteSettings)
// ---------------------------------------------------------------------------

export type NearbyHotel = {
  nome: string;
  endereco?: string;
  telefone?: string;
  distancia?: string;
  link?: string;
};
export type Amenity = { titulo: string; descricao?: string };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Lê o Json dos hotéis tolerando dados legados/incompletos. */
export function readHotels(raw: unknown): NearbyHotel[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((h) => (h && typeof h === "object" ? (h as Record<string, unknown>) : {}))
    .map((h) => ({
      nome: str(h.nome),
      endereco: str(h.endereco),
      telefone: str(h.telefone),
      distancia: str(h.distancia),
      link: str(h.link),
    }))
    .filter((h) => h.nome);
}

export function readAmenities(raw: unknown): Amenity[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => (a && typeof a === "object" ? (a as Record<string, unknown>) : {}))
    .map((a) => ({ titulo: str(a.titulo), descricao: str(a.descricao) }))
    .filter((a) => a.titulo);
}
