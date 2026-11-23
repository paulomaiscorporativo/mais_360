import { notFound } from "next/navigation";
import { guard, requirePlatformRole } from "@/server/auth";
import { prisma } from "@/server/db";

/**
 * Checagem de acesso ANTES do limite de Suspense (loading.tsx), para que quem
 * não é da plataforma — ou assinante inexistente — receba HTTP 404 de verdade.
 */
export default async function WorkspaceDetailGuard({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string }>;
}) {
  await guard(requirePlatformRole(["SUPERADMIN", "SUPPORT"]));
  const exists = await prisma.workspace.findUnique({
    where: { slug: (await params).ws },
    select: { id: true },
  });
  if (!exists) notFound();
  return children;
}
