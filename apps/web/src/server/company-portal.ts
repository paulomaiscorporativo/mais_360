import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { enabledProjectFeatures } from "@mais/core";
import { prisma } from "./db";
import { env, isProd } from "./env";
import { AppError } from "./errors";
import { modulesForTenant } from "./modules";
import { dummyHash, verifyPassword } from "./password";
import { rateLimit } from "./rate-limit";
import { tenantDb } from "./tenant-db";
import { resolvePublicTenant } from "./tenant-resolve";

/**
 * PORTAL DA EMPRESA CONVIDANTE (<cliente>/empresa).
 *
 * Sessão revogável própria (Session kind COMPANY, subjectId = CompanyQuota),
 * num cookie separado do console: a empresa entrar não derruba a sessão de
 * quem trabalha no console no mesmo navegador. Trocar a senha pelo console
 * revoga as sessões abertas (resetCompanyPassword).
 */

const COOKIE = "mais_company";
const TTL_MS = 12 * 60 * 60 * 1000;
const key = new TextEncoder().encode(env.AUTH_SECRET);

async function meta() {
  const h = await headers();
  return {
    ip: (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim(),
    userAgent: (h.get("user-agent") ?? "").slice(0, 300),
  };
}

export async function signInCompany(tenantSlug: string, login: string, password: string) {
  const m = await meta();
  const normalized = login.trim().toLowerCase();
  if (
    !rateLimit(`company-login:${m.ip}`, 20, 15 * 60_000).allowed ||
    !rateLimit(`company-login:${normalized}`, 8, 15 * 60_000).allowed
  )
    throw new AppError("Muitas tentativas. Aguarde alguns minutos e tente de novo.");

  const tenant = await resolvePublicTenant(tenantSlug);
  const company =
    tenant && tenant.status === "ACTIVE"
      ? await tenantDb({ tenantId: tenant.id }).companyQuota.findFirst({
          where: { login: normalized, project: { archivedAt: null } },
        })
      : null;
  // Compara sempre (mesmo sem empresa) para o tempo de resposta não revelar o login
  const ok = await verifyPassword(password, company?.passwordHash ?? (await dummyHash()));
  if (!company || !ok || !tenant) throw new AppError("Login ou senha incorretos.");

  const session = await prisma.session.create({
    data: {
      kind: "COMPANY",
      tenantId: tenant.id,
      subjectId: company.id,
      ip: m.ip,
      userAgent: m.userAgent,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  await prisma.companyQuota.update({
    where: { id: company.id },
    data: { lastLoginAt: new Date() },
  });
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
  return company;
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

export async function companyLogout() {
  const sid = await sessionId();
  if (sid)
    await prisma.session.updateMany({
      where: { id: sid, kind: "COMPANY", revokedAt: null },
      data: { revokedAt: new Date() },
    });
  (await cookies()).delete(COOKIE);
}

/**
 * Empresa logada neste cliente (ou null). Confere sessão válida, cliente da
 * página, projeto ativo e recurso de convites ligado. Memoizada por requisição.
 */
export const currentCompany = cache(async (tenantSlug: string) => {
  const sid = await sessionId();
  if (!sid) return null;
  const tenant = await resolvePublicTenant(tenantSlug);
  if (!tenant || tenant.status !== "ACTIVE") return null;
  const session = await prisma.session.findUnique({ where: { id: sid } });
  if (
    !session ||
    session.kind !== "COMPANY" ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.tenantId !== tenant.id ||
    !session.subjectId
  )
    return null;
  const db = tenantDb({ tenantId: tenant.id });
  const company = await db.companyQuota.findFirst({
    where: { id: session.subjectId, project: { archivedAt: null } },
    include: { project: { include: { features: true, inviteSettings: true } } },
  });
  if (!company) return null;
  const features = enabledProjectFeatures(company.project.features, await modulesForTenant(tenant));
  if (!features.has("INVITES")) return null;
  return {
    tenant,
    db,
    company,
    project: company.project,
    sessionId: session.id,
    ctx: { tenantId: tenant.id, projectId: company.projectId },
  };
});

export type CompanyPortal = NonNullable<Awaited<ReturnType<typeof currentCompany>>>;

/** Para Server Actions do portal: empresa logada ou erro. */
export async function requireCompany(tenantSlug: string): Promise<CompanyPortal> {
  const c = await currentCompany(tenantSlug);
  if (!c) throw new AppError("Sua sessão expirou. Entre de novo.", "UNAUTHENTICATED");
  return c;
}
