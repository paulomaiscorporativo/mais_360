import type { Metadata } from "next";
import { canDeactivateUser, managesWorkspaceTeam } from "@mais/core";
import { PageHeader } from "@/components/ui";
import { guard, requireWorkspace } from "@/server/auth";
import { prisma } from "@/server/db";
import { accessSummaries, actorAuthority, linksOf, usersWithLinks } from "@/server/team";
import { WorkspaceTeam } from "./team";

export const metadata: Metadata = { title: "Equipe do assinante" };

export default async function WorkspaceTeamPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await guard(requireWorkspace(ws));
  const canEdit = managesWorkspaceTeam(ctx.role);
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: ctx.workspace.id },
    include: {
      user: {
        include: {
          _count: {
            select: { memberships: { where: { tenant: { workspaceId: ctx.workspace.id } } } },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const users = members.map((m) => m.user);
  const [summaries, links] = await Promise.all([
    accessSummaries(users),
    canEdit ? usersWithLinks(users.map((u) => u.id)) : Promise.resolve(null),
  ]);
  const authority = actorAuthority(ctx.viewer);

  return (
    <>
      <PageHeader
        crumbs={[{ label: ctx.workspace.name, href: `/console/${ws}` }, { label: "Equipe" }]}
        title="Equipe do assinante"
        description="Quem administra a conta, cria clientes e opera para eles. Cada pessoa entra com a própria senha, criada pelo convite."
      />
      <WorkspaceTeam
        ws={ws}
        viewerRole={ctx.role}
        canEdit={canEdit}
        currentUserId={ctx.viewer.user.id}
        members={members.map((m) => {
          const userLinks = links?.get(m.userId);
          return {
            userId: m.userId,
            name: m.user.name,
            email: m.user.email,
            role: m.role,
            tenants: m.user._count.memberships,
            ...summaries.get(m.userId)!,
            canDeactivate: !!userLinks && canDeactivateUser(authority, linksOf(userLinks)),
          };
        })}
      />
    </>
  );
}
