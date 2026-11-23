/**
 * Regras de papéis e autoridade sobre a equipe (plataforma → assinante →
 * cliente → projeto). Funções puras: recebem o estado já carregado e devolvem
 * a decisão ou a mensagem de erro em português (null = permitido).
 */

export const PLATFORM_ROLES = ["NONE", "SUPERADMIN", "SUPPORT"] as const;
export type PlatformRoleKey = (typeof PLATFORM_ROLES)[number];

export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "OPERATOR", "FINANCE"] as const;
export type WorkspaceRoleKey = (typeof WORKSPACE_ROLES)[number];

export const TENANT_ROLES = [
  "ADMIN",
  "MANAGER",
  "APPROVER",
  "OPERATOR",
  "DESK",
  "SCANNER",
  "SALES",
  "VIEWER",
] as const;
export type TenantRoleKey = (typeof TENANT_ROLES)[number];

export const WORKSPACE_ROLE_RANK: Record<WorkspaceRoleKey, number> = {
  OWNER: 4,
  ADMIN: 3,
  FINANCE: 2,
  OPERATOR: 1,
};

export const TENANT_ROLE_RANK: Record<TenantRoleKey, number> = {
  ADMIN: 8,
  MANAGER: 7,
  APPROVER: 4,
  OPERATOR: 4,
  SALES: 3,
  DESK: 3,
  SCANNER: 2,
  VIEWER: 1,
};

export const tenantRoleAtLeast = (role: TenantRoleKey, min: TenantRoleKey) =>
  TENANT_ROLE_RANK[role] >= TENANT_ROLE_RANK[min];

export const workspaceRoleAtLeast = (role: WorkspaceRoleKey, min: WorkspaceRoleKey) =>
  WORKSPACE_ROLE_RANK[role] >= WORKSPACE_ROLE_RANK[min];

/** Gerencia a equipe do assinante (convidar, mudar papel, remover). */
export const managesWorkspaceTeam = (role: WorkspaceRoleKey) =>
  role === "OWNER" || role === "ADMIN";

// ---------------------------------------------------------------------------
// Equipe do assinante
// ---------------------------------------------------------------------------

export type WorkspaceTeamCounts = {
  /** Donos (OWNER) do assinante. */
  owners: number;
  /** Quem gerencia a equipe: OWNER + ADMIN. */
  managers: number;
};

/** Quem pode convidar alguém com este papel. */
export function workspaceInviteProblem(
  actorRole: WorkspaceRoleKey,
  role: WorkspaceRoleKey,
): string | null {
  if (!managesWorkspaceTeam(actorRole)) return "Só donos e administradores gerenciam a equipe.";
  if (role === "OWNER" && actorRole !== "OWNER")
    return "Só um dono pode convidar outro dono do assinante.";
  return null;
}

export function workspaceRoleChangeProblem(input: {
  actorRole: WorkspaceRoleKey;
  currentRole: WorkspaceRoleKey;
  nextRole: WorkspaceRoleKey;
  isSelf: boolean;
  counts: WorkspaceTeamCounts;
}): string | null {
  const { actorRole, currentRole, nextRole, isSelf, counts } = input;
  if (!managesWorkspaceTeam(actorRole)) return "Só donos e administradores gerenciam a equipe.";
  if (currentRole === nextRole) return null;
  if ((currentRole === "OWNER" || nextRole === "OWNER") && actorRole !== "OWNER")
    return "Só um dono pode mudar o papel de dono.";
  if (currentRole === "OWNER" && counts.owners <= 1)
    return "O assinante precisa de pelo menos um dono. Defina outro dono antes.";
  const losesManagement = managesWorkspaceTeam(currentRole) && !managesWorkspaceTeam(nextRole);
  if (isSelf && losesManagement && counts.managers <= 1)
    return "Você é o último administrador. Promova outra pessoa antes de mudar o seu papel.";
  return null;
}

export function workspaceRemovalProblem(input: {
  actorRole: WorkspaceRoleKey;
  targetRole: WorkspaceRoleKey;
  isSelf: boolean;
  counts: WorkspaceTeamCounts;
}): string | null {
  const { actorRole, targetRole, isSelf, counts } = input;
  if (!managesWorkspaceTeam(actorRole)) return "Só donos e administradores gerenciam a equipe.";
  if (isSelf) return "Você não pode remover o seu próprio acesso.";
  if (targetRole === "OWNER" && actorRole !== "OWNER") return "Só um dono pode remover outro dono.";
  if (targetRole === "OWNER" && counts.owners <= 1)
    return "O assinante precisa de pelo menos um dono.";
  return null;
}

// ---------------------------------------------------------------------------
// Equipe da plataforma
// ---------------------------------------------------------------------------

export function platformRoleChangeProblem(input: {
  currentRole: PlatformRoleKey;
  nextRole: PlatformRoleKey;
  isSelf: boolean;
  /** Superadmins ATIVOS hoje. */
  superadmins: number;
}): string | null {
  const { currentRole, nextRole, isSelf, superadmins } = input;
  if (currentRole === nextRole) return null;
  if (currentRole === "SUPERADMIN" && superadmins <= 1)
    return "A plataforma precisa de pelo menos um superadmin ativo.";
  if (isSelf && currentRole === "SUPERADMIN")
    return "Você não pode rebaixar o seu próprio acesso. Peça a outro superadmin.";
  return null;
}

// ---------------------------------------------------------------------------
// Autoridade para desativar a CONTA (User.active = false)
// ---------------------------------------------------------------------------

export type ActorAuthority = {
  superadmin: boolean;
  /** Suporte da plataforma: age como ADMIN em qualquer assinante (modo assistido). */
  support?: boolean;
  /** Papel do ator em cada assinante (workspaceId → papel). */
  workspaceRoles: Readonly<Record<string, WorkspaceRoleKey>>;
  /** Papel do ator em cada cliente em que tem vínculo direto (tenantId → papel). */
  tenantRoles: Readonly<Record<string, TenantRoleKey>>;
};

export type TargetLinks = {
  platformRole: PlatformRoleKey;
  workspaces: ReadonlyArray<{ workspaceId: string; role: WorkspaceRoleKey }>;
  tenants: ReadonlyArray<{ tenantId: string; workspaceId: string }>;
};

/** O ator administra o vínculo deste usuário com o assinante? */
export function administersWorkspaceLink(
  actor: ActorAuthority,
  link: { workspaceId: string; role: WorkspaceRoleKey },
): boolean {
  if (actor.superadmin) return true;
  const mine = actor.workspaceRoles[link.workspaceId] ?? (actor.support ? "ADMIN" : undefined);
  if (!mine || !managesWorkspaceTeam(mine)) return false;
  return link.role !== "OWNER" || mine === "OWNER";
}

/** O ator administra o vínculo deste usuário com o cliente? */
export function administersTenantLink(
  actor: ActorAuthority,
  link: { tenantId: string; workspaceId: string },
): boolean {
  if (actor.superadmin || actor.support) return true;
  const ws = actor.workspaceRoles[link.workspaceId];
  if (ws && managesWorkspaceTeam(ws)) return true;
  return actor.tenantRoles[link.tenantId] === "ADMIN";
}

/**
 * Desativar a conta inteira só é permitido a quem tem autoridade sobre TODOS
 * os vínculos do usuário. Caso contrário, o administrador só remove o vínculo
 * que administra (a pessoa continua com os outros acessos).
 */
export function canDeactivateUser(actor: ActorAuthority, target: TargetLinks): boolean {
  if (target.platformRole !== "NONE" && !actor.superadmin) return false;
  return (
    target.workspaces.every((w) => administersWorkspaceLink(actor, w)) &&
    target.tenants.every((t) => administersTenantLink(actor, t))
  );
}

// ---------------------------------------------------------------------------
// Acesso por projeto
// ---------------------------------------------------------------------------

/**
 * Papel efetivo de quem opera o cliente dentro de UM projeto, ou null se não
 * tem acesso a ele.
 *
 *  • papel herdado (plataforma/assinante) ou ADMIN do cliente → todos os projetos;
 *  • vínculo com `allProjects` → todos, com o papel do vínculo;
 *  • senão, só os projetos liberados (ProjectAccess), com o papel do projeto
 *    quando definido ou o do vínculo.
 */
export function resolveProjectRole(input: {
  tenantRole: TenantRoleKey;
  membership: { allProjects: boolean } | null;
  grant: { role: TenantRoleKey | null } | null;
}): TenantRoleKey | null {
  const { tenantRole, membership, grant } = input;
  if (tenantRole === "ADMIN" || !membership || membership.allProjects) return tenantRole;
  if (!grant) return null;
  return grant.role ?? tenantRole;
}
