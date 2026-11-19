import { z } from "zod";

/**
 * APROVAÇÃO POR ALÇADA. O fluxo é dado do cliente (ApprovalFlow + etapas
 * ApprovalStep); a solicitação ganha uma linha de TravelApproval por etapa
 * exigida. Nesta fase o console configura um nível só (aprovador do cliente),
 * mas a regra já trata vários níveis em sequência: a etapa N só fica
 * disponível depois que todas as anteriores aprovaram.
 */

export const APPROVAL_MODES = ["NEVER", "OUT_OF_POLICY", "ALWAYS"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];
export const APPROVAL_MODE_LABELS: Record<ApprovalMode, string> = {
  NEVER: "Sem aprovação",
  OUT_OF_POLICY: "Só fora da política",
  ALWAYS: "Sempre",
};
export const APPROVAL_MODE_HINTS: Record<ApprovalMode, string> = {
  NEVER: "A opção escolhida segue direto para a emissão. Fora da política só pede justificativa.",
  OUT_OF_POLICY: "Opções fora da política vão para o aprovador do cliente antes da emissão.",
  ALWAYS: "Toda opção escolhida passa pelo aprovador do cliente antes da emissão.",
};

export const approvalConditionsSchema = z
  .object({
    onlyOutOfPolicy: z.boolean().default(false),
    minAmountCents: z.number().int().nonnegative().nullable().default(null),
    scope: z.enum(["ANY", "DOMESTIC", "INTERNATIONAL"]).default("ANY"),
  })
  .catch({ onlyOutOfPolicy: false, minAmountCents: null, scope: "ANY" });

export type ApprovalConditions = z.output<typeof approvalConditionsSchema>;

export type ApprovalStepDef = {
  id: string;
  sortOrder: number;
  name: string;
  approverType: "USER" | "PERSON" | "COST_CENTER_MANAGER" | "TENANT_ROLE";
  approverUserId: string | null;
  approverPersonId: string | null;
  thresholdCents: number | null;
  onlyOutOfPolicy: boolean;
};

export type ApprovalFlowDef = {
  id: string;
  name: string;
  active: boolean;
  priority: number;
  conditions: unknown;
  steps: readonly ApprovalStepDef[];
};

export type ApprovalSubject = {
  outOfPolicy: boolean;
  totalCents: number;
  scope: "DOMESTIC" | "INTERNATIONAL";
};

function flowMatches(c: ApprovalConditions, s: ApprovalSubject) {
  if (c.onlyOutOfPolicy && !s.outOfPolicy) return false;
  if (c.minAmountCents !== null && s.totalCents < c.minAmountCents) return false;
  if (c.scope !== "ANY" && c.scope !== s.scope) return false;
  return true;
}

/**
 * Etapas exigidas para a opção escolhida, em ordem. Vazio = sem aprovação
 * (segue direto para a emissão). Usa o fluxo ativo de maior prioridade cujas
 * condições batem; dentro dele, filtra as etapas por alçada e por política.
 */
export function requiredApprovalSteps(
  flows: readonly ApprovalFlowDef[],
  subject: ApprovalSubject,
): { flowId: string; steps: ApprovalStepDef[] } | null {
  const flow = [...flows]
    .filter((f) => f.active && f.steps.length)
    .sort((a, b) => b.priority - a.priority)
    .find((f) => flowMatches(approvalConditionsSchema.parse(f.conditions ?? {}), subject));
  if (!flow) return null;
  const steps = [...flow.steps]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((st) => st.thresholdCents === null || subject.totalCents >= st.thresholdCents)
    .filter((st) => !st.onlyOutOfPolicy || subject.outOfPolicy);
  return steps.length ? { flowId: flow.id, steps } : null;
}

export type ApprovalDecision = "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
export type ApprovalRow = { id: string; sortOrder: number; decision: ApprovalDecision };

/** Resultado agregado: recusa em qualquer etapa encerra; aprovado quando todas aprovaram. */
export function approvalOutcome(rows: readonly ApprovalRow[]): "PENDING" | "APPROVED" | "REJECTED" {
  if (rows.some((r) => r.decision === "REJECTED")) return "REJECTED";
  if (rows.every((r) => r.decision === "APPROVED" || r.decision === "SKIPPED")) return "APPROVED";
  return "PENDING";
}

/** Etapa que pode ser decidida agora (a primeira pendente, em ordem). */
export function currentApproval<R extends ApprovalRow>(rows: readonly R[]): R | null {
  if (approvalOutcome(rows) !== "PENDING") return null;
  return (
    [...rows].sort((a, b) => a.sortOrder - b.sortOrder).find((r) => r.decision === "PENDING") ??
    null
  );
}

/** Lê o modo simples (tela desta fase) a partir dos fluxos gravados. */
export function approvalModeOf(flows: readonly ApprovalFlowDef[]): ApprovalMode {
  const flow = [...flows]
    .filter((f) => f.active && f.steps.length)
    .sort((a, b) => b.priority - a.priority)[0];
  if (!flow) return "NEVER";
  return approvalConditionsSchema.parse(flow.conditions ?? {}).onlyOutOfPolicy
    ? "OUT_OF_POLICY"
    : "ALWAYS";
}

/** Condições do fluxo para o modo escolhido na tela (o fluxo tem uma etapa TENANT_ROLE). */
export function conditionsForMode(mode: Exclude<ApprovalMode, "NEVER">): ApprovalConditions {
  return { onlyOutOfPolicy: mode === "OUT_OF_POLICY", minAmountCents: null, scope: "ANY" };
}

/**
 * Justificativa: exigida quando a opção está fora da política e a política
 * pede justificativa. Devolve a mensagem de erro, ou null quando está ok.
 */
export function justificationProblem(
  outOfPolicy: boolean,
  requireJustification: boolean,
  justification: string,
): string | null {
  if (!outOfPolicy || !requireJustification) return null;
  if (justification.trim().length < 10)
    return "Esta opção está fora da política: explique o motivo em pelo menos 10 caracteres.";
  return null;
}
