import type { Metadata } from "next";
import { canDeactivateUser } from "@mais/core";
import { guard, requireTenant } from "@/server/auth";
import { prisma } from "@/server/db";
import { accessSummaries, actorAuthority, linksOf, usersWithLinks } from "@/server/team";
import { tenantDb } from "@/server/tenant-db";
import { TeamManager } from "./team";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const ctx = await guard(requireTenant(slug));
  const canEdit = ctx.role === "ADMIN";
  const [members, projects] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId: ctx.tenantId },
      include: { user: true, projectAccess: { select: { projectId: true, role: true } } },
      orderBy: { createdAt: "asc" },
    }),
    canEdit
      ? tenantDb(ctx).project.findMany({
          where: { archivedAt: null },
          orderBy: [{ startsAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const users = members.map((m) => m.user);
  const [summaries, links] = await Promise.all([
    accessSummaries(users),
    canEdit ? usersWithLinks(users.map((u) => u.id)) : Promise.resolve(null),
  ]);
  const authority = actorAuthority(ctx.viewer);

  return (
    <TeamManager
      tenant={slug}
      canEdit={canEdit}
      currentUserId={ctx.viewer.user.id}
      projects={projects}
      members={members.map((m) => {
        const summary = summaries.get(m.userId)!;
        const userLinks = links?.get(m.userId);
        return {
          id: m.id,
          userId: m.userId,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          ...summary,
          allProjects: m.allProjects,
          projectAccess: m.projectAccess,
          canDeactivate: !!userLinks && canDeactivateUser(authority, linksOf(userLinks)),
        };
      })}
    />
  );
}
