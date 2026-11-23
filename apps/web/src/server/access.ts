import "server-only";
import { createHash, randomBytes } from "node:crypto";
import {
  accessTokenEmailKey,
  accessTokenExpiry,
  AUTH_EMAIL_QUEUE,
  type AccessTokenPurpose,
  type AuthEmailPayload,
} from "@mais/core";
import type { Prisma } from "@mais/db";
import { enqueueJob } from "@mais/messaging";
import { PRODUCT } from "@/config/product";
import { prisma } from "./db";
import { env } from "./env";
import { hashPassword } from "./password";

/**
 * Convites e redefinições de senha da equipe (User).
 *
 *  • o token é aleatório (32 bytes) e só o SHA-256 dele fica no banco;
 *  • emitir um novo do mesmo propósito revoga os anteriores ainda abertos;
 *  • o e-mail vira job na fila `auth.email` (uma entrega por token), e a
 *    action devolve o link para o administrador copiar se o e-mail falhar.
 */

type Tx = Prisma.TransactionClient;

export const hashAccessToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

const PATHS: Record<AccessTokenPurpose, string> = {
  INVITE: "/entrar/convite",
  PASSWORD_RESET: "/entrar/redefinir",
};

export function accessLink(purpose: AccessTokenPurpose, raw: string) {
  return `${env.APP_URL.replace(/\/+$/, "")}${PATHS[purpose]}/${raw}`;
}

export const loginLink = () => `${env.APP_URL.replace(/\/+$/, "")}/entrar`;

export type EmailBrand = AuthEmailPayload["brand"];

/** Marca dos e-mails: a da plataforma, ou a do assinante quando ele usa white-label. */
export function emailBrand(
  workspace?: { name: string; whiteLabel: boolean } | null,
  color?: string | null,
): EmailBrand {
  if (workspace?.whiteLabel) return { name: workspace.name, color: color ?? PRODUCT.brandColor };
  return { name: PRODUCT.name, color: PRODUCT.brandColor, byline: PRODUCT.byline };
}

export type IssuedToken = { id: string; link: string; expiresAt: Date };

/** Emite um token novo (revogando os abertos do mesmo propósito) e enfileira o e-mail. */
export async function issueAccessToken(
  tx: Tx,
  input: {
    user: { id: string; email: string; name: string };
    purpose: AccessTokenPurpose;
    createdById: string | null;
    email: Omit<AuthEmailPayload, "kind" | "to" | "recipientName" | "link" | "tokenId">;
  },
): Promise<IssuedToken> {
  const now = new Date();
  await tx.userAccessToken.updateMany({
    where: { userId: input.user.id, purpose: input.purpose, usedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
  const raw = randomBytes(32).toString("base64url");
  const token = await tx.userAccessToken.create({
    data: {
      userId: input.user.id,
      purpose: input.purpose,
      tokenHash: hashAccessToken(raw),
      expiresAt: accessTokenExpiry(input.purpose, now),
      createdById: input.createdById,
    },
  });
  const link = accessLink(input.purpose, raw);
  const payload: AuthEmailPayload = {
    ...input.email,
    kind: input.purpose,
    to: input.user.email,
    recipientName: input.user.name,
    link,
    tokenId: token.id,
  };
  await enqueueJob(tx, {
    queue: AUTH_EMAIL_QUEUE,
    payload,
    uniqueKey: accessTokenEmailKey(token.id),
    maxAttempts: 6,
  });
  return { id: token.id, link, expiresAt: token.expiresAt };
}

/** Aviso de novo acesso para quem já tem conta (sem token, sem senha). */
export async function enqueueAccessGranted(
  tx: Tx,
  input: {
    user: { id: string; email: string; name: string };
    scopeKey: string;
    email: Omit<AuthEmailPayload, "kind" | "to" | "recipientName" | "link" | "tokenId">;
  },
) {
  const payload: AuthEmailPayload = {
    ...input.email,
    kind: "ACCESS_GRANTED",
    to: input.user.email,
    recipientName: input.user.name,
    link: loginLink(),
  };
  await enqueueJob(tx, {
    queue: AUTH_EMAIL_QUEUE,
    payload,
    uniqueKey: `auth.email:grant:${input.scopeKey}:${input.user.id}`,
    maxAttempts: 4,
  });
}

/** Revoga convites e redefinições abertos (conta desativada). */
export function revokeOpenAccessTokens(tx: Tx, userId: string) {
  return tx.userAccessToken.updateMany({
    where: { userId, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Garante a conta da pessoa. Conta nova nasce sem senha utilizável (hash de um
 * segredo descartado) e com `mustChangePassword`: só entra pelo convite.
 */
export async function ensureTeamUser(tx: Tx, input: { email: string; name: string }) {
  const existing = await tx.user.findUnique({ where: { email: input.email } });
  if (existing) return { user: existing, created: false };
  const user = await tx.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(randomBytes(24).toString("base64url")),
      mustChangePassword: true,
    },
  });
  return { user, created: true };
}

/** Token pelo valor do link (ou null). */
export function findAccessToken(raw: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(raw)) return Promise.resolve(null);
  return prisma.userAccessToken.findUnique({
    where: { tokenHash: hashAccessToken(raw) },
    include: { user: true },
  });
}

/**
 * Marca o token como usado — atômico: se dois envios chegarem juntos, só um
 * passa. Devolve false se o token já não valia.
 */
export async function consumeAccessToken(tx: Tx, tokenId: string): Promise<boolean> {
  const r = await tx.userAccessToken.updateMany({
    where: { id: tokenId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  return r.count === 1;
}
