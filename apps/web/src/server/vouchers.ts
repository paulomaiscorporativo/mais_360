import "server-only";
import { randomUUID } from "node:crypto";
import { voucherFileName } from "@mais/core";
import type { Prisma } from "@mais/db";
import { enqueueJob, sendTransactional, type TemplateContent } from "@mais/messaging";
import { prisma } from "./db";
import { renderForRegistrations } from "./documents";
import { saveUpload } from "./files";
import { tenantDb } from "./tenant-db";
import { travelerPortalUrl } from "./travel";

/**
 * Emissão de vouchers: gera o PDF de cada viajante pelo motor único
 * (`renderForRegistrations`), guarda pela camada de arquivos e publica como
 * ProjectDocument (VOUCHER) no portal. Reemitir substitui o arquivo, sem
 * duplicar o documento.
 *
 * Lotes grandes viram Job na fila `vouchers.issue`. Como o motor de documentos
 * vive na aplicação web, quem consome essa fila é a própria web (`after()` logo
 * após enfileirar e ao abrir a tela de vouchers), com a mesma reivindicação
 * SKIP LOCKED do worker — o worker não conhece a fila e não a toca, mas devolve
 * à fila jobs travados por um processo que morreu.
 */

export const VOUCHER_QUEUE = "vouchers.issue";

/** Espera entre tentativas: 30 s, 1 min, 2 min… (até 30 min). */
const backoffDelayMs = (attempt: number) =>
  Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));

export type VoucherJobPayload = {
  tenantId: string;
  projectId: string;
  templateId: string;
  registrationIds: string[];
  notify: boolean;
  actor: { label: string; userId: string | null };
  /** Progresso (atualizado durante a execução) */
  done?: number;
  failed?: string[];
};

/** Emite (ou reemite) o voucher de UMA inscrição. */
export async function issueVoucher(opts: {
  tenantId: string;
  projectId: string;
  template: { id: string; name: string };
  registrationId: string;
  notify: boolean;
  actor: { label: string; userId: string | null };
}) {
  const db = tenantDb({ tenantId: opts.tenantId });
  const reg = await db.registration.findFirst({
    where: { id: opts.registrationId, projectId: opts.projectId },
    select: { id: true, token: true, person: { select: { firstName: true, lastName: true } } },
  });
  if (!reg) return false;
  const out = await renderForRegistrations(opts.template.id, [reg.id], {
    tenantId: opts.tenantId,
    format: "pdf",
    purpose: "DOWNLOAD",
    actor: { type: "USER", label: opts.actor.label, userId: opts.actor.userId },
  });
  if (out.format !== "pdf") return false;
  const name = `${reg.person.firstName} ${reg.person.lastName}`.trim();
  const stored = await saveUpload({
    tenantId: opts.tenantId,
    file: new File([Buffer.from(out.bytes)], voucherFileName(opts.template.name, name), {
      type: "application/pdf",
    }),
    kind: "pdf",
    visibility: "PRIVATE",
    uploadedBy: opts.actor.label,
  });

  const existing = await db.projectDocument.findFirst({
    where: {
      projectId: opts.projectId,
      registrationId: reg.id,
      category: "VOUCHER",
      title: opts.template.name,
    },
    select: { id: true },
  });
  if (existing)
    await db.projectDocument.update({
      where: { id: existing.id },
      data: { fileId: stored.id, visibleToPerson: true },
    });
  else
    await db.projectDocument.create({
      data: {
        tenantId: opts.tenantId,
        projectId: opts.projectId,
        registrationId: reg.id,
        title: opts.template.name,
        category: "VOUCHER",
        fileId: stored.id,
        visibleToPerson: true,
      },
    });

  if (opts.notify) await notifyVoucher(opts.tenantId, opts.projectId, opts.template, reg);
  return true;
}

/** Aviso de voucher disponível: modelo VOUCHER do cliente ou o padrão. Uma vez por modelo. */
async function notifyVoucher(
  tenantId: string,
  projectId: string,
  template: { id: string; name: string },
  reg: { id: string; token: string },
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true },
  });
  if (!tenant) return;
  const link = await travelerPortalUrl(tenant, reg.token);
  const base = {
    tenantId,
    projectId,
    registrationId: reg.id,
    channels: ["EMAIL", "WHATSAPP"] as ("EMAIL" | "WHATSAPP")[],
    reason: `voucher.${template.id}`,
  };
  const fallback: TemplateContent = {
    name: "Voucher disponível (padrão)",
    emailSubject: `Seu voucher está disponível · {{projeto}}`,
    emailBody: [
      "Olá, {{primeiro_nome}}!",
      "",
      `Seu voucher **${template.name}** já está no portal da viagem.`,
      "",
      `Baixe por aqui: ${link}`,
    ].join("\n"),
    whatsappBody: [
      `Olá, {{primeiro_nome}}! Seu voucher *${template.name}* está disponível.`,
      "",
      `Portal da viagem: ${link}`,
    ].join("\n"),
    includeActions: false,
  };
  const r = await sendTransactional(prisma, { ...base, purpose: "VOUCHER" });
  if (!r.ok) await sendTransactional(prisma, { ...base, template: fallback });
}

/** Enfileira a emissão em lote. O mesmo lote (modelo + pessoas) não duplica. */
export async function enqueueVoucherJob(payload: VoucherJobPayload, uniqueKey: string) {
  return enqueueJob(prisma, {
    queue: VOUCHER_QUEUE,
    payload,
    uniqueKey,
    maxAttempts: 3,
  });
}

type ClaimedVoucherJob = { id: string; payload: unknown; attempts: number; maxAttempts: number };

/**
 * Consome a fila de vouchers (um job por vez, SKIP LOCKED). Seguro para
 * chamar de vários lugares: quem não conseguir reivindicar sai sem fazer nada.
 */
export async function processVoucherJobs(max = 3) {
  const lockedBy = `web:${randomUUID().slice(0, 8)}`;
  for (let i = 0; i < max; i++) {
    const [job] = await prisma.$queryRaw<ClaimedVoucherJob[]>`
      UPDATE "Job"
         SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${lockedBy},
             attempts = attempts + 1, "updatedAt" = now()
       WHERE id IN (
         SELECT id FROM "Job"
          WHERE status = 'PENDING' AND "runAt" <= now() AND queue = ${VOUCHER_QUEUE}
          ORDER BY "runAt", id
          LIMIT 1
          FOR UPDATE SKIP LOCKED)
      RETURNING id, payload, attempts, "maxAttempts"`;
    if (!job) return;
    await runVoucherJob(job, lockedBy);
  }
}

async function runVoucherJob(job: ClaimedVoucherJob, lockedBy: string) {
  const p = job.payload as VoucherJobPayload;
  const failed: string[] = [];
  let done = 0;
  try {
    const template = await prisma.documentTemplate.findFirst({
      where: { id: p.templateId, tenantId: p.tenantId, archivedAt: null },
      select: { id: true, name: true },
    });
    if (!template) throw new Error("Modelo de voucher não encontrado ou arquivado.");
    for (const registrationId of p.registrationIds) {
      try {
        const ok = await issueVoucher({ ...p, template, registrationId });
        if (!ok) failed.push(registrationId);
      } catch (err) {
        console.error("[vouchers] falha ao emitir", registrationId, err);
        failed.push(registrationId);
      }
      done++;
      if (done % 5 === 0) await saveProgress(job.id, lockedBy, { ...p, done, failed });
    }
    await prisma.job.updateMany({
      where: { id: job.id, lockedBy },
      data: {
        status: "DONE",
        lockedAt: null,
        lockedBy: "",
        lastError: failed.length ? `${failed.length} voucher(s) não emitido(s).` : "",
        payload: { ...p, done, failed } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
    const dead = job.attempts >= job.maxAttempts;
    await prisma.job.updateMany({
      where: { id: job.id, lockedBy },
      data: {
        status: dead ? "DEAD" : "PENDING",
        runAt: new Date(Date.now() + backoffDelayMs(job.attempts)),
        lockedAt: null,
        lockedBy: "",
        lastError: message,
      },
    });
  }
}

async function saveProgress(id: string, lockedBy: string, payload: VoucherJobPayload) {
  await prisma.job.updateMany({
    where: { id, lockedBy },
    data: { payload: payload as Prisma.InputJsonValue, lockedAt: new Date() },
  });
}

/** Lotes de vouchers do projeto (em andamento e o último concluído), para a tela. */
export async function voucherJobsOf(projectId: string) {
  const jobs = await prisma.job.findMany({
    where: { queue: VOUCHER_QUEUE, payload: { path: ["projectId"], equals: projectId } },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });
  return jobs.map((j) => {
    const p = j.payload as VoucherJobPayload;
    return {
      id: j.id,
      status: j.status,
      total: p.registrationIds?.length ?? 0,
      done: p.done ?? 0,
      failed: p.failed?.length ?? 0,
      lastError: j.lastError,
      updatedAt: j.updatedAt,
    };
  });
}
