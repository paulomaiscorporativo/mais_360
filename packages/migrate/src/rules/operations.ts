import { foldText, parseTravelRequestServices, type RequestableService } from "@mais/core";
import { formatProtocol, protocolSeq } from "@mais/core/corporate-travel";
import { CABIN_CLASS, HOTEL_ROOM_TYPE, HOTEL_STARS, SEAT_PREFERENCE, convert } from "./status";

// ---------------------------------------------------------------------------
// Hospedagem: AccommodationPassenger → Room + RoomOccupant
// ---------------------------------------------------------------------------

export type RoomType = "SINGLE" | "DOUBLE" | "TWIN" | "TRIPLE" | "QUAD" | "SUITE" | "OTHER";

export type LegacyRoomRow = {
  passengerId: string;
  roomNumber: string;
  roomType: string;
};

export type PlannedRoom = {
  /** Chave estável do quarto dentro do hotel: "n:<número>" ou "p:<passageiro>" */
  key: string;
  number: string;
  type: RoomType;
  typeLabel: string;
  passengerIds: string[];
  /** Tipos diferentes informados para o mesmo número de quarto */
  conflictingLabels: string[];
};

const ROOM_LABELS: readonly [RegExp, RoomType][] = [
  [/^(sgl|single|individual|solteiro)$/, "SINGLE"],
  [/^(dbl|double|duplo|casal|dbl casal|queen|king)$/, "DOUBLE"],
  [/^(twn|twin|dbl twin|duplo twin|duas camas)$/, "TWIN"],
  [/^(tpl|trp|triple|triplo)$/, "TRIPLE"],
  [/^(qdp|qpl|quad|quadruplo)$/, "QUAD"],
  [/^(suite|ste)$/, "SUITE"],
];

const BY_SIZE: Record<number, RoomType> = { 1: "SINGLE", 2: "DOUBLE", 3: "TRIPLE", 4: "QUAD" };

/** Texto livre do legado ("DBL", "Duplo", "Suíte") → tipo, quando reconhecível. */
export function roomTypeFromLabel(label: string, occupants: number): RoomType {
  const f = foldText(label).replace(/[^a-z ]/g, "");
  if (f) {
    for (const [re, type] of ROOM_LABELS) if (re.test(f)) return type;
    return "OTHER";
  }
  return BY_SIZE[occupants] ?? "OTHER";
}

/**
 * Agrupa os passageiros por (hotel, número do quarto). Sem número, cada
 * passageiro ganha um quarto próprio — o operador junta depois na tela.
 */
export function planRooms(rows: readonly LegacyRoomRow[]): PlannedRoom[] {
  const rooms = new Map<string, PlannedRoom>();
  for (const r of rows) {
    const number = r.roomNumber.trim();
    const key = number ? `n:${foldText(number)}` : `p:${r.passengerId}`;
    const label = r.roomType.trim();
    const room = rooms.get(key);
    if (room) {
      room.passengerIds.push(r.passengerId);
      if (label && !room.typeLabel) room.typeLabel = label;
      else if (label && foldText(label) !== foldText(room.typeLabel))
        room.conflictingLabels.push(label);
    } else {
      rooms.set(key, {
        key,
        number,
        type: "OTHER",
        typeLabel: label,
        passengerIds: [r.passengerId],
        conflictingLabels: [],
      });
    }
  }
  for (const room of rooms.values())
    room.type = roomTypeFromLabel(room.typeLabel, room.passengerIds.length);
  return [...rooms.values()];
}

// ---------------------------------------------------------------------------
// Linha direta: protocolo e blocos de serviço
// ---------------------------------------------------------------------------

/** Protocolo "VC-2026-000123": mesmo formato das telas (regra única no core). */
export { formatProtocol };

/** Próximo número livre do ano, considerando os protocolos já existentes. */
export function nextProtocolSeq(year: number, taken: Iterable<string>): number {
  let max = 0;
  for (const p of taken) max = Math.max(max, protocolSeq(p, year) ?? 0);
  return max + 1;
}

export type LegacyTravelServices = {
  needsFlight: boolean;
  cabinClass: string;
  preferredAirline: string;
  checkedBaggage: boolean;
  seatPreference: string;
  loyaltyProgram: string;
  needsHotel: boolean;
  hotelCity: string;
  hotelCheckIn: Date | null;
  hotelCheckOut: Date | null;
  hotelCategory: string;
  hotelRooms: number;
  hotelRoomType: string;
  hotelChain: string;
  hotelBreakfast: boolean;
  hotelReference: string;
  needsTransfer: boolean;
  needsCarRental: boolean;
  carCategory: string;
  carPickup: string;
  carDropoff: string;
  carExtraDriver: boolean;
  needsChauffeur: boolean;
  transferNotes: string;
  needsInsurance: boolean;
  needsCurrency: boolean;
  currencyNotes: string;
  needsVisa: boolean;
  visaNotes: string;
  needsConnectivity: boolean;
  needsEventTicket: boolean;
  eventName: string;
};

export type ConvertedServices = {
  requested: RequestableService[];
  details: Record<string, unknown>;
  /** Valores de enum não reconhecidos (conversão com perda) */
  unknownValues: string[];
};

/**
 * Flags `needs*` + campos soltos → `requestedServices` + `serviceDetails`,
 * validados pelo mesmo esquema da linha direta nova.
 */
export function convertTravelServices(r: LegacyTravelServices): ConvertedServices {
  const unknownValues: string[] = [];
  const pick = <T extends string>(
    table: Readonly<Record<string, T>>,
    raw: string,
    fallback: T,
    what: string,
  ): T => {
    const c = convert(table, raw, fallback);
    if (!c.known) unknownValues.push(`${what}: ${c.raw}`);
    return c.value;
  };

  const requested: RequestableService[] = [];
  const details: Record<string, unknown> = {};
  if (r.needsFlight) {
    requested.push("AIR");
    details.AIR = {
      cabin: pick(CABIN_CLASS, r.cabinClass, "ECONOMY", "classe"),
      preferredAirline: r.preferredAirline,
      checkedBaggage: r.checkedBaggage,
      seatPreference: pick(SEAT_PREFERENCE, r.seatPreference, "ANY", "assento"),
      loyaltyProgram: r.loyaltyProgram,
    };
  }
  if (r.needsHotel) {
    requested.push("HOTEL");
    details.HOTEL = {
      city: r.hotelCity,
      checkIn: r.hotelCheckIn ?? undefined,
      checkOut: r.hotelCheckOut ?? undefined,
      stars: pick(HOTEL_STARS, r.hotelCategory, "ANY", "categoria do hotel"),
      rooms: Math.min(50, Math.max(1, r.hotelRooms || 1)),
      roomType: pick(HOTEL_ROOM_TYPE, r.hotelRoomType, "DOUBLE", "tipo de quarto"),
      chain: r.hotelChain,
      breakfast: r.hotelBreakfast,
      reference: r.hotelReference,
    };
  }
  // As observações de traslado vão para o bloco TRANSFER (ou CHAUFFEUR se só ele foi pedido)
  const transferToChauffeur = !r.needsTransfer && r.needsChauffeur;
  if (r.needsTransfer) {
    requested.push("TRANSFER");
    details.TRANSFER = { notes: r.transferNotes };
  }
  if (r.needsCarRental) {
    requested.push("CAR_RENTAL");
    details.CAR_RENTAL = {
      category: r.carCategory,
      pickup: r.carPickup,
      dropoff: r.carDropoff,
      extraDriver: r.carExtraDriver,
    };
  }
  if (r.needsChauffeur) {
    requested.push("CHAUFFEUR");
    details.CHAUFFEUR = { notes: transferToChauffeur ? r.transferNotes : "" };
  }
  if (r.needsInsurance) {
    requested.push("TRAVEL_INSURANCE");
    details.TRAVEL_INSURANCE = { notes: "" };
  }
  if (r.needsCurrency) {
    requested.push("CURRENCY_EXCHANGE");
    details.CURRENCY_EXCHANGE = { notes: r.currencyNotes };
  }
  if (r.needsVisa) {
    requested.push("VISA");
    details.VISA = { notes: r.visaNotes };
  }
  if (r.needsConnectivity) {
    requested.push("CONNECTIVITY");
    details.CONNECTIVITY = { notes: "" };
  }
  if (r.needsEventTicket) {
    requested.push("EVENT_TICKET");
    details.EVENT_TICKET = { eventName: r.eventName };
  }
  if (!requested.length) return { requested, details: {}, unknownValues };

  const parsed = parseTravelRequestServices(requested, details);
  if (!parsed.ok) {
    // Dado fora dos limites do esquema novo: guarda o bruto, sem perder nada
    unknownValues.push(parsed.error);
    return { requested, details, unknownValues };
  }
  return { requested: parsed.requested, details: parsed.details, unknownValues };
}

// ---------------------------------------------------------------------------
// Mensagens de convite: {{placeholders}} do legado → catálogo novo
// ---------------------------------------------------------------------------

export const PLACEHOLDER_MAP: Readonly<Record<string, string>> = {
  nome: "nome",
  evento: "projeto",
  data: "data_inicio",
  hora: "hora_inicio",
  local: "local",
  endereco: "endereco",
  traje: "traje",
  mesa: "mesa",
  link: "link_cracha",
  codigo: "codigo",
};

/** Converte os campos do modelo; campos sem equivalente ficam como estão e são listados. */
export function convertPlaceholders(template: string): { text: string; unknown: string[] } {
  const unknown: string[] = [];
  const text = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => {
    const mapped = PLACEHOLDER_MAP[key];
    if (mapped) return `{{${mapped}}}`;
    unknown.push(key);
    return whole;
  });
  return { text, unknown: [...new Set(unknown)] };
}
