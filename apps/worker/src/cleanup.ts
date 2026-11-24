import { Prisma, type PrismaClient } from "@mais/db";
import { cleanupCutoffs, type CleanupConfig } from "@mais/core/ops";
import type { Logger } from "./runner";

/**
 * Limpeza diária (tarefa `ops.cleanup`). Apaga em lotes, para não travar
 * tabelas grandes, só o que já não serve para nada:
 *
 *  • sessões vencidas ou revogadas há mais de N dias;
 *  • convites/links de acesso (UserAccessToken, PersonAccessInvite) usados,
 *    revogados ou vencidos há mais de N dias;
 *  • jobs concluídos (DONE) e com falha definitiva (FAILED/DEAD) antigos;
 *  • contadores do limite de tentativas com janela encerrada;
 *  • sinais de vida de workers parados há dias.
 *
 * NUNCA apaga AuditLog nem MessageDelivery (histórico e prova de envio).
 */

export type CleanupCounts = {
  sessions: number;
  userAccessTokens: number;
  personAccessInvites: number;
  jobsDone: number;
  jobsFailed: number;
  rateLimitBuckets: number;
  workerHeartbeats: number;
};

/** Apaga em lotes (o filtro vem em `where`) até não sobrar nada. */
async function deleteInBatches(
  db: PrismaClient,
  table: string,
  key: string,
  where: Prisma.Sql,
  batchSize: number,
): Promise<number> {
  const t = Prisma.raw(`"${table}"`);
  const k = Prisma.raw(`"${key}"`);
  let total = 0;
  for (;;) {
    const n = await db.$executeRaw`
      DELETE FROM ${t} WHERE ${k} IN (SELECT ${k} FROM ${t} WHERE ${where} LIMIT ${batchSize})`;
    total += n;
    if (n < batchSize) return total;
  }
}

export async function runCleanup(
  db: PrismaClient,
  config: CleanupConfig,
  now = new Date(),
  log: Logger = console,
): Promise<CleanupCounts> {
  const c = cleanupCutoffs(config, now);
  const b = config.batchSize;
  const counts: CleanupCounts = {
    sessions: await deleteInBatches(
      db,
      "Session",
      "id",
      Prisma.sql`"expiresAt" < ${c.session} OR "revokedAt" < ${c.session}`,
      b,
    ),
    userAccessTokens: await deleteInBatches(
      db,
      "UserAccessToken",
      "id",
      Prisma.sql`"expiresAt" < ${c.token} OR "usedAt" < ${c.token} OR "revokedAt" < ${c.token}`,
      b,
    ),
    personAccessInvites: await deleteInBatches(
      db,
      "PersonAccessInvite",
      "id",
      Prisma.sql`"expiresAt" < ${c.token} OR "usedAt" < ${c.token}`,
      b,
    ),
    jobsDone: await deleteInBatches(
      db,
      "Job",
      "id",
      Prisma.sql`status = 'DONE' AND "updatedAt" < ${c.jobDone}`,
      b,
    ),
    jobsFailed: await deleteInBatches(
      db,
      "Job",
      "id",
      Prisma.sql`status IN ('FAILED', 'DEAD') AND "updatedAt" < ${c.jobFailed}`,
      b,
    ),
    rateLimitBuckets: await deleteInBatches(
      db,
      "RateLimitBucket",
      "key",
      Prisma.sql`"resetAt" < ${now}`,
      b,
    ),
    workerHeartbeats: await deleteInBatches(
      db,
      "WorkerHeartbeat",
      "workerId",
      Prisma.sql`"lastSeenAt" < ${c.heartbeat}`,
      b,
    ),
  };
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  log.info(
    `[worker] limpeza: ${total} registro(s) apagado(s) — ` +
      Object.entries(counts)
        .map(([k, n]) => `${k}=${n}`)
        .join(", "),
  );
  return counts;
}
