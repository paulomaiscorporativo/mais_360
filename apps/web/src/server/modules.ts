import "server-only";
import {
  activeTenantModules,
  type ModuleKey,
  workspaceModules,
} from "@mais/core";
import { prisma } from "./db";

/** Módulos que o assinante pode usar/revender: plano + add-ons (assinatura ativa ou em teste). */
export async function modulesForWorkspace(workspaceId: string): Promise<Set<ModuleKey>> {
  const sub = await prisma.subscription.findUnique({ where: { workspaceId }, include: { plan: true } });
  if (!sub || sub.status === "CANCELED") return new Set();
  return workspaceModules(sub.plan.modules, sub.extraModules);
}

/** Módulos ativos agora para o cliente (concedidos ∩ plano ∩ vigência ∩ dependências). */
export async function modulesForTenant(tenant: { id: string; workspaceId: string }): Promise<Set<ModuleKey>> {
  const [allowed, grants] = await Promise.all([
    modulesForWorkspace(tenant.workspaceId),
    prisma.tenantModule.findMany({ where: { tenantId: tenant.id } }),
  ]);
  return activeTenantModules(grants, allowed);
}
