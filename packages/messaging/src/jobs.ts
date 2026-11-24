import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@mais/db";

/**
 * Enfileiramento de jobs (tabela Job, consumida pelo @mais/worker).
 *
 * Com `uniqueKey`, o mesmo trabalho nunca existe duas vezes:
 *  • job já terminado (DONE/DEAD/FAILED) → volta para PENDING com o novo horário;
 *  • job PENDING → mantém o horário mais cedo;
 *  • job RUNNING → não mexe (quem está rodando reagenda ao terminar).
 */

export const QUEUES = {
  campaignTick: "messaging.campaign.tick",
  deliverySend: "messaging.delivery.send",
  /** Acontecimento de uma inscrição (criada, confirmada, check-in) → réguas */
  automationEvent: "automations.event",
  /** Uma ocorrência de régua por data (D-1, voo, documentos) */
  automationRun: "automations.run",
} as const;

type Db = Pick<PrismaClient, "$queryRaw">;

export async function enqueueJob(
  db: Db,
  job: { queue: string; payload?: unknown; runAt?: Date; uniqueKey?: string; maxAttempts?: number },
): Promise<string> {
  const id = randomUUID();
  const runAt = job.runAt ?? new Date();
  const payload = JSON.stringify(job.payload ?? {});
  const max = job.maxAttempts ?? 5;
  if (!job.uniqueKey) {
    await db.$queryRaw`
      INSERT INTO "Job" (id, queue, payload, status, "runAt", attempts, "maxAttempts", "lockedBy", "lastError", "createdAt", "updatedAt")
      VALUES (${id}, ${job.queue}, ${payload}::jsonb, 'PENDING', ${runAt}, 0, ${max}, '', '', now(), now())`;
    return id;
  }
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "Job" (id, queue, payload, "uniqueKey", status, "runAt", attempts, "maxAttempts", "lockedBy", "lastError", "createdAt", "updatedAt")
    VALUES (${id}, ${job.queue}, ${payload}::jsonb, ${job.uniqueKey}, 'PENDING', ${runAt}, 0, ${max}, '', '', now(), now())
    ON CONFLICT ("uniqueKey") DO UPDATE SET
      "runAt" = CASE
        WHEN "Job".status IN ('DONE', 'DEAD', 'FAILED') THEN EXCLUDED."runAt"
        WHEN "Job".status = 'PENDING' THEN LEAST("Job"."runAt", EXCLUDED."runAt")
        ELSE "Job"."runAt" END,
      attempts = CASE WHEN "Job".status IN ('DONE', 'DEAD', 'FAILED') THEN 0 ELSE "Job".attempts END,
      status = CASE WHEN "Job".status IN ('DONE', 'DEAD', 'FAILED') THEN 'PENDING'::"JobStatus" ELSE "Job".status END,
      payload = EXCLUDED.payload,
      "updatedAt" = now()
    RETURNING id`;
  return rows[0]?.id ?? id;
}

export const campaignJobKey = (campaignId: string) => `campaign:${campaignId}`;

export function enqueueCampaignTick(db: Db, campaignId: string, runAt?: Date) {
  return enqueueJob(db, {
    queue: QUEUES.campaignTick,
    payload: { campaignId },
    uniqueKey: campaignJobKey(campaignId),
    runAt,
    maxAttempts: 10,
  });
}

/**
 * Enfileira só se o `uniqueKey` nunca existiu: um job concluído NÃO volta para
 * a fila (ocorrência de régua por data roda uma vez, mesmo com a varredura
 * passando de novo). Devolve se criou.
 */
export async function enqueueJobOnce(
  db: Db,
  job: { queue: string; payload?: unknown; runAt?: Date; uniqueKey: string; maxAttempts?: number },
): Promise<boolean> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "Job" (id, queue, payload, "uniqueKey", status, "runAt", attempts, "maxAttempts", "lockedBy", "lastError", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${job.queue}, ${JSON.stringify(job.payload ?? {})}::jsonb, ${job.uniqueKey}, 'PENDING', ${job.runAt ?? new Date()}, 0, ${job.maxAttempts ?? 5}, '', '', now(), now())
    ON CONFLICT ("uniqueKey") DO NOTHING
    RETURNING id`;
  return rows.length > 0;
}

/**
 * Vários jobs numa única instrução (mesma regra do `enqueueJob` para chaves
 * repetidas). Usado quando uma ação em lote gera um acontecimento por inscrição.
 */
export async function enqueueJobs(
  db: Db,
  jobs: { queue: string; payload: unknown; uniqueKey: string; maxAttempts?: number }[],
  runAt: Date = new Date(),
): Promise<number> {
  if (!jobs.length) return 0;
  const rows = jobs.map((j) => ({
    id: randomUUID(),
    queue: j.queue,
    payload: JSON.stringify(j.payload ?? {}),
    key: j.uniqueKey,
    max: j.maxAttempts ?? 5,
  }));
  await db.$queryRaw`
    INSERT INTO "Job" (id, queue, payload, "uniqueKey", status, "runAt", attempts, "maxAttempts", "lockedBy", "lastError", "createdAt", "updatedAt")
    SELECT x.id, x.queue, x.payload::jsonb, x.key, 'PENDING', ${runAt}, 0, x.max, '', '', now(), now()
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(id text, queue text, payload text, key text, max int)
    ON CONFLICT ("uniqueKey") DO UPDATE SET
      "runAt" = CASE
        WHEN "Job".status IN ('DONE', 'DEAD', 'FAILED') THEN EXCLUDED."runAt"
        WHEN "Job".status = 'PENDING' THEN LEAST("Job"."runAt", EXCLUDED."runAt")
        ELSE "Job"."runAt" END,
      attempts = CASE WHEN "Job".status IN ('DONE', 'DEAD', 'FAILED') THEN 0 ELSE "Job".attempts END,
      status = CASE WHEN "Job".status IN ('DONE', 'DEAD', 'FAILED') THEN 'PENDING'::"JobStatus" ELSE "Job".status END,
      payload = EXCLUDED.payload,
      "updatedAt" = now()
    RETURNING "Job".id`;
  return rows.length;
}
