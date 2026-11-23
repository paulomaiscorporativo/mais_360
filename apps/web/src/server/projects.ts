import "server-only";
import { randomInt } from "node:crypto";
import { cache } from "react";
import {
  availableProjectFeatures,
  enabledProjectFeatures,
  makeShortCode,
  makeToken,
  resolveProjectRole,
  tenantRoleAtLeast,
  type ModuleKey,
  type ProjectFeature,
} from "@mais/core";
import type { Prisma, TenantRole } from "@mais/db";
import { requireTenant, type TenantContext } from "./auth";
import { prisma } from "./db";
import { forbidden, notFound } from "./errors";
import { modulesForTenant } from "./modules";
import { tenantDb } from "./tenant-db";

/**
 * CONTRATO DOS PROJETOS (docs/CONTRATO-PROJETOS.md).
 *
 * Todo módulo de projeto (voos, convites, credenciamento…) entra por aqui:
 *   const p = await guard(requireProjectFeature(ws, tenant, project, "FLIGHTS"));
 * e usa `p.db` (escopado ao cliente) com `projectId: p.project.id`.
 */

export type ProjectContext = TenantContext & {
  project: Prisma.ProjectGetPayload<{ include: { features: true } }>;
  projectId: string;
  /** Módulos ativos do cliente agora. */
  modules: Set<ModuleKey>;
  /** Recursos que este projeto PODE ligar (dados os módulos do cliente). */
  available: Set<ProjectFeature>;
  /** Recursos ligados neste projeto (toggle ∩ disponível). */
  features: Set<ProjectFeature>;
  db: ReturnType<typeof tenantDb>;
  /** Pode editar o projeto (gestor ou acima, ou operador com acesso ao projeto). */
  canEdit: boolean;
};

const EDIT_ROLES = new Set<TenantRole>(["ADMIN", "MANAGER", "OPERATOR"]);

/**
 * Papel efetivo no projeto (null = sem acesso). Vínculo com `allProjects =
 * false` só alcança os projetos liberados em ProjectAccess, com o papel do
 * projeto quando definido (regra pura em @mais/core/access).
 */
export async function projectRoleFor(
  ctx: TenantContext,
  projectId: string,
): Promise<TenantRole | null> {
  const membership = ctx.viewer.user.memberships.find((m) => m.tenantId === ctx.tenantId) ?? null;
  const restricted = !!membership && !membership.allProjects && ctx.role !== "ADMIN";
  const grant = restricted
    ? await prisma.projectAccess.findUnique({
        where: { membershipId_projectId: { membershipId: membership.id, projectId } },
        select: { role: true },
      })
    : null;
  return resolveProjectRole({ tenantRole: ctx.role, membership, grant });
}

/** Filtro de listagem: só os projetos que o usuário alcança neste cliente. */
export async function visibleProjectsWhere(ctx: TenantContext): Promise<Prisma.ProjectWhereInput> {
  const membership = ctx.viewer.user.memberships.find((m) => m.tenantId === ctx.tenantId) ?? null;
  if (ctx.role === "ADMIN" || !membership || membership.allProjects) return {};
  const grants = await prisma.projectAccess.findMany({
    where: { membershipId: membership.id },
    select: { projectId: true },
  });
  return { id: { in: grants.map((g) => g.projectId) } };
}

/**
 * Exige papel mínimo NO PROJETO. Sem acesso ao projeto → "não encontrado"
 * (não revela que existe); com acesso mas papel insuficiente → sem permissão.
 */
export async function requireProjectRole(
  ctx: TenantContext,
  projectId: string,
  minRole: TenantRole,
): Promise<TenantRole> {
  const role = await projectRoleFor(ctx, projectId);
  if (!role) throw notFound("Projeto não encontrado.");
  if (!tenantRoleAtLeast(role, minRole)) throw forbidden();
  return role;
}

async function loadProject(
  tenantSlug: string,
  projectSlug: string,
  minRole: TenantRole,
): Promise<ProjectContext> {
  const ctx = await requireTenant(tenantSlug);
  const db = tenantDb(ctx);
  const project = await db.project.findFirst({
    where: { slug: projectSlug, archivedAt: null },
    include: { features: true },
  });
  if (!project) throw notFound("Projeto não encontrado.");
  const role = await requireProjectRole(ctx, project.id, minRole);

  const modules = await modulesForTenant(ctx.tenant);
  return {
    ...ctx,
    role,
    project,
    projectId: project.id,
    modules,
    available: availableProjectFeatures(modules),
    features: enabledProjectFeatures(project.features, modules),
    db,
    canEdit: EDIT_ROLES.has(role),
  };
}

/** Projeto do cliente com checagem de papel. Memoizado por requisição. */
export const requireProject = cache(
  (_ws: string, tenantSlug: string, projectSlug: string, minRole: TenantRole = "VIEWER") =>
    loadProject(tenantSlug, projectSlug, minRole),
);

/** Projeto + exige o recurso ligado (senão 404 em páginas, erro em actions). */
export async function requireProjectFeature(
  ws: string,
  tenantSlug: string,
  projectSlug: string,
  feature: ProjectFeature,
  minRole: TenantRole = "VIEWER",
): Promise<ProjectContext> {
  const p = await requireProject(ws, tenantSlug, projectSlug, minRole);
  if (!p.features.has(feature)) throw notFound("Este recurso não está ligado no projeto.");
  return p;
}

/** Para Server Actions: projeto por id (dentro do cliente) com permissão de edição. */
export async function requireProjectWriter(tenantSlug: string, projectId: string) {
  const ctx = await requireTenant(tenantSlug);
  const db = tenantDb(ctx);
  const project = await db.project.findFirst({
    where: { id: projectId, archivedAt: null },
    include: { features: true },
  });
  if (!project) throw notFound("Projeto não encontrado.");
  const role = await requireProjectRole(ctx, project.id, "VIEWER");
  if (!EDIT_ROLES.has(role)) throw forbidden();
  const modules = await modulesForTenant(ctx.tenant);
  return {
    ...ctx,
    role,
    project,
    projectId: project.id,
    db,
    modules,
    available: availableProjectFeatures(modules),
    features: enabledProjectFeatures(project.features, modules),
  };
}

export function projectBase(ws: string, tenantSlug: string, projectSlug: string) {
  return `/console/${ws}/clientes/${tenantSlug}/projetos/${projectSlug}`;
}

// ---------------------------------------------------------------------------
// Códigos públicos da inscrição
// ---------------------------------------------------------------------------

const rand = (max: number) => randomInt(max);

export function newRegistrationToken() {
  return makeToken(rand);
}

/** Gera shortCodes únicos no projeto (consulta os existentes uma vez por lote). */
export async function shortCodeAllocator(
  db: {
    registration: {
      findMany: (a: {
        where: { projectId: string };
        select: { shortCode: true };
      }) => Promise<{ shortCode: string }[]>;
    };
  },
  projectId: string,
) {
  const taken = new Set(
    (await db.registration.findMany({ where: { projectId }, select: { shortCode: true } })).map(
      (r) => r.shortCode,
    ),
  );
  return () => {
    const code = makeShortCode(rand, (c) => taken.has(c));
    taken.add(code);
    return code;
  };
}
