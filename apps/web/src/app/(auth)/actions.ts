"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { defineAction, v } from "@/server/action";
import { CHANGE_PASSWORD_PATH, homePathFor, loadViewer, requireUser } from "@/server/auth";
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from "@/server/password";
import { rateLimit, resetRateLimit } from "@/server/rate-limit";
import { createSession, destroySession, revokeUserSessions } from "@/server/session";
import { headers } from "next/headers";

const MAX_ATTEMPTS = 6;
const WINDOW_MS = 15 * 60 * 1000;

/** Só aceita caminhos internos como destino pós-login (evita open redirect). */
function safeNext(next: string | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

const loginSchema = z.object({
  email: v.email(),
  password: z.string().min(1, "Informe sua senha."),
  remember: z.boolean().default(false),
  next: z.string().optional(),
});

export const login = defineAction(loginSchema, async ({ email, password, remember, next }) => {
  const ip = ((await headers()).get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  const key = `login:${email}:${ip}`;
  const limit = await rateLimit(key, MAX_ATTEMPTS, WINDOW_MS);
  if (!limit.allowed) {
    const min = Math.ceil(limit.retryAfterMs / 60000);
    throw new AppError(`Muitas tentativas. Por segurança, tente de novo em ${min} min.`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !ok || !user.active) {
    throw new AppError(
      user && !user.active
        ? "Esta conta está desativada. Fale com o administrador."
        : "E-mail ou senha incorretos.",
    );
  }

  await resetRateLimit(key);
  await createSession({ kind: "USER", userId: user.id, remember });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({
    action: "auth.login",
    userId: user.id,
    actorLabel: user.name,
    entityType: "User",
    entityId: user.id,
  });

  if (user.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);
  const viewer = await loadViewer();
  redirect(safeNext(next) ?? (viewer ? await homePathFor(viewer) : "/"));
});

const changeSchema = z
  .object({
    current: z.string().min(1, "Informe a senha atual."),
    password: z.string(),
    confirm: z.string(),
  })
  .superRefine((d, ctx) => {
    const problem = passwordProblem(d.password);
    if (problem) ctx.addIssue({ code: "custom", path: ["password"], message: problem });
    if (d.password !== d.confirm)
      ctx.addIssue({ code: "custom", path: ["confirm"], message: "As senhas não conferem." });
    if (d.password && d.password === d.current)
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Escolha uma senha diferente da atual.",
      });
  });

export const changePassword = defineAction(changeSchema, async ({ current, password }) => {
  const viewer = await requireUser({ allowPasswordChange: true });
  if (!(await verifyPassword(current, viewer.user.passwordHash))) {
    throw new AppError("A senha atual está incorreta.");
  }
  await prisma.user.update({
    where: { id: viewer.user.id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: false },
  });
  await revokeUserSessions(viewer.user.id, viewer.sessionId);
  await audit({
    action: "auth.password.change",
    userId: viewer.user.id,
    actorLabel: viewer.user.name,
    entityType: "User",
    entityId: viewer.user.id,
  });
  redirect(await homePathFor({ ...viewer, user: { ...viewer.user, mustChangePassword: false } }));
});

export async function logout() {
  await destroySession();
  redirect("/entrar");
}
