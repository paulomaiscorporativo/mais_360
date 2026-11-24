import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { normalizeEmail } from "@mais/core";
import { prisma } from "./db";
import { env, isProd } from "./env";
import { AppError } from "./errors";
import { modulesForTenant } from "./modules";
import { dummyHash, verifyPassword } from "./password";
import { rateLimit } from "./rate-limit";
import { tenantDb } from "./tenant-db";
import { resolvePublicTenant } from "./tenant-resolve";

/**
 * ÁREA DO ASSOCIADO (<cliente>/viagens) — entrada do membro do cliente
 * (Person.isMember com senha). Sessão revogável própria (Session kind PERSON),
 * num cookie separado do console e do portal da empresa: o associado entrar
 * não derruba a sessão de quem trabalha no console no mesmo navegador.
 * Trocar a senha (ou a equipe gerar uma nova) revoga as outras sessões.
 */

const COOKIE = "mais_member";
const SHORT_TTL_MS = 12 * 60 * 60 * 1000;
const LONG_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const key = new TextEncoder().encode(env.AUTH_SECRET);

async function meta() {
  const h = await headers();
  return {
    ip: (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim(),
    userAgent: (h.get("user-agent") ?? "").slice(0, 300),
  };
}

export async function signInMember(
  tenantSlug: string,
  email: string,
  password: string,
  remember: boolean,
) {
  const m = await meta();
  const normalized = normalizeEmail(email);
  if (
    !(await rateLimit(`member-login:${m.ip}`, 20, 15 * 60_000)).allowed ||
    !(await rateLimit(`member-login:${tenantSlug}:${normalized}`, 8, 15 * 60_000)).allowed
  )
    throw new AppError("Muitas tentativas. Aguarde alguns minutos e tente de novo.");

  const tenant = await resolvePublicTenant(tenantSlug);
  const person =
    tenant && tenant.status === "ACTIVE" && normalized
      ? await tenantDb({ tenantId: tenant.id }).person.findFirst({
          where: {
            emailNorm: normalized,
            isMember: true,
            archivedAt: null,
            passwordHash: { not: null },
          },
        })
      : null;
  // Compara sempre (mesmo sem pessoa) para o tempo de resposta não revelar o e-mail
  const ok = await verifyPassword(password, person?.passwordHash ?? (await dummyHash()));
  if (!person || !ok || !tenant) throw new AppError("E-mail ou senha incorretos.");

  const ttl = remember ? LONG_TTL_MS : SHORT_TTL_MS;
  const session = await prisma.session.create({
    data: {
      kind: "PERSON",
      tenantId: tenant.id,
      personId: person.id,
      ip: m.ip,
      userAgent: m.userAgent,
      expiresAt: new Date(Date.now() + ttl),
    },
  });
  await prisma.person.update({ where: { id: person.id }, data: { lastLoginAt: new Date() } });
  const token = await new SignJWT({ sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(session.expiresAt)
    .sign(key);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  return { tenant, person };
}

async function sessionId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return typeof payload.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}

export async function memberLogout() {
  const sid = await sessionId();
  if (sid)
    await prisma.session.updateMany({
      where: { id: sid, kind: "PERSON", revokedAt: null },
      data: { revokedAt: new Date() },
    });
  (await cookies()).delete(COOKIE);
}

/**
 * Associado logado neste cliente (ou null). Confere sessão válida, cliente da
 * página e cadastro ativo de membro. Memoizada por requisição.
 */
export const currentMember = cache(async (tenantSlug: string) => {
  const sid = await sessionId();
  if (!sid) return null;
  const tenant = await resolvePublicTenant(tenantSlug);
  if (!tenant || tenant.status !== "ACTIVE") return null;
  const session = await prisma.session.findUnique({ where: { id: sid } });
  if (
    !session ||
    session.kind !== "PERSON" ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.tenantId !== tenant.id ||
    !session.personId
  )
    return null;
  const db = tenantDb({ tenantId: tenant.id });
  const person = await db.person.findFirst({
    where: { id: session.personId, isMember: true, archivedAt: null },
    include: {
      organizations: {
        where: { primary: true },
        take: 1,
        include: { organization: { select: { name: true } } },
      },
    },
  });
  if (!person || !person.passwordHash) return null;
  const modules = await modulesForTenant(tenant);
  return {
    tenant,
    db,
    person,
    sessionId: session.id,
    company: person.organizations[0]?.organization.name ?? "",
    travel: modules.has("CORPORATE_TRAVEL"),
    tz: tenant.timezone,
  };
});

export type MemberPortal = NonNullable<Awaited<ReturnType<typeof currentMember>>>;

/** Para Server Actions da área: associado logado ou erro. */
export async function requireMember(tenantSlug: string): Promise<MemberPortal> {
  const m = await currentMember(tenantSlug);
  if (!m) throw new AppError("Sua sessão expirou. Entre de novo.", "UNAUTHENTICATED");
  return m;
}

/** Associado logado com o módulo de viagens corporativas ativo no cliente. */
export async function requireMemberTravel(tenantSlug: string): Promise<MemberPortal> {
  const m = await requireMember(tenantSlug);
  if (!m.travel) throw new AppError("As viagens corporativas não estão disponíveis.", "NOT_FOUND");
  if (m.person.mustChangePassword)
    throw new AppError("Troque a senha provisória antes de continuar.", "FORBIDDEN");
  return m;
}
