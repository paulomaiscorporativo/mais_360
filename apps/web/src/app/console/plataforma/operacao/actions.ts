"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { jobActionProblem, maskText, payloadSummary, type JobStatusName } from "@mais/core/ops";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { requirePlatformRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { processVoucherJobs, VOUCHER_QUEUE } from "@/server/vouchers";

/**
 * Ações do painel de operação sobre jobs com falha definitiva. Só superadmin;
 * o suporte consulta. Toda ação grava AuditLog com o payload mascarado.
 */

const PATH = "/console/plataforma/operacao";
const ref = z.object({ jobId: z.string().min(1).max(64) });

async function failedJob(jobId: string, action: "retry" | "discard") {
  const viewer = await requirePlatformRole(["SUPERADMIN"]);
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError("Job não encontrado. Ele pode ter sido descartado ou limpo.");
  const problem = jobActionProblem(job.status as JobStatusName, action);
  if (problem) throw new AppError(problem);
  return { viewer, job };
}

const summary = (job: {
  queue: string;
  attempts: number;
  lastError: string;
  payload: unknown;
}) => ({
  queue: job.queue,
  attempts: job.attempts,
  lastError: maskText(job.lastError, 300),
  payload: payloadSummary(job.payload),
});

export const retryJob = defineAction(ref, async ({ jobId }) => {
  const { viewer, job } = await failedJob(jobId, "retry");
  // Condicional ao status: se outra pessoa já mexeu, não repete duas vezes
  const r = await prisma.job.updateMany({
    where: { id: job.id, status: { in: ["FAILED", "DEAD"] } },
    data: { status: "PENDING", attempts: 0, runAt: new Date(), lockedAt: null, lockedBy: "" },
  });
  if (r.count === 0) throw new AppError("Este job mudou de situação. Atualize a página.");
  await audit({
    action: "ops.job.retry",
    userId: viewer.user.id,
    actorLabel: viewer.user.name,
    entityType: "Job",
    entityId: job.id,
    data: summary(job),
  });
  // A fila de vouchers é consumida pela web, sob demanda
  if (job.queue === VOUCHER_QUEUE)
    after(() => processVoucherJobs().catch((e) => console.error("[vouchers] fila", e)));
  revalidatePath(PATH);
  return { queue: job.queue };
});

export const discardJob = defineAction(ref, async ({ jobId }) => {
  const { viewer, job } = await failedJob(jobId, "discard");
  const r = await prisma.job.deleteMany({
    where: { id: job.id, status: { in: ["FAILED", "DEAD"] } },
  });
  if (r.count === 0) throw new AppError("Este job mudou de situação. Atualize a página.");
  await audit({
    action: "ops.job.discard",
    userId: viewer.user.id,
    actorLabel: viewer.user.name,
    entityType: "Job",
    entityId: job.id,
    data: summary(job),
  });
  revalidatePath(PATH);
  return { queue: job.queue };
});
