import "server-only";
import { Prisma } from "@mais/db";
import {
  isTaskLate,
  isWorkerAlive,
  JOB_OVERDUE_MS,
  maskPhone,
  maskEmail,
  maskText,
  payloadSummary,
  unservedQueues,
  WORKER_VISIBLE_MS,
  workerFleet,
  workerState,
  type JobStatusName,
  type WorkerState,
} from "@mais/core/ops";
import { prisma } from "./db";

/**
 * Painel de operação da plataforma (/console/plataforma/operacao): leitura
 * entre clientes, só para a equipe da plataforma. Nada de dado pessoal ou
 * segredo sai daqui sem máscara (payloads, erros, destinatários).
 */

export const JOB_VIEWS = ["falhas", "repetindo", "atrasados", "rodando"] as const;
export type JobView = (typeof JOB_VIEWS)[number];

export type OperationsFilters = {
  view: JobView;
  queue: string | null;
  tenantId: string | null;
};

const ROW_LIMIT = 50;

/** Resolve o cliente do job pelo payload (tenantId, projeto, campanha, entrega, domínio). */
const JOB_TENANT_JOINS = Prisma.sql`
  LEFT JOIN "Project" p ON p.id = j.payload->>'projectId'
  LEFT JOIN "MessageCampaign" c ON c.id = j.payload->>'campaignId'
  LEFT JOIN "MessageDelivery" d ON d.id = j.payload->>'deliveryId'
  LEFT JOIN "TenantDomain" td ON td.id = j.payload->>'domainId'`;
const JOB_TENANT_ID = Prisma.sql`COALESCE(j.payload->>'tenantId', p."tenantId", c."tenantId", d."tenantId", td."tenantId")`;

function viewWhere(view: JobView, now: Date): Prisma.Sql {
  switch (view) {
    case "falhas":
      return Prisma.sql`j.status IN ('FAILED', 'DEAD')`;
    case "repetindo":
      return Prisma.sql`j.status = 'PENDING' AND j.attempts > 0 AND j."lastError" <> ''`;
    case "atrasados":
      return Prisma.sql`j.status = 'PENDING' AND j."runAt" < ${new Date(now.getTime() - JOB_OVERDUE_MS)}`;
    case "rodando":
      return Prisma.sql`j.status = 'RUNNING'`;
  }
}

type JobRow = {
  id: string;
  queue: string;
  status: JobStatusName;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  updatedAt: Date;
  lockedBy: string;
  lastError: string;
  payload: unknown;
  tenantId: string | null;
};

export type WorkerView = {
  workerId: string;
  hostname: string;
  pid: number;
  version: string;
  queues: string[];
  startedAt: string;
  lastSeenAt: string;
  state: WorkerState;
};

export type JobItem = {
  id: string;
  queue: string;
  status: JobStatusName;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  updatedAt: string;
  error: string;
  payload: string;
  tenant: { name: string; href: string } | null;
};

export async function loadOperations(filters: OperationsFilters, now = new Date()) {
  const visibleSince = new Date(now.getTime() - WORKER_VISIBLE_MS);
  const where: Prisma.Sql[] = [viewWhere(filters.view, now)];
  if (filters.queue) where.push(Prisma.sql`j.queue = ${filters.queue}`);
  if (filters.tenantId) where.push(Prisma.sql`${JOB_TENANT_ID} = ${filters.tenantId}`);
  const order =
    filters.view === "atrasados" ? Prisma.sql`j."runAt" ASC` : Prisma.sql`j."updatedAt" DESC`;
  const since7d = new Date(now.getTime() - 7 * 86_400_000);

  const [heartbeats, byQueue, due, jobs, tasks, deliveryByChannel, deliveries, tenants] =
    await Promise.all([
      prisma.workerHeartbeat.findMany({
        where: { lastSeenAt: { gte: visibleSince } },
        orderBy: [{ stoppedAt: { sort: "asc", nulls: "first" } }, { lastSeenAt: "desc" }],
      }),
      prisma.job.groupBy({ by: ["queue", "status"], _count: { _all: true } }),
      prisma.$queryRaw<{ queue: string; due: number; overdue: number }[]>`
        SELECT queue, count(*)::int AS due,
               count(*) FILTER (WHERE "runAt" < ${new Date(now.getTime() - JOB_OVERDUE_MS)})::int AS overdue
          FROM "Job" WHERE status = 'PENDING' AND "runAt" <= ${now} GROUP BY queue`,
      prisma.$queryRaw<JobRow[]>`
        SELECT j.id, j.queue, j.status::text AS status, j.attempts, j."maxAttempts", j."runAt",
               j."updatedAt", j."lockedBy", j."lastError", j.payload, ${JOB_TENANT_ID} AS "tenantId"
          FROM "Job" j ${JOB_TENANT_JOINS}
         WHERE ${Prisma.join(where, " AND ")}
         ORDER BY ${order}
         LIMIT ${ROW_LIMIT}`,
      prisma.scheduledTask.findMany({ orderBy: { name: "asc" } }),
      prisma.messageDelivery.groupBy({
        by: ["channel"],
        where: { status: "FAILED", updatedAt: { gte: since7d } },
        _count: { _all: true },
      }),
      prisma.messageDelivery.findMany({
        where: {
          status: "FAILED",
          updatedAt: { gte: since7d },
          ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          tenantId: true,
          campaignId: true,
          channel: true,
          target: true,
          error: true,
          attempts: true,
          updatedAt: true,
        },
      }),
      prisma.tenant.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          workspace: { select: { slug: true, name: true } },
        },
      }),
    ]);

  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const tenantLink = (id: string | null, path = "") => {
    const t = id ? tenantById.get(id) : undefined;
    return t
      ? { name: t.name, href: `/console/${t.workspace.slug}/clientes/${t.slug}${path}` }
      : null;
  };

  const fleet = workerFleet(
    heartbeats.map((h) => ({ ...h, queues: h.queues })),
    now,
  );
  const dueByQueue = new Map(due.map((d) => [d.queue, d.due]));

  // Contagem por fila e status
  const queues = new Map<string, Record<JobStatusName, number> & { overdue: number }>();
  const blank = () => ({ PENDING: 0, RUNNING: 0, DONE: 0, FAILED: 0, DEAD: 0, overdue: 0 });
  for (const g of byQueue) {
    const q = queues.get(g.queue) ?? blank();
    q[g.status] = g._count._all;
    queues.set(g.queue, q);
  }
  for (const d of due) {
    const q = queues.get(d.queue) ?? blank();
    q.overdue = d.overdue;
    queues.set(d.queue, q);
  }

  const totals = { failed: 0, overdue: 0, running: 0, pending: 0 };
  for (const q of queues.values()) {
    totals.failed += q.FAILED + q.DEAD;
    totals.overdue += q.overdue;
    totals.running += q.RUNNING;
    totals.pending += q.PENDING;
  }

  return {
    now: now.toISOString(),
    fleet: {
      alive: fleet.alive,
      down: fleet.down,
      lastSeenAt: fleet.lastSeenAt?.toISOString() ?? null,
      everSeen: heartbeats.length > 0,
      unserved: unservedQueues(dueByQueue, fleet),
    },
    workers: heartbeats.map((h): WorkerView => ({
      workerId: h.workerId,
      hostname: h.hostname,
      pid: h.pid,
      version: h.version,
      queues: h.queues,
      startedAt: h.startedAt.toISOString(),
      lastSeenAt: h.lastSeenAt.toISOString(),
      state: workerState(h, now),
    })),
    aliveCount: heartbeats.filter((h) => isWorkerAlive(workerState(h, now))).length,
    totals,
    queues: [...queues.entries()]
      .map(([queue, c]) => ({ queue, ...c, served: fleet.servedQueues.has(queue) }))
      .sort((a, b) => a.queue.localeCompare(b.queue)),
    jobs: jobs.map((j): JobItem => ({
      id: j.id,
      queue: j.queue,
      status: j.status,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      runAt: j.runAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
      error: maskText(j.lastError, 400),
      payload: payloadSummary(j.payload),
      tenant: tenantLink(j.tenantId),
    })),
    jobsTruncated: jobs.length === ROW_LIMIT,
    tasks: tasks.map((t) => ({
      name: t.name,
      everyMs: t.everyMs,
      status: t.status,
      nextRunAt: t.nextRunAt.toISOString(),
      lastStartedAt: t.lastStartedAt?.toISOString() ?? null,
      lastFinishedAt: t.lastFinishedAt?.toISOString() ?? null,
      lastDurationMs: t.lastDurationMs,
      lastError: maskText(t.lastError, 300),
      late: isTaskLate(t, now),
    })),
    deliveries: {
      byChannel: Object.fromEntries(
        deliveryByChannel.map((g) => [g.channel, g._count._all]),
      ) as Partial<Record<"EMAIL" | "WHATSAPP", number>>,
      recent: deliveries.map((d) => ({
        id: d.id,
        channel: d.channel,
        target: d.channel === "EMAIL" ? maskEmail(d.target) : maskPhone(d.target),
        error: maskText(d.error, 300),
        attempts: d.attempts,
        updatedAt: d.updatedAt.toISOString(),
        tenant: tenantLink(
          d.tenantId,
          d.campaignId ? `/comunicacao/campanhas/${d.campaignId}` : "/comunicacao",
        ),
      })),
    },
    tenants: tenants.map((t) => ({ id: t.id, label: `${t.name} · ${t.workspace.name}` })),
  };
}

export type OperationsData = Awaited<ReturnType<typeof loadOperations>>;
