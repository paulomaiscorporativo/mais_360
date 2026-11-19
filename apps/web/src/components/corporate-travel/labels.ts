import {
  BedDouble,
  Car,
  CarFront,
  FileBadge,
  Plane,
  Receipt,
  ShieldCheck,
  Smartphone,
  Ticket,
  Banknote,
  Bus,
  Shapes,
  type LucideIcon,
} from "lucide-react";

/** Serviços que o solicitante pode pedir (blocos de @mais/core/catalog). */
export const REQUEST_SERVICES = [
  "AIR",
  "HOTEL",
  "TRANSFER",
  "CAR_RENTAL",
  "CHAUFFEUR",
  "TRAVEL_INSURANCE",
  "CURRENCY_EXCHANGE",
  "VISA",
  "CONNECTIVITY",
  "EVENT_TICKET",
] as const;
export type RequestService = (typeof REQUEST_SERVICES)[number];

export const SERVICE_LABEL: Record<string, string> = {
  AIR: "Aéreo",
  HOTEL: "Hotel",
  TRANSFER: "Transfer",
  CAR_RENTAL: "Carro",
  CHAUFFEUR: "Motorista",
  TRAVEL_INSURANCE: "Seguro viagem",
  CURRENCY_EXCHANGE: "Câmbio",
  VISA: "Visto",
  CONNECTIVITY: "Chip / eSIM",
  EVENT_TICKET: "Ingresso",
  SERVICE_FEE: "Taxa de serviço",
  CUSTOM: "Outro",
};

export const SERVICE_ICON: Record<string, LucideIcon> = {
  AIR: Plane,
  HOTEL: BedDouble,
  TRANSFER: Bus,
  CAR_RENTAL: Car,
  CHAUFFEUR: CarFront,
  TRAVEL_INSURANCE: ShieldCheck,
  CURRENCY_EXCHANGE: Banknote,
  VISA: FileBadge,
  CONNECTIVITY: Smartphone,
  EVENT_TICKET: Ticket,
  SERVICE_FEE: Receipt,
  CUSTOM: Shapes,
};

export const serviceLabel = (t: string) => SERVICE_LABEL[t] ?? t;
