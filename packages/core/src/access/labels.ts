import type { PlatformRoleKey, TenantRoleKey, WorkspaceRoleKey } from "./roles";

/** Rótulos e descrições dos papéis, para telas e e-mails. */
type RoleInfo = { label: string; description: string };

export const TENANT_ROLE_INFO: Record<TenantRoleKey, RoleInfo> = {
  ADMIN: { label: "Administrador", description: "Tudo do cliente, inclusive equipe e identidade." },
  MANAGER: { label: "Gestor", description: "Cria e opera projetos." },
  OPERATOR: { label: "Operador", description: "Opera os projetos atribuídos." },
  APPROVER: { label: "Aprovador", description: "Aprova solicitações de viagem." },
  DESK: { label: "Balcão", description: "Credenciamento e impressão no evento." },
  SCANNER: { label: "Leitor de acesso", description: "Registra entradas e saídas por área." },
  SALES: { label: "Vendas", description: "Reserva stands e cotas." },
  VIEWER: { label: "Visualizador", description: "Somente leitura." },
};

export const WORKSPACE_ROLE_INFO: Record<WorkspaceRoleKey, RoleInfo> = {
  OWNER: { label: "Dono", description: "Conta, assinatura e cobrança; tudo o que o admin faz." },
  ADMIN: {
    label: "Administrador",
    description: "Cria clientes, libera módulos e gerencia a equipe.",
  },
  OPERATOR: { label: "Operador", description: "Opera os clientes a que tiver vínculo." },
  FINANCE: { label: "Financeiro", description: "Área financeira do assinante." },
};

export const PLATFORM_ROLE_INFO: Record<Exclude<PlatformRoleKey, "NONE">, RoleInfo> = {
  SUPERADMIN: {
    label: "Superadmin",
    description: "Assinantes, planos, cobrança e a equipe da plataforma.",
  },
  SUPPORT: { label: "Suporte", description: "Acesso assistido aos assinantes, auditado." },
};
