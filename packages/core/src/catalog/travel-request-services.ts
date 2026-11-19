import { z } from "zod";
import { CABIN_CLASSES, ROOM_TYPES, type ServiceType } from "./service-types";

/**
 * Blocos de serviço da SOLICITAÇÃO de viagem (o que o viajante pede, antes da
 * cotação). Equivale aos blocos da "linha direta" da ABIEC — aéreo,
 * hospedagem, transporte terrestre e serviços de apoio — agora gravados em
 * `TravelRequest.requestedServices` + `TravelRequest.serviceDetails`.
 *
 * O que é pedido é diferente do que é emitido: o pedido diz "executiva, até
 * 4 estrelas"; o emitido (ServiceItem) diz "LA 8065, Hotel Arts, quarto 1204".
 */

const s = (max = 300) => z.string().trim().max(max).default("");
const date = z.coerce.date().optional();

export const travelRequestServiceSchemas = {
  AIR: z.object({
    cabin: z.enum(CABIN_CLASSES).default("ECONOMY"),
    preferredAirline: s(80),
    checkedBaggage: z.boolean().default(true),
    seatPreference: z.enum(["WINDOW", "AISLE", "ANY"]).default("ANY"),
    loyaltyProgram: s(120),
  }),
  HOTEL: z.object({
    city: s(120),
    checkIn: date,
    checkOut: date,
    stars: z.enum(["3", "4", "5", "ANY"]).default("ANY"),
    rooms: z.number().int().min(1).max(50).default(1),
    roomType: z.enum(ROOM_TYPES).default("DOUBLE"),
    chain: s(80),
    breakfast: z.boolean().default(true),
    reference: s(300), // "perto do centro de convenções"
  }),
  TRANSFER: z.object({ notes: s(1000) }),
  CAR_RENTAL: z.object({
    category: s(60),
    pickup: s(200),
    dropoff: s(200),
    extraDriver: z.boolean().default(false),
  }),
  CHAUFFEUR: z.object({ notes: s(1000) }),
  TRAVEL_INSURANCE: z.object({ notes: s(500) }),
  CURRENCY_EXCHANGE: z.object({ notes: s(500) }),
  VISA: z.object({ notes: s(500) }),
  CONNECTIVITY: z.object({ notes: s(500) }),
  EVENT_TICKET: z.object({ eventName: s(200) }),
} as const satisfies Partial<Record<ServiceType, z.ZodType>>;

export type RequestableService = keyof typeof travelRequestServiceSchemas;
export const REQUESTABLE_SERVICES = Object.keys(
  travelRequestServiceSchemas,
) as RequestableService[];

export type TravelRequestServices = {
  [K in RequestableService]?: z.infer<(typeof travelRequestServiceSchemas)[K]>;
};

export type ParseTravelServicesResult =
  | { ok: true; requested: RequestableService[]; details: TravelRequestServices }
  | { ok: false; error: string };

/**
 * Valida os serviços pedidos. Só os blocos ativados são guardados; detalhes de
 * bloco desligado são descartados (o formulário pode enviar campos ocultos).
 */
export function parseTravelRequestServices(
  requested: readonly string[],
  details: Record<string, unknown>,
): ParseTravelServicesResult {
  const known = new Set<string>(REQUESTABLE_SERVICES);
  const unknown = requested.filter((r) => !known.has(r));
  if (unknown.length) return { ok: false, error: `Serviço desconhecido: ${unknown.join(", ")}.` };
  const unique = [...new Set(requested)] as RequestableService[];
  if (!unique.length) return { ok: false, error: "Escolha ao menos um serviço." };

  const out: TravelRequestServices = {};
  for (const key of unique) {
    const parsed = travelRequestServiceSchemas[key].safeParse(details[key] ?? {});
    if (!parsed.success) {
      return {
        ok: false,
        error: `Revise o bloco ${key}: ${parsed.error.issues[0]?.message ?? "dados inválidos"}.`,
      };
    }
    (out as Record<string, unknown>)[key] = parsed.data;
  }
  const hotel = out.HOTEL;
  if (hotel?.checkIn && hotel.checkOut && hotel.checkOut <= hotel.checkIn) {
    return { ok: false, error: "A saída do hotel precisa ser depois da entrada." };
  }
  return { ok: true, requested: unique, details: out };
}

/** Tipo resumido da solicitação, deduzido dos serviços (a ABIEC deduzia, não perguntava). */
export function deriveTravelRequestKind(
  requested: readonly RequestableService[],
): "AIR" | "HOTEL" | "PACKAGE" | "EVENT" | "OTHER" {
  const set = new Set(requested);
  if (set.has("EVENT_TICKET")) return "EVENT";
  const air = set.has("AIR");
  const hotel = set.has("HOTEL");
  if (air && hotel) return "PACKAGE";
  if (air) return "AIR";
  if (hotel) return "HOTEL";
  return "OTHER";
}
