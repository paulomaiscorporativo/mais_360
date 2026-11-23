import "server-only";
import { WORKSPACE_ROLE_INFO } from "@mais/core";
import type { Prisma, WorkspaceRole } from "@mais/db";
import { prisma } from "./db";
import { AppError } from "./errors";
import { emailBrand, inviteTeamMember, type InviteOutcome } from "./team";

/**
 * Dá acesso ao assinante: cria a conta se não existir (a pessoa define a
 * própria senha pelo convite), faz o vínculo e enfileira o e-mail. Quem já tem
 * conta ativa recebe só o vínculo e um aviso.
 */
export async function inviteWorkspaceMember(
  tx: Prisma.TransactionClient,
  input: {
    workspace: { id: string; name: string; whiteLabel: boolean };
    name: string;
    email: string;
    role: WorkspaceRole;
    actor: { id: string; name: string };
  },
): Promise<InviteOutcome> {
  return inviteTeamMember(tx, {
    name: input.name,
    email: input.email,
    actorId: input.actor.id,
    scopeKey: `workspace:${input.workspace.id}`,
    emailContext: {
      brand: emailBrand(input.workspace),
      contextName: input.workspace.name,
      roleLabel: WORKSPACE_ROLE_INFO[input.role].label,
      actorName: input.actor.name,
    },
    link: async (userId) => {
      const existing = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: input.workspace.id, userId } },
      });
      if (existing)
        throw new AppError(`${input.email} já faz parte da equipe deste assinante.`, "CONFLICT");
      return tx.workspaceMember.create({
        data: { workspaceId: input.workspace.id, userId, role: input.role },
      });
    },
  });
}

/** Contagem de donos e gestores (OWNER + ADMIN) para as regras de "último dono". */
export async function workspaceTeamCounts(workspaceId: string) {
  const rows = await prisma.workspaceMember.groupBy({
    by: ["role"],
    where: { workspaceId, user: { active: true } },
    _count: { _all: true },
  });
  const count = (role: WorkspaceRole) => rows.find((r) => r.role === role)?._count._all ?? 0;
  return { owners: count("OWNER"), managers: count("OWNER") + count("ADMIN") };
}
