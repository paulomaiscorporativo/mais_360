import type { InviteStatus } from "@mais/core";

/** Rótulos e tons do status do convite (fonte: @mais/core/events). */
export const INVITE_STATUS_UI: Record<
  InviteStatus,
  { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" | "brand" }
> = {
  PENDING: { label: "Não enviado", tone: "neutral" },
  SENT: { label: "Enviado", tone: "info" },
  CONFIRMED: { label: "Confirmado", tone: "success" },
  DECLINED: { label: "Recusou", tone: "warning" },
  CHECKED_IN: { label: "Credenciado", tone: "brand" },
  CANCELED: { label: "Cancelado", tone: "danger" },
};

export const INVITE_KIND_LABEL = {
  RESPONSIBLE: "Responsável",
  COMPANY_GUEST: "Convidado da empresa",
  INDIVIDUAL: "Convite individual",
} as const;
