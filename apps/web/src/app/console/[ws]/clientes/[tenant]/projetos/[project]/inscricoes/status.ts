/** Rótulos e tons dos status de inscrição (compartilhado entre servidor e cliente). */
export type Status = "PENDING" | "INVITED" | "CONFIRMED" | "DECLINED" | "WAITLIST" | "CANCELED";

export const STATUS: Record<
  Status,
  { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }
> = {
  PENDING: { label: "Pendente", tone: "warning" },
  INVITED: { label: "Convidado", tone: "info" },
  CONFIRMED: { label: "Confirmado", tone: "success" },
  DECLINED: { label: "Recusou", tone: "neutral" },
  WAITLIST: { label: "Lista de espera", tone: "warning" },
  CANCELED: { label: "Cancelado", tone: "danger" },
};
