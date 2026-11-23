"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { accessTokenProblem } from "@mais/core";
import { consumeAccessToken, emailBrand, findAccessToken, issueAccessToken } from "@/server/access";
import { defineAction, v } from "@/server/action";
import { audit } from "@/server/audit";
import { homePathFor, loadViewer } from "@/server/auth";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { hashPassword, passwordProblem } from "@/server/password";
import { rateLimit } from "@/server/rate-limit";
import { createSession, revokeUserSessions } from "@/server/session";

async function clientIp() {
  return ((await headers()).get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
}

// ---------------------------------------------------------------------------
// Definir senha pelo link (convite de primeiro acesso ou redefinição)
// ---------------------------------------------------------------------------

const completeSchema = z
  .object({
    token: z.string().min(1),
    purpose: z.enum(["INVITE", "PASSWORD_RESET"]),
    password: z.string(),
    confirm: z.string(),
  })
  .superRefine((d, ctx) => {
    const problem = passwordProblem(d.password);
    if (problem) ctx.addIssue({ code: "custom", path: ["password"], message: problem });
    if (d.password !== d.confirm)
      ctx.addIssue({ code: "custom", path: ["confirm"], message: "As senhas não conferem." });
  });

export const completeAccessLink = defineAction(
  completeSchema,
  async ({ token, purpose, password }) => {
    const limit = rateLimit(`access-link:${await clientIp()}`, 20, 15 * 60_000);
    if (!limit.allowed) throw new AppError("Muitas tentativas. Tente de novo em alguns minutos.");

    const found = await findAccessToken(token);
    const problem =
      found && found.purpose !== purpose ? accessTokenProblem(null) : accessTokenProblem(found);
    if (problem || !found) throw new AppError(problem ?? "Este link não é válido.");
    if (!found.user.active)
      throw new AppError("Esta conta está desativada. Fale com o administrador.");

    const passwordHash = await hashPassword(password);
    const now = new Date();
    const ok = await prisma.$transaction(async (tx) => {
      if (!(await consumeAccessToken(tx, found.id))) return false;
      await tx.user.update({
        where: { id: found.userId },
        data: { passwordHash, mustChangePassword: false, lastLoginAt: now },
      });
      // Os outros links abertos do usuário (ex.: convite + redefinição) deixam de valer
      await tx.userAccessToken.updateMany({
        where: { userId: found.userId, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      return true;
    });
    if (!ok) throw new AppError(accessTokenProblem({ ...found, usedAt: now }) ?? "");

    // Senha nova: nenhuma sessão antiga continua valendo
    await revokeUserSessions(found.userId);
    await createSession({ kind: "USER", userId: found.userId });
    await audit({
      action: purpose === "INVITE" ? "auth.invite.accept" : "auth.password.reset",
      userId: found.userId,
      actorLabel: found.user.name,
      entityType: "User",
      entityId: found.userId,
      data: { tokenId: found.id, by: "self" },
    });

    const viewer = await loadViewer();
    let home = "/entrar";
    try {
      if (viewer) home = await homePathFor(viewer);
    } catch {
      // Conta sem nenhum vínculo ainda: o login explica
    }
    redirect(home);
  },
);

// ---------------------------------------------------------------------------
// Esqueci a senha — resposta sempre neutra
// ---------------------------------------------------------------------------

const IP_LIMIT = 10;
const EMAIL_LIMIT = 3;

export const requestPasswordReset = defineAction(
  z.object({ email: v.email() }),
  async ({ email }) => {
    const ip = await clientIp();
    const byIp = rateLimit(`forgot:ip:${ip}`, IP_LIMIT, 15 * 60_000);
    if (!byIp.allowed) {
      const min = Math.ceil(byIp.retryAfterMs / 60_000);
      throw new AppError(`Muitos pedidos deste dispositivo. Tente de novo em ${min} min.`);
    }
    // Limite por e-mail: silencioso, para não revelar se a conta existe
    const byEmail = rateLimit(`forgot:email:${email}`, EMAIL_LIMIT, 60 * 60_000);
    if (!byEmail.allowed) return { sent: true };

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        workspaces: { include: { workspace: true }, orderBy: { createdAt: "asc" }, take: 1 },
        memberships: {
          include: { tenant: { include: { workspace: true, branding: true } } },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });
    if (!user || !user.active) return { sent: true };

    const tenant = user.memberships[0]?.tenant;
    const workspace = user.workspaces[0]?.workspace ?? tenant?.workspace ?? null;
    const brand =
      user.platformRole !== "NONE"
        ? emailBrand(null)
        : emailBrand(workspace, tenant?.branding?.primaryColor);
    const issued = await prisma.$transaction((tx) =>
      issueAccessToken(tx, {
        user,
        purpose: "PASSWORD_RESET",
        createdById: null,
        email: { brand },
      }),
    );
    await audit({
      action: "auth.password.reset.request",
      userId: user.id,
      actorLabel: user.name,
      entityType: "User",
      entityId: user.id,
      data: { tokenId: issued.id, by: "self" },
    });
    return { sent: true };
  },
);
