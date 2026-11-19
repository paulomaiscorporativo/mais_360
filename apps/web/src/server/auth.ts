import "server-only";
import { notFound as nextNotFound, redirect } from "next/navigation";
import { cache } from "react";
import type { PlatformRole, TenantRole, WorkspaceRole } from "@mais/db";
import { prisma } from "./db";
import { AppError, forbidden, notFound } from "./errors";
import { getSession } from "./session";

/**
 * Autorização em três níveis (ADR 0002):
 *   plataforma (SUPERADMIN/SUPPORT) → assinante (WorkspaceRole) → cliente (TenantRole)
 *
 * Herança: superadmin age como dono de qualquer assinante; dono/admin do
 * assinante age como ADMIN em qualquer cliente dele. Toda checagem acontece
 * no servidor (páginas, layouts e Server Actions).
 */

export const LOGIN_PATH = "/entrar";
export const CHANGE_PASSWORD_PATH = "/entrar/nova-senha";

export const loadViewer = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      workspaces: { include: { workspace: true }, orderBy: { createdAt: "asc" } },
      memberships: { include: { tenant: { include: { workspace: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!user || !user.active) return null;
  return {
    sessionId: session.id,
    user,
    isSuperadmin: user.platformRole === "SUPERADMIN",
    isPlatformStaff: user.platformRole === "SUPERADMIN" || user.platformRole === "SUPPORT",
  };
});

export type Viewer = NonNullable<Awaited<ReturnType<typeof loadViewer>>>;

/** Usuário autenticado; redireciona ao login (ou à troca obrigatória de senha). */
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}): Promise<Viewer> {
  const viewer = await loadViewer();
  if (!viewer) redirect(LOGIN_PATH);
  if (viewer.user.mustChangePassword && !opts.allowPasswordChange) redirect(CHANGE_PASSWORD_PATH);
  return viewer;
}

export async function requirePlatformRole(roles: PlatformRole[]): Promise<Viewer> {
  const viewer = await requireUser();
  if (!roles.includes(viewer.user.platformRole)) throw forbidden();
  return viewer;
}

const WORKSPACE_RANK: Record<WorkspaceRole, number> = { OWNER: 4, ADMIN: 3, FINANCE: 2, OPERATOR: 1 };

export async function requireWorkspace(slug: string, minRole: WorkspaceRole = "OPERATOR") {
  const viewer = await requireUser();
  const workspace = await prisma.workspace.findUnique({ where: { slug } });
  if (!workspace) throw notFound("Assinante não encontrado.");
  let role: WorkspaceRole | null = null;
  if (viewer.isSuperadmin) role = "OWNER";
  else if (viewer.user.platformRole === "SUPPORT") role = "ADMIN";
  else role = viewer.user.workspaces.find((w) => w.workspaceId === workspace.id)?.role ?? null;
  if (!role) throw notFound("Assinante não encontrado.");
  if (WORKSPACE_RANK[role] < WORKSPACE_RANK[minRole]) throw forbidden();
  return { viewer, workspace, role };
}

export type WorkspaceContext = Awaited<ReturnType<typeof requireWorkspace>>;

const TENANT_RANK: Record<TenantRole, number> = {
  ADMIN: 8,
  MANAGER: 7,
  APPROVER: 4,
  OPERATOR: 4,
  SALES: 3,
  DESK: 3,
  SCANNER: 2,
  VIEWER: 1,
};

export async function requireTenant(slug: string, minRole: TenantRole = "VIEWER") {
  const viewer = await requireUser();
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    include: { workspace: true, branding: true },
  });
  if (!tenant) throw notFound("Cliente não encontrado.");

  let role: TenantRole | null = null;
  if (viewer.isPlatformStaff) role = "ADMIN";
  else {
    const ws = viewer.user.workspaces.find((w) => w.workspaceId === tenant.workspaceId);
    if (ws && (ws.role === "OWNER" || ws.role === "ADMIN")) role = "ADMIN";
    else role = viewer.user.memberships.find((m) => m.tenantId === tenant.id)?.role ?? null;
  }
  if (!role) throw notFound("Cliente não encontrado.");
  if (TENANT_RANK[role] < TENANT_RANK[minRole]) throw forbidden();
  return { viewer, tenant, tenantId: tenant.id, workspace: tenant.workspace, role };
}

export type TenantContext = Awaited<ReturnType<typeof requireTenant>>;

/** Assinantes que o usuário enxerga (para o seletor do console). */
export async function visibleWorkspaces(viewer: Viewer) {
  if (viewer.isPlatformStaff) {
    return prisma.workspace.findMany({ orderBy: { name: "asc" } });
  }
  return viewer.user.workspaces.map((w) => w.workspace);
}

/** Destino padrão depois do login. */
export async function homePathFor(viewer: Viewer): Promise<string> {
  if (viewer.isPlatformStaff) return "/console/plataforma";
  const ws = viewer.user.workspaces[0]?.workspace;
  if (ws) return `/console/${ws.slug}`;
  const m = viewer.user.memberships[0];
  if (m) return `/console/${m.tenant.workspace.slug}/clientes/${m.tenant.slug}`;
  throw new AppError("Sua conta ainda não tem acesso a nenhum cliente. Fale com o administrador.", "FORBIDDEN");
}

/**
 * Para páginas e layouts: acesso negado ou inexistente vira 404 (não revela
 * a existência do recurso). Server Actions recebem o AppError via defineAction.
 */
export async function guard<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof AppError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) nextNotFound();
    throw err;
  }
}
