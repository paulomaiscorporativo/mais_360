import type { Metadata } from "next";
import { guard, requireTenant } from "@/server/auth";
import { prisma } from "@/server/db";
import { TeamManager } from "./team";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const ctx = await guard(requireTenant(slug));
  const members = await prisma.membership.findMany({
    where: { tenantId: ctx.tenantId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  return (
    <TeamManager
      tenant={slug}
      canEdit={ctx.role === "ADMIN"}
      currentUserId={ctx.viewer.user.id}
      members={members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        pending: m.user.mustChangePassword,
        lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
      }))}
    />
  );
}
