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
