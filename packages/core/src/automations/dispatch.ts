/**
 * Quem pode disparar e como as chaves de idempotência são montadas.
 */

export type DispatchScope = {
  project: { archivedAt: Date | null; status: string };
  tenant: { status: string };
  workspace: { status: string };
};

export type DispatchBlock =
  "PROJECT_ARCHIVED" | "TENANT_INACTIVE" | "WORKSPACE_SUSPENDED" | "WORKSPACE_CANCELED";

export const DISPATCH_BLOCK_LABEL: Record<DispatchBlock, string> = {
  PROJECT_ARCHIVED: "O projeto está arquivado.",
  TENANT_INACTIVE: "O cliente está suspenso ou arquivado.",
  WORKSPACE_SUSPENDED: "O assinante está suspenso: as réguas ficam paradas até a reativação.",
  WORKSPACE_CANCELED: "O assinante foi cancelado.",
};

/**
 * O projeto pode disparar réguas agora?
 *
 * Assinante SUSPENSO não dispara: a suspensão deixa o console somente leitura
 * e mensagens automáticas são uso do serviço (e custo de envio). Quando for
 * reativado, as réguas voltam a valer dali em diante — o que passou durante a
 * suspensão não é enviado depois (anti-avalanche). Pagamento pendente
 * (PAST_DUE) e período de teste disparam normalmente.
 */
export function dispatchBlock(s: DispatchScope): DispatchBlock | null {
  if (s.project.archivedAt || s.project.status === "ARCHIVED") return "PROJECT_ARCHIVED";
  if (s.tenant.status !== "ACTIVE") return "TENANT_INACTIVE";
  if (s.workspace.status === "SUSPENDED") return "WORKSPACE_SUSPENDED";
  if (s.workspace.status === "CANCELED") return "WORKSPACE_CANCELED";
  return null;
}

/** Motivo do envio (entra na `dedupeKey` via `transactionalKey`). */
export const automationReason = (automationId: string) => `automation:${automationId}`;

/** Job de processamento de UMA ocorrência de régua por data. */
export const automationRunJobKey = (automationId: string, occurrenceKey: string) =>
  `automation:${automationId}:${occurrenceKey}`;

/** Job de UM acontecimento de uma inscrição. */
export const automationEventJobKey = (trigger: string, registrationId: string) =>
  `automation-event:${trigger}:${registrationId}`;
