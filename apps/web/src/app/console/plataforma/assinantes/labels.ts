import {
  WORKSPACE_STATUS_ACTION_SPECS,
  WORKSPACE_STATUS_LABELS,
  type WorkspaceStatus,
  type WorkspaceStatusAction,
} from "@mais/core/workspaces";

export const STATUS_TONE: Record<
  WorkspaceStatus,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  TRIAL: "info",
  ACTIVE: "success",
  PAST_DUE: "warning",
  SUSPENDED: "danger",
  CANCELED: "neutral",
};

const FIELD_LABELS: Record<string, string> = {
  name: "nome",
  legalName: "razão social",
  document: "CNPJ",
  billingEmail: "e-mail de cobrança",
  whiteLabel: "marca própria",
};

type Entry = { action: string; data: unknown };

/** Frase do histórico para uma linha do AuditLog do assinante. */
export function describeAuditEntry(
  e: Entry,
  formatDate: (d: Date) => string,
): { title: string; detail?: string } {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  switch (e.action) {
    case "workspace.create":
      return {
        title: "Assinante criado",
        detail: str("plan") ? `Plano ${str("plan")}` : undefined,
      };
    case "workspace.update": {
      const changed = Array.isArray(d.changed) ? (d.changed as string[]) : [];
      return {
        title: "Dados alterados",
        detail: changed.map((k) => FIELD_LABELS[k] ?? k).join(", "),
      };
    }
    case "workspace.plan.change":
      return {
        title: "Plano alterado",
        detail: `${str("from") || "sem plano"} → ${str("to")}`,
      };
    case "workspace.trial.extend": {
      const to = str("to");
      return {
        title: `Teste estendido em ${String(d.days ?? "")} dias`,
        detail: to ? `Termina em ${formatDate(new Date(to))}` : undefined,
      };
    }
    case "workspace.status.change": {
      const action = str("action") as WorkspaceStatusAction;
      const to = str("to") as WorkspaceStatus;
      return {
        title: `${WORKSPACE_STATUS_ACTION_SPECS[action]?.label ?? "Situação alterada"} → ${WORKSPACE_STATUS_LABELS[to] ?? to}`,
        detail: str("reason") ? `Motivo: ${str("reason")}` : undefined,
      };
    }
    default:
      return { title: e.action };
  }
}
