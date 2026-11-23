import "server-only";
import {
  canDeactivateUser,
  userAccessStatus,
  type ActorAuthority,
  type TargetLinks,
} from "@mais/core";
import type { Prisma } from "@mais/db";
import {
  emailBrand,
  enqueueAccessGranted,
  ensureTeamUser,
  issueAccessToken,
  revokeOpenAccessTokens,
  type EmailBrand,
  type IssuedToken,
} from "./access";
import type { Viewer } from "./auth";
import { prisma } from "./db";
import { AppError } from "./errors";
import { revokeUserSessions } from "./session";

/**
 * Serviços da gestão de equipe (cliente, assinante e plataforma): convites,
 * desativação/reativação e redefinição de senha pelo administrador.
 * As regras de decisão são puras e ficam em @mais/core/access.
 */

type Tx = Prisma.TransactionClient;

/** O que o ator administra, a partir dos vínculos dele. */
export function actorAuthority(viewer: Viewer): ActorAuthority {
  return {
    superadmin: viewer.isSuperadmin,
    support: viewer.user.platformRole === "SUPPORT",
    workspaceRoles: Object.fromEntries(viewer.user.workspaces.map((w) => [w.workspaceId, w.role])),
    tenantRoles: Object.fromEntries(viewer.user.memberships.map((m) => [m.tenantId, m.role])),
  };
}

const linksInclude = {
  workspaces: { select: { workspaceId: true, role: true } },
  memberships: { select: { tenantId: true, tenant: { select: { workspaceId: true } } } },
} satisfies Prisma.UserInclude;

type UserWithLinks = Prisma.UserGetPayload<{ include: typeof linksInclude }>;

export function linksOf(u: UserWithLinks): TargetLinks {
  return {
    platformRole: u.platformRole,
    workspaces: u.workspaces,
    tenants: u.memberships.map((m) => ({
      tenantId: m.tenantId,
      workspaceId: m.tenant.workspaceId,
    })),
  };
}

/** Vínculos de vários usuários de uma vez (para as listas de equipe). */
export async function usersWithLinks(userIds: string[]) {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    include: linksInclude,
  });
  return new Map(users.map((u) => [u.id, u]));
}

/** Situação + validade do último convite (para a coluna de status). */
export async function accessSummaries(
  users: { id: string; active: boolean; mustChangePassword: boolean; lastLoginAt: Date | null }[],
) {
  const pendingIds = users.filter((u) => userAccessStatus(u) === "INVITED").map((u) => u.id);
  const invites = pendingIds.length
    ? await prisma.userAccessToken.findMany({
        where: { userId: { in: pendingIds }, purpose: "INVITE", revokedAt: null, usedAt: null },
        orderBy: { createdAt: "desc" },
        select: { userId: true, expiresAt: true },
      })
    : [];
  const latest = new Map<string, Date>();
  for (const i of invites) if (!latest.has(i.userId)) latest.set(i.userId, i.expiresAt);
  return new Map(
    users.map((u) => [
      u.id,
      {
        status: userAccessStatus(u),
        inviteExpiresAt: latest.get(u.id)?.toISOString() ?? null,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      },
    ]),
  );
}

export type InviteEmailContext = {
  brand: EmailBrand;
  contextName: string;
  roleLabel: string;
  actorName: string;
};

export type InviteOutcome = {
  userId: string;
  email: string;
  /** Conta criada agora (ou ainda sem primeiro acesso) → convite com link. */
  invite: { link: string; expiresAt: string } | null;
};

/**
 * Convida para a equipe: cria a conta se não existir e emite o convite. Quem
 * já tem conta ativa recebe só o vínculo (`link` faz o vínculo dentro da mesma
 * transação) e um aviso por e-mail.
 */
export async function inviteTeamMember(
  tx: Tx,
  input: {
    name: string;
    email: string;
    actorId: string;
    scopeKey: string;
    emailContext: InviteEmailContext;
    link: (userId: string) => Promise<unknown>;
  },
): Promise<InviteOutcome> {
  const { user, created } = await ensureTeamUser(tx, { email: input.email, name: input.name });
  if (!user.active)
    throw new AppError(
      `A conta de ${user.email} está desativada. Reative-a antes de dar um novo acesso.`,
    );
  await input.link(user.id);

  const pending = created || userAccessStatus(user) === "INVITED";
  let issued: IssuedToken | null = null;
  if (pending) {
    issued = await issueAccessToken(tx, {
      user,
      purpose: "INVITE",
      createdById: input.actorId,
      email: input.emailContext,
    });
  } else {
    await enqueueAccessGranted(tx, {
      user,
      scopeKey: input.scopeKey,
      email: input.emailContext,
    });
  }
  return {
    userId: user.id,
    email: user.email,
    invite: issued ? { link: issued.link, expiresAt: issued.expiresAt.toISOString() } : null,
  };
}

/** Reenvia o convite (novo link; o anterior deixa de valer). */
export async function resendInvite(
  userId: string,
  actorId: string,
  emailContext: InviteEmailContext,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("Pessoa não encontrada.");
  if (userAccessStatus(user) !== "INVITED")
    throw new AppError(
      user.active
        ? "Esta pessoa já ativou a conta. Para trocar a senha, envie um link de redefinição."
        : "Esta conta está desativada. Reative-a antes de reenviar o convite.",
    );
  const issued = await prisma.$transaction((tx) =>
    issueAccessToken(tx, { user, purpose: "INVITE", createdById: actorId, email: emailContext }),
  );
  return { link: issued.link, expiresAt: issued.expiresAt.toISOString(), email: user.email };
}

/**
 * Link de redefinição enviado pelo administrador. Só por e-mail: o link não
 * aparece na tela (quem o visse poderia entrar como a pessoa).
 */
export async function sendResetByAdmin(
  userId: string,
  actorId: string,
  emailContext: Pick<InviteEmailContext, "brand" | "actorName">,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("Pessoa não encontrada.");
  if (!user.active) throw new AppError("Esta conta está desativada. Reative-a antes.");
  if (userAccessStatus(user) === "INVITED")
    throw new AppError("Esta pessoa ainda não ativou a conta. Reenvie o convite.");
  const issued = await prisma.$transaction((tx) =>
    issueAccessToken(tx, {
      user,
      purpose: "PASSWORD_RESET",
      createdById: actorId,
      email: emailContext,
    }),
  );
  return { email: user.email, tokenId: issued.id };
}

export type DeactivationOutcome = { mode: "DEACTIVATED" } | { mode: "UNLINKED" };

/**
 * Desativa a conta (todas as sessões caem na hora) se o ator administra todos
 * os vínculos da pessoa; senão, só executa `unlink` (remove o vínculo do
 * contexto atual) e a pessoa mantém os outros acessos.
 */
export async function deactivateOrUnlink(
  viewer: Viewer,
  userId: string,
  unlink: (tx: Tx) => Promise<unknown>,
): Promise<DeactivationOutcome> {
  if (userId === viewer.user.id)
    throw new AppError("Você não pode desativar o seu próprio acesso.");
  const user = await prisma.user.findUnique({ where: { id: userId }, include: linksInclude });
  if (!user) throw new AppError("Pessoa não encontrada.");
  if (canDeactivateUser(actorAuthority(viewer), linksOf(user))) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { active: false } });
      await revokeOpenAccessTokens(tx, userId);
    });
    await revokeUserSessions(userId);
    return { mode: "DEACTIVATED" };
  }
  await prisma.$transaction((tx) => unlink(tx));
  return { mode: "UNLINKED" };
}

/** Reativa a conta — mesma autoridade exigida para desativar. */
export async function reactivate(viewer: Viewer, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: linksInclude });
  if (!user) throw new AppError("Pessoa não encontrada.");
  if (!canDeactivateUser(actorAuthority(viewer), linksOf(user)))
    throw new AppError(
      "Esta pessoa também tem acesso a outros clientes ou assinantes. Peça a quem administra todos eles.",
      "FORBIDDEN",
    );
  if (user.active) return user;
  return prisma.user.update({ where: { id: userId }, data: { active: true } });
}

export { emailBrand };
