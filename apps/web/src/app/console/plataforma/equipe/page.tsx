import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { guard, requirePlatformRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { accessSummaries } from "@/server/team";
import { PlatformTeam } from "./team";

export const metadata: Metadata = { title: "Equipe da plataforma" };

export default async function PlatformTeamPage() {
  const viewer = await guard(requirePlatformRole(["SUPERADMIN"]));
  const users = await prisma.user.findMany({
    where: { platformRole: { not: "NONE" } },
    orderBy: [{ platformRole: "asc" }, { name: "asc" }],
  });
  const summaries = await accessSummaries(users);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Plataforma", href: "/console/plataforma" }, { label: "Equipe" }]}
        title="Equipe da plataforma"
        description="Superadmins gerenciam assinantes, planos e esta equipe. O suporte acessa os assinantes em modo assistido, com tudo registrado na auditoria."
      />
      <PlatformTeam
        currentUserId={viewer.user.id}
        members={users.map((u) => ({
          userId: u.id,
          name: u.name,
          email: u.email,
          role: u.platformRole === "SUPERADMIN" ? "SUPERADMIN" : "SUPPORT",
          ...summaries.get(u.id)!,
        }))}
      />
    </>
  );
}
