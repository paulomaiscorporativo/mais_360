import "server-only";
import { activeTenantModules, MODULES, workspaceModules, type ModuleKey } from "@mais/core";
import { prisma } from "./db";
import type { Viewer } from "./auth";

export type NavTenant = {
  id: string;
  slug: string;
  name: string;
  color: string;
  modules: ModuleKey[];
};

export type NavWorkspace = {
  id: string;
  slug: string;
  name: string;
  role: string;
  tenants: NavTenant[];
};

export type NavData = {
  user: { name: string; email: string; isPlatformStaff: boolean; isSuperadmin: boolean };
  workspaces: NavWorkspace[];
};

/** Tudo que a barra lateral e a busca precisam, numa consulta por nível. */
export async function loadNav(viewer: Viewer): Promise<NavData> {
  const staff = viewer.isPlatformStaff;
  const wsRoles = new Map(viewer.user.workspaces.map((w) => [w.workspaceId, w.role]));
  const tenantIdsByMembership = new Set(viewer.user.memberships.map((m) => m.tenantId));

  const workspaces = await prisma.workspace.findMany({
    where: staff
      ? {}
      : {
          OR: [
            { id: { in: [...wsRoles.keys()] } },
            { tenants: { some: { id: { in: [...tenantIdsByMembership] } } } },
          ],
        },
    orderBy: { name: "asc" },
    include: {
      subscription: { include: { plan: true } },
      tenants: {
        where: { status: { not: "ARCHIVED" } },
        orderBy: { name: "asc" },
        include: { branding: true, modules: true },
      },
    },
  });

  return {
    user: {
      name: viewer.user.name,
      email: viewer.user.email,
      isPlatformStaff: staff,
      isSuperadmin: viewer.isSuperadmin,
    },
    workspaces: workspaces.map((ws) => {
      const role = staff ? "OWNER" : (wsRoles.get(ws.id) ?? "MEMBER");
      const seesAll = staff || role === "OWNER" || role === "ADMIN";
      const allowed =
        ws.subscription && ws.subscription.status !== "CANCELED"
          ? workspaceModules(ws.subscription.plan.modules, ws.subscription.extraModules)
          : new Set<ModuleKey>();
      return {
        id: ws.id,
        slug: ws.slug,
        name: ws.name,
        role,
        tenants: ws.tenants
          .filter((t) => seesAll || tenantIdsByMembership.has(t.id))
          .map((t) => ({
            id: t.id,
            slug: t.slug,
            name: t.name,
            color: t.branding?.primaryColor ?? "#002042",
            modules: [...activeTenantModules(t.modules, allowed)].sort(
              (a, b) => Object.keys(MODULES).indexOf(a) - Object.keys(MODULES).indexOf(b),
            ),
          })),
      };
    }),
  };
}
