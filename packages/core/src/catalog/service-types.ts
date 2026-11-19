import { z } from "zod";

/**
 * Catálogo de tipos de serviço turístico e de eventos.
 *
 * Espelha os enums `ServiceCategory` e `ServiceType` de catalog.prisma
 * (o teste `service-types.test.ts` garante que não divergem). Cada tipo
 * declara o schema dos `details` do `ServiceItem`: é aqui que se valida o
 * Json antes de gravar, em qualquer módulo.
 */

export const SERVICE_CATEGORIES = [
  "TRANSPORT",
  "LODGING",
  "DOCUMENTATION",
  "EXPERIENCE",
  "EVENT_PRODUCTION",
  "OTHER",
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  TRANSPORT: "Transporte",
  LODGING: "Hospedagem",
  DOCUMENTATION: "Documentação e proteção",
  EXPERIENCE: "Experiências",
  EVENT_PRODUCTION: "Eventos e feiras",
  OTHER: "Outros",
};

// ---------------------------------------------------------------------------
// Blocos reutilizáveis
// ---------------------------------------------------------------------------

const text = (max = 500) => z.string().trim().max(max);
const optText = (max = 500) => text(max).default("");
const isoDate = z.coerce.date();
const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3}$/, "Use o código IATA de 3 letras (ex.: GRU).");

export const CABIN_CLASSES = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"] as const;
export const CABIN_CLASS_LABELS: Record<(typeof CABIN_CLASSES)[number], string> = {
  ECONOMY: "Econômica",
  PREMIUM_ECONOMY: "Premium economy",
  BUSINESS: "Executiva",
  FIRST: "Primeira classe",
};

export const ROOM_TYPES = ["SINGLE", "DOUBLE", "TWIN", "TRIPLE", "QUAD", "SUITE", "OTHER"] as const;
export const ROOM_TYPE_LABELS: Record<(typeof ROOM_TYPES)[number], string> = {
  SINGLE: "Single",
  DOUBLE: "Duplo (casal)",
  TWIN: "Twin (duas camas)",
  TRIPLE: "Triplo",
  QUAD: "Quádruplo",
  SUITE: "Suíte",
  OTHER: "Outro",
};

export const MEAL_PLANS = ["ROOM_ONLY", "BREAKFAST", "HALF_BOARD", "FULL_BOARD", "ALL_INCLUSIVE"] as const;
export const MEAL_PLAN_LABELS: Record<(typeof MEAL_PLANS)[number], string> = {
  ROOM_ONLY: "Sem refeição",
  BREAKFAST: "Café da manhã",
  HALF_BOARD: "Meia pensão",
  FULL_BOARD: "Pensão completa",
  ALL_INCLUSIVE: "All inclusive",
};

const flightLeg = z.object({
  airlineCode: z.string().trim().toUpperCase().max(3).default(""),
  flightNumber: optText(10),
  origin: iata,
  destination: iata,
  departureAt: isoDate.optional(),
  arrivalAt: isoDate.optional(),
  cabin: z.enum(CABIN_CLASSES).default("ECONOMY"),
  fareBasis: optText(20),
});

// ---------------------------------------------------------------------------
// Schemas de detalhes por tipo
// ---------------------------------------------------------------------------

const airDetails = z.object({
  legs: z.array(flightLeg).min(1, "Informe ao menos um trecho."),
  baggage: optText(100), // "1 × 23 kg"
  fareRules: optText(2000),
  ticketingDeadline: isoDate.optional(),
});

const lodgingDetails = z.object({
  city: optText(120),
  checkIn: isoDate,
  checkOut: isoDate,
  rooms: z.number().int().min(1).default(1),
  roomType: z.enum(ROOM_TYPES).default("DOUBLE"),
  roomLabel: optText(120),
  stars: z.number().int().min(1).max(5).optional(),
  mealPlan: z.enum(MEAL_PLANS).default("BREAKFAST"),
  cancellationPolicy: optText(2000),
});

const groundDetails = z.object({
  pickup: optText(300),
  dropoff: optText(300),
  pickupAt: isoDate.optional(),
  vehicle: optText(120), // "Van executiva 15 lugares"
  passengers: z.number().int().min(1).optional(),
  flightReference: optText(20), // voo que o transfer acompanha
  driverName: optText(120),
  driverPhone: optText(30),
});

const carRentalDetails = z.object({
  company: optText(120),
  category: optText(60),
  pickupLocation: optText(300),
  pickupAt: isoDate.optional(),
  dropoffLocation: optText(300),
  dropoffAt: isoDate.optional(),
  extraDriver: z.boolean().default(false),
  insurance: optText(200),
});

const routeDetails = z.object({
  origin: optText(120),
  destination: optText(120),
  departureAt: isoDate.optional(),
  arrivalAt: isoDate.optional(),
  operator: optText(120),
  className: optText(60),
  cabinOrSeat: optText(60),
});

const insuranceDetails = z.object({
  insurer: optText(120),
  plan: optText(120),
  policyNumber: optText(60),
  coverageCents: z.number().int().nonnegative().optional(),
  coverageCurrency: z.string().length(3).default("USD"),
  startsAt: isoDate.optional(),
  endsAt: isoDate.optional(),
  emergencyPhone: optText(40),
});

const visaDetails = z.object({
  country: z.string().trim().toUpperCase().length(2, "Use o código do país (ex.: US)."),
  visaType: optText(60),
  appointmentAt: isoDate.optional(),
  consulate: optText(200),
  protocol: optText(60),
});

const passportDetails = z.object({
  appointmentAt: isoDate.optional(),
  location: optText(200),
  protocol: optText(60),
});

const currencyDetails = z.object({
  currency: z.string().trim().toUpperCase().length(3),
  amountCents: z.number().int().positive(),
  rate: z.number().positive().optional(),
  delivery: z.enum(["CASH", "PREPAID_CARD", "TRANSFER"]).default("PREPAID_CARD"),
});

const connectivityDetails = z.object({
  kind: z.enum(["ESIM", "PHYSICAL_SIM", "POCKET_WIFI"]).default("ESIM"),
  provider: optText(120),
  dataPlan: optText(120), // "10 GB · 15 dias"
  countries: z.array(z.string().length(2)).default([]),
});

const ticketDetails = z.object({
  eventName: text(200).min(1, "Informe o evento."),
  venue: optText(200),
  startsAt: isoDate.optional(),
  sector: optText(120),
  seats: optText(200),
  hospitalityPackage: optText(200), // "Paddock Club", "Courtside"
  deliveryMethod: z.enum(["E_TICKET", "MOBILE_APP", "WILL_CALL", "PHYSICAL"]).default("E_TICKET"),
});

const experienceDetails = z.object({
  meetingPoint: optText(300),
  startsAt: isoDate.optional(),
  durationMinutes: z.number().int().positive().optional(),
  language: optText(40),
  provider: optText(120),
  inclusions: optText(2000),
});

const diningDetails = z.object({
  restaurant: text(200).min(1, "Informe o restaurante."),
  reservationAt: isoDate.optional(),
  guests: z.number().int().min(1).optional(),
  menu: optText(2000),
  dietaryNotes: optText(1000),
});

const conciergeDetails = z.object({
  request: text(2000).min(1, "Descreva o pedido."),
  dueAt: isoDate.optional(),
});

const eventProductionDetails = z.object({
  scope: optText(4000), // escopo contratado
  quantity: z.number().int().positive().optional(),
  unit: optText(40), // "pessoa", "diária", "m²"
  deliveryAt: isoDate.optional(),
  location: optText(300),
  contactOnSite: optText(200),
});

const interpretationDetails = eventProductionDetails.extend({
  languages: z.array(z.string().min(2)).default([]),
  mode: z.enum(["SIMULTANEOUS", "CONSECUTIVE", "TRANSLATION"]).default("SIMULTANEOUS"),
});

const feeDetails = z.object({
  basis: z.enum(["FLAT", "PER_PAX", "PER_TRANSACTION", "PERCENT"]).default("FLAT"),
  percentBps: z.number().int().nonnegative().optional(),
});

const customDetails = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export type ServiceTypeDefinition = {
  label: string;
  category: ServiceCategory;
  /** Unidade de cobrança mais comum, usada nas regras de política e na cotação. */
  unit: "trecho" | "noite" | "diaria" | "pessoa" | "servico" | "unidade";
  details: z.ZodType;
};

const def = (
  label: string,
  category: ServiceCategory,
  unit: ServiceTypeDefinition["unit"],
  details: z.ZodType,
): ServiceTypeDefinition => ({ label, category, unit, details });

export const SERVICE_TYPES = {
  AIR: def("Aéreo", "TRANSPORT", "trecho", airDetails),
  AIR_CHARTER: def("Aéreo fretado", "TRANSPORT", "trecho", airDetails),
  BUS_CHARTER: def("Ônibus / fretamento", "TRANSPORT", "diaria", groundDetails),
  TRAIN: def("Trem", "TRANSPORT", "trecho", routeDetails),
  CRUISE: def("Cruzeiro", "TRANSPORT", "pessoa", routeDetails),
  TRANSFER: def("Transfer", "TRANSPORT", "servico", groundDetails),
  CAR_RENTAL: def("Locação de veículo", "TRANSPORT", "diaria", carRentalDetails),
  CHAUFFEUR: def("Motorista à disposição", "TRANSPORT", "diaria", groundDetails),
  EXECUTIVE_TRANSPORT: def("Transporte executivo", "TRANSPORT", "servico", groundDetails),
  HOTEL: def("Hotel", "LODGING", "noite", lodgingDetails),
  RESORT: def("Resort", "LODGING", "noite", lodgingDetails),
  VACATION_RENTAL: def("Apartamento / temporada", "LODGING", "noite", lodgingDetails),
  ROOM_BLOCK: def("Bloqueio de quartos", "LODGING", "noite", lodgingDetails),
  TRAVEL_INSURANCE: def("Seguro viagem", "DOCUMENTATION", "pessoa", insuranceDetails),
  VISA: def("Visto", "DOCUMENTATION", "pessoa", visaDetails),
  PASSPORT: def("Passaporte", "DOCUMENTATION", "pessoa", passportDetails),
  CURRENCY_EXCHANGE: def("Câmbio", "DOCUMENTATION", "servico", currencyDetails),
  CONNECTIVITY: def("Chip / eSIM internacional", "DOCUMENTATION", "pessoa", connectivityDetails),
  EVENT_TICKET: def("Ingresso de evento", "EXPERIENCE", "pessoa", ticketDetails),
  SPORTS_HOSPITALITY: def("Hospitalidade esportiva VIP", "EXPERIENCE", "pessoa", ticketDetails),
  TOUR: def("Passeio / tour", "EXPERIENCE", "pessoa", experienceDetails),
  GUIDE: def("Guia", "EXPERIENCE", "diaria", experienceDetails),
  DINING: def("Experiência gastronômica", "EXPERIENCE", "pessoa", diningDetails),
  CONCIERGE: def("Concierge", "EXPERIENCE", "servico", conciergeDetails),
  VENUE: def("Espaço / locação", "EVENT_PRODUCTION", "diaria", eventProductionDetails),
  FOOD_BEVERAGE: def("Alimentos e bebidas", "EVENT_PRODUCTION", "pessoa", eventProductionDetails),
  AUDIOVISUAL: def("Audiovisual", "EVENT_PRODUCTION", "diaria", eventProductionDetails),
  SCENOGRAPHY: def("Cenografia", "EVENT_PRODUCTION", "servico", eventProductionDetails),
  STAND_BUILD: def("Montagem de stand", "EVENT_PRODUCTION", "servico", eventProductionDetails),
  MERCHANDISE: def("Brindes", "EVENT_PRODUCTION", "unidade", eventProductionDetails),
  ACCREDITATION_SERVICE: def("Credenciamento", "EVENT_PRODUCTION", "servico", eventProductionDetails),
  EVENT_STAFF: def("Staff / recepção", "EVENT_PRODUCTION", "diaria", eventProductionDetails),
  INTERPRETATION: def("Tradução / intérprete", "EVENT_PRODUCTION", "diaria", interpretationDetails),
  BRAND_ACTIVATION: def("Ativação de marca", "EVENT_PRODUCTION", "servico", eventProductionDetails),
  EQUIPMENT_RENTAL: def("Aluguel de equipamentos", "OTHER", "diaria", eventProductionDetails),
  SERVICE_FEE: def("Taxa de serviço", "OTHER", "servico", feeDetails),
  CUSTOM: def("Item livre", "OTHER", "unidade", customDetails),
} as const satisfies Record<string, ServiceTypeDefinition>;

export type ServiceType = keyof typeof SERVICE_TYPES;
export const SERVICE_TYPE_KEYS = Object.keys(SERVICE_TYPES) as ServiceType[];

export type ServiceDetailsResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; issues: { path: string; message: string }[] };

/** Valida os `details` de um ServiceItem para o tipo informado. */
export function parseServiceDetails(type: ServiceType, input: unknown): ServiceDetailsResult {
  const parsed = SERVICE_TYPES[type].details.safeParse(input ?? {});
  if (parsed.success) return { ok: true, data: parsed.data as Record<string, unknown> };
  const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  return {
    ok: false,
    error: `Detalhes inválidos para ${SERVICE_TYPES[type].label}: ${issues[0]?.message ?? "verifique os campos."}`,
    issues,
  };
}

export function serviceTypesByCategory(): Record<ServiceCategory, ServiceType[]> {
  const out = Object.fromEntries(SERVICE_CATEGORIES.map((c) => [c, [] as ServiceType[]])) as Record<
    ServiceCategory,
    ServiceType[]
  >;
  for (const key of SERVICE_TYPE_KEYS) out[SERVICE_TYPES[key].category].push(key);
  return out;
}
