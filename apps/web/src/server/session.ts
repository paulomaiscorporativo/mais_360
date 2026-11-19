import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { SessionKind } from "@mais/db";
import { prisma } from "./db";
import { env, isProd } from "./env";

/**
 * Sessões revogáveis: o cookie carrega só o id da sessão, assinado (JWT HS256).
 * O estado real fica na tabela Session — sair, trocar senha ou o suporte
 * revogar invalida na hora, em todos os dispositivos.
 */

export const SESSION_COOKIE = "mais_session";
const SHORT_TTL_MS = 12 * 60 * 60 * 1000; // 12 h
const LONG_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias ("manter conectado")

const key = new TextEncoder().encode(env.AUTH_SECRET);

async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  return { ip, userAgent: (h.get("user-agent") ?? "").slice(0, 300) };
}

export async function createSession(opts: {
  kind: SessionKind;
  userId?: string;
  personId?: string;
  tenantId?: string;
  subjectId?: string;
  remember?: boolean;
}) {
  const ttl = opts.remember ? LONG_TTL_MS : SHORT_TTL_MS;
  const meta = await requestMeta();
  const session = await prisma.session.create({
    data: {
      kind: opts.kind,
      userId: opts.userId,
      personId: opts.personId,
      tenantId: opts.tenantId,
      subjectId: opts.subjectId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: new Date(Date.now() + ttl),
    },
  });
  const token = await new SignJWT({ sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(session.expiresAt)
    .sign(key);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  return session;
}

async function readSessionId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return typeof payload.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}

/** Sessão de usuário (equipe/cliente) válida da requisição atual, ou null. Memoizada por requisição. */
export const getSession = cache(async () => {
  const sid = await readSessionId();
  if (!sid) return null;
  const session = await prisma.session.findUnique({
    where: { id: sid },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (session.kind !== "USER" || !session.user || !session.user.active) return null;
  return session as typeof session & { user: NonNullable<typeof session.user> };
});

export async function destroySession() {
  const sid = await readSessionId();
  if (sid) {
    await prisma.session.updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  (await cookies()).delete(SESSION_COOKIE);
}

/** Revoga todas as sessões do usuário, menos (opcionalmente) a atual. */
export async function revokeUserSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}
