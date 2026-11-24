import { createHash } from "node:crypto";
import type { PrismaClient } from "@mais/db";
import { assertRateLimitParams, rateLimitDecision, type RateLimitResult } from "@mais/core/ops";

/**
 * Contador do limite de tentativas no Postgres (tabela RateLimitBucket),
 * compartilhado entre todos os nós da web e preservado em reinícios.
 *
 * Um único comando atômico (INSERT … ON CONFLICT DO UPDATE … RETURNING):
 * janela vencida recomeça em 1; dentro da janela, soma 1. Sem corrida entre
 * requisições simultâneas. O relógio é o do banco.
 *
 * Separado de rate-limit.ts (que importa "server-only") para o teste de
 * integração usar um banco próprio.
 */

type Db = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

/** A chave lógica pode ter e-mail e IP: só o hash vai para o banco. */
export const rateLimitKeyHash = (key: string) => createHash("sha256").update(key).digest("hex");

export async function hitRateLimit(
  db: Db,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  assertRateLimitParams(limit, windowMs);
  const rows = await db.$queryRaw<{ count: number; resetAt: Date; now: Date }[]>`
    INSERT INTO "RateLimitBucket" (key, count, "windowStart", "resetAt")
    VALUES (${rateLimitKeyHash(key)}, 1, now(), now() + ${windowMs}::int * interval '1 millisecond')
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimitBucket"."resetAt" > now() THEN "RateLimitBucket".count + 1 ELSE 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."resetAt" > now() THEN "RateLimitBucket"."windowStart" ELSE now() END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" > now() THEN "RateLimitBucket"."resetAt" ELSE EXCLUDED."resetAt" END
    RETURNING count, "resetAt", now() AS now`;
  const row = rows[0];
  if (!row) throw new Error("Limite de tentativas: o banco não devolveu o contador.");
  return rateLimitDecision({ count: row.count, limit, resetAt: row.resetAt, now: row.now });
}

export async function clearRateLimit(db: Db, key: string): Promise<void> {
  await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE key = ${rateLimitKeyHash(key)}`;
}
