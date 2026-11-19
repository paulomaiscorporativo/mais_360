import type { Metadata } from "next";
import { guard, requireTenant } from "@/server/auth";
import { prisma } from "@/server/db";
import { modulesForTenant, modulesForWorkspace } from "@/server/modules";
import { ModulesForm } from "./form";

export const metadata: Metadata = { title: "Módulos" };

export default async function ModulesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const ctx = await guard(requireTenant(slug));
  const [allowed, active, grants] = await Promise.all([
    modulesForWorkspace(ctx.workspace.id),
    modulesForTenant(ctx.tenant),
    prisma.tenantModule.findMany({ where: { tenantId: ctx.tenantId, enabled: true } }),
  ]);
  const wsRole = ctx.viewer.isPlatformStaff
    ? "OWNER"
    : ctx.viewer.user.workspaces.find((w) => w.workspaceId === ctx.workspace.id)?.role;
  const canEdit = wsRole === "OWNER" || wsRole === "ADMIN";
  const expired = grants
    .filter((g) => g.validUntil && g.validUntil <= new Date())
    .map((g) => g.module);

  return (
    <ModulesForm
      tenant={slug}
      allowed={[...allowed]}
      initial={[...active]}
      canEdit={canEdit}
      expired={expired}
    />
  );
}
