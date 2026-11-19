import { z } from "zod";
import {
  deriveTravelRequestKind,
  parseTravelRequestServices,
  type TravelRequestServices,
} from "../catalog";
import { parseMoneyToCents, TRAVEL_CURRENCIES } from "./money";

/**
 * Entrada da solicitação de viagem (área do associado e console). Validada
 * aqui, na borda, e transformada no formato do banco pela action.
 */

export const TRIP_TYPES = ["ONE_WAY", "ROUND_TRIP", "MULTI_CITY"] as const;
export type TripType = (typeof TRIP_TYPES)[number];
export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  ONE_WAY: "Só ida",
  ROUND_TRIP: "Ida e volta",
  MULTI_CITY: "Multitrecho",
};

export const TIME_PREFERENCES = ["ANY", "MORNING", "AFTERNOON", "NIGHT"] as const;
export type TimePreference = (typeof TIME_PREFERENCES)[number];
export const TIME_PREFERENCE_LABELS: Record<TimePreference, string> = {
  ANY: "Qualquer horário",
  MORNING: "Manhã",
  AFTERNOON: "Tarde",
  NIGHT: "Noite",
};

export const PASSENGER_TYPES = ["HOLDER", "COMPANION", "EMPLOYEE", "GUEST"] as const;
export type PassengerType = (typeof PASSENGER_TYPES)[number];
export const PASSENGER_TYPE_LABELS: Record<PassengerType, string> = {
  HOLDER: "Titular",
  COMPANION: "Acompanhante",
  EMPLOYEE: "Colaborador",
  GUEST: "Convidado",
};

export const TRAVEL_DOC_TYPES = ["PASSPORT", "RG", "CPF", "OTHER"] as const;
export type TravelDocType = (typeof TRAVEL_DOC_TYPES)[number];
export const TRAVEL_DOC_LABELS: Record<TravelDocType, string> = {
  PASSPORT: "Passaporte",
  RG: "RG",
  CPF: "CPF",
  OTHER: "Outro",
};

export const TRAVEL_SCOPES = ["DOMESTIC", "INTERNATIONAL"] as const;
export type TravelRequestScope = (typeof TRAVEL_SCOPES)[number];
export const TRAVEL_SCOPE_LABELS: Record<TravelRequestScope, string> = {
  DOMESTIC: "Nacional",
  INTERNATIONAL: "Internacional",
};

export const MAX_SEGMENTS = 6;
export const MAX_PASSENGERS = 9;

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");
const optionalIsoDate = z.union([isoDate, z.literal("")]).default("");
const text = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`);

export const segmentInputSchema = z.object({
  origin: text(120).min(2, "Informe a origem."),
  destination: text(120).min(2, "Informe o destino."),
  date: isoDate,
  timePreference: z.enum(TIME_PREFERENCES).default("ANY"),
  notes: text(300).default(""),
});

export const passengerInputSchema = z.object({
  name: text(160).min(3, "Informe o nome como no documento."),
  type: z.enum(PASSENGER_TYPES).default("HOLDER"),
  personId: z.string().max(40).optional(),
  birthDate: optionalIsoDate,
  docType: z.enum(TRAVEL_DOC_TYPES).default("PASSPORT"),
  docNumber: text(40).default(""),
  docExpiry: optionalIsoDate,
  nationality: text(60).default(""),
  email: text(160).default(""),
  phone: text(40).default(""),
  loyalty: text(160).default(""),
  notes: text(300).default(""),
});

export const travelRequestInputSchema = z.object({
  tripType: z.enum(TRIP_TYPES),
  scope: z.enum(TRAVEL_SCOPES).default("DOMESTIC"),
  flexibleDates: z.boolean().default(false),
  purpose: text(2000).min(3, "Conte o motivo da viagem."),
  notes: text(2000).default(""),
  budget: text(30).default(""),
  currency: z.enum(TRAVEL_CURRENCIES).default("BRL"),
  segments: z.array(segmentInputSchema).min(1, "Informe ao menos um trecho.").max(MAX_SEGMENTS),
  passengers: z
    .array(passengerInputSchema)
    .min(1, "Informe ao menos um passageiro.")
    .max(MAX_PASSENGERS, `No máximo ${MAX_PASSENGERS} passageiros por solicitação.`),
  services: z.array(z.string().max(40)).max(20),
  serviceDetails: z.record(z.string(), z.unknown()).default({}),
});

export type TravelRequestInput = z.input<typeof travelRequestInputSchema>;
export type TravelRequestParsed = z.output<typeof travelRequestInputSchema>;

/** Data "AAAA-MM-DD" → instante UTC ao meio-dia (não muda de dia em nenhum fuso do Brasil/Europa). */
export function dateOnlyToUtc(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

/** Instante → "AAAA-MM-DD" (para preencher campos de data). */
export function utcToDateOnly(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

export type NormalizedTravelRequest = {
  tripType: TripType;
  scope: TravelRequestScope;
  flexibleDates: boolean;
  purpose: string;
  notes: string;
  budgetCents: number | null;
  currency: string;
  origin: string;
  destination: string;
  departDate: Date;
  returnDate: Date | null;
  pax: number;
  kind: "AIR" | "HOTEL" | "PACKAGE" | "EVENT" | "OTHER";
  requestedServices: string[];
  serviceDetails: TravelRequestServices;
  segments: {
    sortOrder: number;
    origin: string;
    destination: string;
    date: Date;
    timePreference: TimePreference;
    notes: string;
  }[];
  passengers: {
    sortOrder: number;
    name: string;
    type: PassengerType;
    personId: string | null;
    birthDate: Date | null;
    docType: TravelDocType;
    docNumber: string;
    docExpiry: Date | null;
    nationality: string;
    email: string;
    phone: string;
    loyalty: string;
    notes: string;
  }[];
};

export type NormalizeResult =
  | { ok: true; data: NormalizedTravelRequest }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

const fail = (field: string, error: string): NormalizeResult => ({
  ok: false,
  error,
  fieldErrors: { [field]: error },
});

/**
 * Regras que o zod sozinho não expressa: quantidade de trechos por tipo de
 * viagem, datas em ordem, serviços conhecidos, orçamento válido e não
 * retroativo. `today` é "AAAA-MM-DD" no fuso do cliente.
 */
export function normalizeTravelRequest(input: TravelRequestParsed, today: string): NormalizeResult {
  const segs = input.segments;
  if (input.tripType === "ONE_WAY" && segs.length !== 1)
    return fail("segments", "Viagem só de ida tem um trecho.");
  if (input.tripType === "ROUND_TRIP" && segs.length !== 2)
    return fail("segments", "Viagem de ida e volta tem dois trechos.");
  if (input.tripType === "MULTI_CITY" && segs.length < 2)
    return fail("segments", "Multitrecho precisa de pelo menos dois trechos.");

  for (const [i, s] of segs.entries()) {
    if (s.date < today) return fail(`segments.${i}.date`, "A data do trecho já passou.");
    const prev = segs[i - 1];
    if (prev && s.date < prev.date)
      return fail(`segments.${i}.date`, "Os trechos precisam estar em ordem de data.");
    if (s.origin.toLowerCase() === s.destination.toLowerCase())
      return fail(`segments.${i}.destination`, "Origem e destino são iguais.");
  }

  const services = parseTravelRequestServices(input.services, input.serviceDetails);
  if (!services.ok) return fail("services", services.error);

  const budgetCents = parseMoneyToCents(input.budget);
  if (budgetCents !== null && (!Number.isFinite(budgetCents) || budgetCents <= 0))
    return fail("budget", "Informe o orçamento em reais, por exemplo 4.500,00.");

  const first = segs[0]!;
  const last = segs[segs.length - 1]!;
  const holderCount = input.passengers.filter((p) => p.type === "HOLDER").length;
  if (holderCount > 1) return fail("passengers", "Só um passageiro pode ser o titular.");

  return {
    ok: true,
    data: {
      tripType: input.tripType,
      scope: input.scope,
      flexibleDates: input.flexibleDates,
      purpose: input.purpose,
      notes: input.notes,
      budgetCents,
      currency: input.currency,
      origin: first.origin,
      destination: input.tripType === "MULTI_CITY" ? last.destination : first.destination,
      departDate: dateOnlyToUtc(first.date),
      returnDate: input.tripType === "ONE_WAY" ? null : dateOnlyToUtc(last.date),
      pax: input.passengers.length,
      kind: deriveTravelRequestKind(services.requested),
      requestedServices: services.requested,
      serviceDetails: services.details,
      segments: segs.map((s, i) => ({
        sortOrder: i,
        origin: s.origin,
        destination: s.destination,
        date: dateOnlyToUtc(s.date),
        timePreference: s.timePreference,
        notes: s.notes,
      })),
      passengers: input.passengers.map((p, i) => ({
        sortOrder: i,
        name: p.name,
        type: p.type,
        personId: p.personId || null,
        birthDate: p.birthDate ? dateOnlyToUtc(p.birthDate) : null,
        docType: p.docType,
        docNumber: p.docNumber,
        docExpiry: p.docExpiry ? dateOnlyToUtc(p.docExpiry) : null,
        nationality: p.nationality,
        email: p.email,
        phone: p.phone,
        loyalty: p.loyalty,
        notes: p.notes,
      })),
    },
  };
}

/** Rota resumida para listas: "São Paulo → Lisboa → Madri". */
export function routeLabel(segments: readonly { origin: string; destination: string }[]): string {
  if (!segments.length) return "";
  const stops = [segments[0]!.origin];
  for (const s of segments) {
    if (stops[stops.length - 1] !== s.origin) stops.push(s.origin);
    stops.push(s.destination);
  }
  return stops.join(" → ");
}
