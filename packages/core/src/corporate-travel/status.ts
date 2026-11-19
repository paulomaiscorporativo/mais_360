/**
 * Ciclo de vida da solicitação de viagem corporativa (antiga "linha direta"):
 *
 *   NEW → IN_PROGRESS → QUOTED → (escolha) → AWAITING_APPROVAL → APPROVED → BOOKED
 *                                         ↘ (sem alçada) ─────────↗
 *   AWAITING_APPROVAL → REJECTED → (nova escolha ou nova cotação) → …
 *   qualquer etapa antes de BOOKED → CANCELED
 *
 * A reserva é manual: BOOKED significa que a equipe emitiu fora (e lançou no
 * Travellink) e registrou os localizadores aqui.
 */

export const TRAVEL_REQUEST_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "QUOTED",
  "AWAITING_APPROVAL",
  "APPROVED",
  "BOOKED",
  "REJECTED",
  "CANCELED",
] as const;

export type TravelRequestStatus = (typeof TRAVEL_REQUEST_STATUSES)[number];

/** Rótulos da equipe (console). */
export const TRAVEL_STATUS_LABELS: Record<TravelRequestStatus, string> = {
  NEW: "Nova",
  IN_PROGRESS: "Em atendimento",
  QUOTED: "Cotada",
  AWAITING_APPROVAL: "Aguardando aprovação",
  APPROVED: "Aprovada",
  BOOKED: "Reservada",
  REJECTED: "Recusada",
  CANCELED: "Cancelada",
};

/** Rótulos de quem pediu (área do associado): dizem o que acontece agora. */
export const TRAVEL_STATUS_MEMBER_LABELS: Record<TravelRequestStatus, string> = {
  NEW: "Recebida",
  IN_PROGRESS: "Em cotação",
  QUOTED: "Opções disponíveis",
  AWAITING_APPROVAL: "Aguardando aprovação",
  APPROVED: "Aprovada, em emissão",
  BOOKED: "Reservada",
  REJECTED: "Não aprovada",
  CANCELED: "Cancelada",
};

export type StatusTone = "neutral" | "brand" | "info" | "warning" | "success" | "danger";

export const TRAVEL_STATUS_TONES: Record<TravelRequestStatus, StatusTone> = {
  NEW: "brand",
  IN_PROGRESS: "info",
  QUOTED: "info",
  AWAITING_APPROVAL: "warning",
  APPROVED: "success",
  BOOKED: "success",
  REJECTED: "danger",
  CANCELED: "neutral",
};

/** Em aberto na fila de atendimento (precisa de alguém da equipe ou do solicitante). */
export const OPEN_TRAVEL_STATUSES: readonly TravelRequestStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "QUOTED",
  "AWAITING_APPROVAL",
  "APPROVED",
  "REJECTED",
];

export const isFinalStatus = (s: TravelRequestStatus) => s === "BOOKED" || s === "CANCELED";

/** O solicitante só altera antes de alguém assumir (o atendente cota com base no recebido). */
export const canRequesterEdit = (s: TravelRequestStatus) => s === "NEW";

/** O solicitante pode desistir enquanto nada foi emitido. */
export const canRequesterCancel = (s: TravelRequestStatus) => !isFinalStatus(s);

/** Escolha de opção: com cotações enviadas, ou depois de uma recusa (escolher outra). */
export const canChooseQuote = (s: TravelRequestStatus) => s === "QUOTED" || s === "REJECTED";

/** A equipe pode montar e enviar cotações até a escolha seguir para aprovação/emissão. */
export const canStaffQuote = (s: TravelRequestStatus) =>
  s === "NEW" || s === "IN_PROGRESS" || s === "QUOTED" || s === "REJECTED";

/** Reserva manual: só depois de aprovada (ou dispensada a aprovação). */
export const canBook = (s: TravelRequestStatus) => s === "APPROVED";

export const canStaffCancel = (s: TravelRequestStatus) => !isFinalStatus(s);

/** Quem assume a solicitação a tira de NEW. */
export function statusAfterAssign(s: TravelRequestStatus): TravelRequestStatus {
  return s === "NEW" ? "IN_PROGRESS" : s;
}

/** Cotações visíveis ao solicitante: a partir do envio. */
export function quotesVisibleToRequester(s: TravelRequestStatus): boolean {
  return s !== "NEW" && s !== "IN_PROGRESS" && s !== "CANCELED";
}
