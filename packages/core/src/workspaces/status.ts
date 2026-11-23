/**
 * SITUAÇÃO DO ASSINANTE (Workspace.status) — regras puras.
 *
 * Quem muda a situação é a equipe da plataforma (SUPERADMIN), sempre com motivo.
 * O efeito no console do assinante é decidido aqui e aplicado no servidor:
 *
 *   TRIAL / ACTIVE  → acesso completo
 *   PAST_DUE        → acesso completo, com faixa de aviso
 *   SUSPENDED       → somente leitura e exportação, com faixa de aviso
 *   CANCELED        → sem acesso ao console
 *
 * As áreas públicas dos clientes seguem o ADR 0004.
 */

export const WORKSPACE_STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED"] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

export const WORKSPACE_STATUS_LABELS: Record<WorkspaceStatus, string> = {
  TRIAL: "Em teste",
  ACTIVE: "Ativo",
  PAST_DUE: "Pagamento pendente",
  SUSPENDED: "Suspenso",
  CANCELED: "Cancelado",
};

// ---------------------------------------------------------------------------
// Transições
// ---------------------------------------------------------------------------

export const WORKSPACE_STATUS_ACTIONS = [
  "ACTIVATE",
  "MARK_PAST_DUE",
  "SUSPEND",
  "REACTIVATE",
  "CANCEL",
] as const;
export type WorkspaceStatusAction = (typeof WORKSPACE_STATUS_ACTIONS)[number];

type ActionSpec = {
  from: readonly WorkspaceStatus[];
  to: WorkspaceStatus;
  label: string;
  /** Explica a consequência para quem confirma. */
  effect: string;
  destructive: boolean;
};

export const WORKSPACE_STATUS_ACTION_SPECS: Record<WorkspaceStatusAction, ActionSpec> = {
  ACTIVATE: {
    from: ["TRIAL", "PAST_DUE"],
    to: "ACTIVE",
    label: "Ativar",
    effect: "A assinatura passa a valer como contratada e os avisos somem do console.",
    destructive: false,
  },
  MARK_PAST_DUE: {
    from: ["TRIAL", "ACTIVE"],
    to: "PAST_DUE",
    label: "Marcar pagamento pendente",
    effect: "O acesso continua normal, mas o console do assinante mostra um aviso de pagamento.",
    destructive: false,
  },
  SUSPEND: {
    from: ["TRIAL", "ACTIVE", "PAST_DUE"],
    to: "SUSPENDED",
    label: "Suspender",
    effect:
      "O console do assinante fica somente leitura: dá para consultar e exportar, mas nada pode ser criado ou alterado. As páginas públicas dos clientes continuam no ar.",
    destructive: true,
  },
  REACTIVATE: {
    from: ["SUSPENDED", "CANCELED"],
    to: "ACTIVE",
    label: "Reativar",
    effect: "O console volta a funcionar normalmente para toda a equipe do assinante.",
    destructive: false,
  },
  CANCEL: {
    from: ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"],
    to: "CANCELED",
    label: "Cancelar assinatura",
    effect:
      "Ninguém do assinante consegue mais entrar no console e as páginas públicas dos clientes saem do ar. Os dados ficam guardados e podem voltar com a reativação.",
    destructive: true,
  },
};

/** Ações possíveis a partir da situação atual, na ordem de exibição. */
export function availableStatusActions(current: WorkspaceStatus): WorkspaceStatusAction[] {
  return WORKSPACE_STATUS_ACTIONS.filter((a) =>
    WORKSPACE_STATUS_ACTION_SPECS[a].from.includes(current),
  );
}

export const MIN_STATUS_REASON = 5;
export const MAX_STATUS_REASON = 500;

export type StatusTransition =
  | { ok: true; from: WorkspaceStatus; to: WorkspaceStatus; reason: string }
  | { ok: false; error: string };

/** Valida a mudança de situação (motivo obrigatório; transição permitida). */
export function planStatusTransition(
  current: WorkspaceStatus,
  action: WorkspaceStatusAction,
  reason: string,
): StatusTransition {
  const spec = WORKSPACE_STATUS_ACTION_SPECS[action];
  const text = reason.trim().replace(/\s+/g, " ");
  if (text.length < MIN_STATUS_REASON)
    return { ok: false, error: "Explique o motivo da mudança (pelo menos 5 caracteres)." };
  if (text.length > MAX_STATUS_REASON)
    return { ok: false, error: `Use no máximo ${MAX_STATUS_REASON} caracteres no motivo.` };
  if (!spec.from.includes(current)) {
    return {
      ok: false,
      error: `Não é possível "${spec.label.toLowerCase()}" um assinante ${WORKSPACE_STATUS_LABELS[current].toLowerCase()}.`,
    };
  }
  return { ok: true, from: current, to: spec.to, reason: text };
}

/** Situação da assinatura (Subscription.status) que acompanha a do assinante. */
export function subscriptionStatusFor(
  status: WorkspaceStatus,
): "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | null {
  switch (status) {
    case "TRIAL":
      return "TRIALING";
    case "ACTIVE":
      return "ACTIVE";
    case "PAST_DUE":
      return "PAST_DUE";
    case "CANCELED":
      return "CANCELED";
    case "SUSPENDED":
      return null; // mantém a da assinatura (a suspensão pode não ser por pagamento)
  }
}

// ---------------------------------------------------------------------------
// Efeito no console
// ---------------------------------------------------------------------------

export type ConsoleAccess = "full" | "readonly" | "blocked";

export function consoleAccess(status: WorkspaceStatus): ConsoleAccess {
  if (status === "SUSPENDED") return "readonly";
  if (status === "CANCELED") return "blocked";
  return "full";
}

/** A situação permite gravar dados pelo console? */
export const canWrite = (status: WorkspaceStatus) => consoleAccess(status) === "full";

export type StatusBanner = {
  tone: "info" | "warning" | "danger";
  title: string;
  message: string;
};

const DAY = 86_400_000;

/** Faixa de aviso no console do assinante (null = nenhuma). */
export function statusBanner(
  ws: { name: string; status: WorkspaceStatus; trialEndsAt: Date | null },
  now = new Date(),
): StatusBanner | null {
  switch (ws.status) {
    case "PAST_DUE":
      return {
        tone: "warning",
        title: "Pagamento pendente",
        message: `Há uma pendência na assinatura de ${ws.name}. O acesso continua normal; regularize para evitar a suspensão.`,
      };
    case "SUSPENDED":
      return {
        tone: "danger",
        title: "Assinatura suspensa — console somente leitura",
        message:
          "Você pode consultar e exportar dados, mas não criar nem alterar nada. As páginas públicas dos clientes continuam no ar. Fale com o suporte da plataforma para reativar.",
      };
    case "TRIAL": {
      if (!ws.trialEndsAt) return null;
      const days = Math.ceil((ws.trialEndsAt.getTime() - now.getTime()) / DAY);
      if (days > 7) return null;
      return {
        tone: "info",
        title: days <= 0 ? "O período de teste terminou" : "Período de teste perto do fim",
        message:
          days <= 0
            ? "Fale com o suporte da plataforma para contratar e continuar usando a plataforma."
            : `${days === 1 ? "Falta 1 dia" : `Faltam ${days} dias`} de teste. Fale com o suporte da plataforma para contratar.`,
      };
    }
    default:
      return null;
  }
}

/** Mensagem devolvida às ações recusadas por suspensão. */
export const SUSPENDED_WRITE_ERROR =
  "A assinatura está suspensa: o console está em modo somente leitura. Fale com o suporte da plataforma para reativar.";

/** Mensagem para quem tenta entrar num assinante cancelado. */
export const CANCELED_ACCESS_ERROR =
  "A assinatura foi cancelada e o console não está mais disponível. Fale com o suporte da plataforma se precisar dos dados.";

// ---------------------------------------------------------------------------
// Período de teste
// ---------------------------------------------------------------------------

export const MAX_TRIAL_EXTENSION_DAYS = 90;

/**
 * Estende o teste: soma os dias ao fim atual (ou a hoje, se já passou).
 * Só vale para assinantes em teste.
 */
export function extendTrial(
  ws: { status: WorkspaceStatus; trialEndsAt: Date | null },
  days: number,
  now = new Date(),
): { ok: true; trialEndsAt: Date } | { ok: false; error: string } {
  if (ws.status !== "TRIAL")
    return { ok: false, error: "Só dá para estender o teste de um assinante em teste." };
  if (!Number.isInteger(days) || days < 1 || days > MAX_TRIAL_EXTENSION_DAYS)
    return { ok: false, error: `Informe de 1 a ${MAX_TRIAL_EXTENSION_DAYS} dias.` };
  const base = Math.max(ws.trialEndsAt?.getTime() ?? 0, now.getTime());
  return { ok: true, trialEndsAt: new Date(base + days * DAY) };
}
