import "server-only";
import { consoleAccess, statusBanner } from "@mais/core/workspaces";
import type { Viewer } from "./auth";
import { prisma } from "./db";

/**
 * Situação do assinante para a faixa de aviso do console. Só responde a quem
 * tem algum vínculo com o assinante (equipe dele, de um cliente dele ou da
 * plataforma) — para os demais devolve null e a página decide (404).
 */
export async function workspaceStatusFor(viewer: Viewer, slug: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true, name: true, status: true, trialEndsAt: true },
  });
  if (!workspace) return null;
  const linked =
    viewer.isPlatformStaff ||
    viewer.user.workspaces.some((w) => w.workspaceId === workspace.id) ||
    viewer.user.memberships.some((m) => m.tenant.workspaceId === workspace.id);
  if (!linked) return null;
  return {
    workspace,
    access: consoleAccess(workspace.status),
    banner: statusBanner(workspace),
  };
}
