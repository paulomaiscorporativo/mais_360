/**
 * Tabelas de conversão de status em texto (legado) → enums da plataforma.
 * Fonte: docs/MAPEAMENTO-LEGADO.md, seção 1.
 *
 * `convert` nunca lança: valor desconhecido cai no padrão e volta com
 * `known: false`, para o relatório registrar a conversão com perda.
 */

export type Converted<T extends string> = { value: T; known: boolean; raw: string };

export function convert<T extends string>(
  table: Readonly<Record<string, T>>,
  raw: string | null | undefined,
  fallback: T,
): Converted<T> {
  const key = String(raw ?? "")
    .trim()
    .toUpperCase();
  const hit = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
  return hit !== undefined
    ? { value: hit, known: true, raw: key }
    : { value: fallback, known: key === "", raw: key };
}

export const USER_ROLE = {
  MASTER: "ADMIN",
  AGENTE: "OPERATOR",
  VISUALIZADOR: "VIEWER",
} as const;

export const PROJECT_TYPE = {
  VIAGEM: "INCENTIVE_TRIP",
  EVENTO: "CORPORATE_EVENT",
} as const;

export const PROJECT_STATUS = {
  PLANEJAMENTO: "PLANNING",
  INSCRICOES: "REGISTRATION_OPEN",
  EM_ANDAMENTO: "IN_PROGRESS",
  CONCLUIDA: "COMPLETED",
  ARQUIVADA: "ARCHIVED",
} as const;

export const PASSENGER_ROLE = {
  TITULAR: "TRAVELER",
  ACOMPANHANTE: "COMPANION",
} as const;

export const RSVP_STATUS = {
  PENDENTE: "PENDING",
  CONFIRMADO: "CONFIRMED",
  RECUSADO: "DECLINED",
  CANCELADO: "CANCELED",
} as const;

export const PERSON_DOCUMENT_KIND = {
  PASSAPORTE: "PASSPORT",
  RG: "RG",
  VISTO: "VISA",
  SEGURO: "INSURANCE",
  FOTO: "PHOTO",
  OUTRO: "OTHER",
} as const;

export const ACTOR_TYPE = {
  STAFF: "USER",
  PASSAGEIRO: "PERSON",
  ASSOCIADO: "PERSON",
  EMPRESA: "COMPANY",
  SISTEMA: "SYSTEM",
} as const;

export const FLIGHT_SCOPE = {
  NACIONAL: "DOMESTIC",
  INTERNACIONAL: "INTERNATIONAL",
} as const;

export const TASK_STATUS = {
  PENDENTE: "PENDING",
  EM_ANDAMENTO: "IN_PROGRESS",
  CONCLUIDO: "DONE",
  ATRASADO: "LATE",
  CANCELADO: "CANCELED",
} as const;

export const MURAL_TARGET = {
  TODOS: "ALL",
  GRUPO: "GROUP",
  INDIVIDUAL: "INDIVIDUAL",
} as const;

export const TICKET_STATUS = {
  NOVO: "NEW",
  EM_ATENDIMENTO: "IN_PROGRESS",
  RESPONDIDO: "ANSWERED",
  RESOLVIDO: "RESOLVED",
} as const;

export const TICKET_AUTHOR = {
  PASSAGEIRO: "PERSON",
  STAFF: "USER",
} as const;

export const PROJECT_DOCUMENT_CATEGORY = {
  GERAL: "GENERAL",
  VOUCHER: "VOUCHER",
  SEGURO: "INSURANCE",
  INGRESSO: "TICKET",
  OUTRO: "OTHER",
} as const;

export const TRAVEL_REQUEST_KIND = {
  AEREO: "AIR",
  HOTEL: "HOTEL",
  PACOTE: "PACKAGE",
  EVENTO: "EVENT",
  OUTRO: "OTHER",
} as const;

export const TRIP_TYPE = {
  SO_IDA: "ONE_WAY",
  IDA_VOLTA: "ROUND_TRIP",
  MULTITRECHO: "MULTI_CITY",
} as const;

export const TRAVEL_REQUEST_STATUS = {
  NOVO: "NEW",
  EM_ATENDIMENTO: "IN_PROGRESS",
  COTADO: "QUOTED",
  FECHADO: "BOOKED",
  CANCELADO: "CANCELED",
} as const;

export const CABIN_CLASS = {
  ECONOMICA: "ECONOMY",
  PREMIUM: "PREMIUM_ECONOMY",
  EXECUTIVA: "BUSINESS",
  PRIMEIRA: "FIRST",
} as const;

export const SEAT_PREFERENCE = {
  JANELA: "WINDOW",
  CORREDOR: "AISLE",
  INDIFERENTE: "ANY",
} as const;

export const HOTEL_STARS = {
  "3": "3",
  "4": "4",
  "5": "5",
  INDIFERENTE: "ANY",
} as const;

export const HOTEL_ROOM_TYPE = {
  SINGLE: "SINGLE",
  DUPLO: "DOUBLE",
  TWIN: "TWIN",
  SUITE: "SUITE",
} as const;

export const TIME_PREFERENCE = {
  MANHA: "MORNING",
  TARDE: "AFTERNOON",
  NOITE: "NIGHT",
  QUALQUER: "ANY",
} as const;

export const TRAVEL_PASSENGER_TYPE = {
  TITULAR: "HOLDER",
  ACOMPANHANTE: "COMPANION",
  COLABORADOR: "EMPLOYEE",
  CONVIDADO: "GUEST",
} as const;

export const TRAVEL_DOC_TYPE = {
  PASSAPORTE: "PASSPORT",
  RG: "RG",
  CPF: "CPF",
  OUTRO: "OTHER",
} as const;

export const INVITE_KIND = {
  RESPONSAVEL: "RESPONSIBLE",
  CONVIDADO: "COMPANY_GUEST",
  INDIVIDUAL: "INDIVIDUAL",
} as const;

export const INVITE_STATUS = {
  PENDENTE: "PENDING",
  ENVIADO: "INVITED",
  CONFIRMADO: "CONFIRMED",
  RECUSADO: "DECLINED",
  CREDENCIADO: "CONFIRMED",
  CANCELADO: "CANCELED",
} as const;

export const TABLE_SHAPE = {
  REDONDA: "ROUND",
  RETANGULAR: "RECTANGULAR",
} as const;

export const DELIVERY_STATUS = {
  ENVIADO: "SENT",
  SIMULADO: "SKIPPED",
  LINK_GERADO: "SKIPPED",
  ERRO: "FAILED",
} as const;

export const DELIVERY_CHANNEL = {
  EMAIL: "EMAIL",
  WHATSAPP: "WHATSAPP",
} as const;
