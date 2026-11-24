import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@mais/db";
import { STALE_LOCK_ERROR, WORKER_STALE_MS } from "@mais/core/ops";

/**
 * Runner da tabela Job.
 *
 *  • Reivindicação com UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED):
 *    vários processos podem rodar ao mesmo tempo sem pegar o mesmo job.
 *  • Cada processo tem um `workerId` único; só quem travou finaliza o job.
 *  • Handler devolve { reschedule } para continuar depois (ritmo do WhatsApp)
 *    ou nada para concluir. Erro → nova tentativa com backoff; esgotou → DEAD.
 *  • Lease: o sinal de vida do worker renova `lockedAt` dos jobs em andamento.
 *    Trava vencida, ou dono sem sinal de vida (WorkerHeartbeat), devolve o job
 *    para PENDING — ou DEAD, se a tentativa interrompida era a última.
 *  • stop() espera os jobs em andamento terminarem (SIGTERM do deploy); se o
 *    prazo acabar, devolve à fila o que ainda estiver rodando.
 */

export type ClaimedJob = {
  id: string;
  queue: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};
export type JobHandler = (
  payload: unknown,
  job: ClaimedJob,
) => Promise<{ reschedule?: Date } | void>;

export type Logger = Pick<Console, "info" | "warn" | "error">;

export type RunnerOptions = {
  db: PrismaClient;
  handlers: Record<string, JobHandler>;
  workerId?: string;
  concurrency?: number;
  pollIntervalMs?: number;
  /** Job RUNNING sem renovar a trava há mais tempo que isso é considerado abandonado */
  lockTimeoutMs?: number;
  /** Dono sem sinal de vida há mais que isso → seus jobs são devolvidos */
  workerStaleMs?: number;
  logger?: Logger;
};

export const newWorkerId = () => `${hostname()}:${process.pid}:${randomBytes(3).toString("hex")}`;

/** Backoff exponencial com variação aleatória: 5s, 10s, 20s… até 15 min. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(15 * 60_000, 5_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + random() * 0.4));
}

export class JobRunner {
  readonly workerId: string;
  private readonly db: PrismaClient;
  private readonly handlers: Record<string, JobHandler>;
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly lockTimeoutMs: number;
  private readonly workerStaleMs: number;
  private readonly log: Logger;
  private readonly inFlight = new Set<Promise<void>>();
  private running = false;
  private loop: Promise<void> | null = null;
  private wake: (() => void) | null = null;

  constructor(o: RunnerOptions) {
    this.db = o.db;
    this.handlers = o.handlers;
    this.workerId = o.workerId ?? newWorkerId();
    this.concurrency = Math.max(1, o.concurrency ?? 4);
    this.pollIntervalMs = o.pollIntervalMs ?? 1000;
    this.lockTimeoutMs = o.lockTimeoutMs ?? 10 * 60_000;
    this.workerStaleMs = o.workerStaleMs ?? WORKER_STALE_MS;
    this.log = o.logger ?? console;
  }

  /** Filas que este worker atende (vão no sinal de vida). */
  get queues(): string[] {
    return Object.keys(this.handlers);
  }

  /** Jobs em execução neste processo agora. */
  get busy(): number {
    return this.inFlight.size;
  }

  /** Reivindica até `limit` jobs prontos das filas que este worker conhece. */
  async claim(limit: number): Promise<ClaimedJob[]> {
    if (limit <= 0) return [];
    return this.db.$queryRaw<ClaimedJob[]>`
      UPDATE "Job"
         SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${this.workerId},
             attempts = attempts + 1, "updatedAt" = now()
       WHERE id IN (
         SELECT id FROM "Job"
          WHERE status = 'PENDING' AND "runAt" <= now() AND queue = ANY(${this.queues})
          ORDER BY "runAt", id
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED)
      RETURNING id, queue, payload, attempts, "maxAttempts"`;
  }

  private async complete(job: ClaimedJob, reschedule?: Date) {
    if (reschedule) {
      await this.db.$executeRaw`
        UPDATE "Job" SET status = 'PENDING', "runAt" = ${reschedule}, attempts = 0,
               "lockedAt" = NULL, "lockedBy" = '', "lastError" = '', "updatedAt" = now()
         WHERE id = ${job.id} AND "lockedBy" = ${this.workerId}`;
      return;
    }
    await this.db.$executeRaw`
      UPDATE "Job" SET status = 'DONE', "lockedAt" = NULL, "lockedBy" = '', "lastError" = '', "updatedAt" = now()
       WHERE id = ${job.id} AND "lockedBy" = ${this.workerId}`;
  }

  private async failJob(job: ClaimedJob, error: unknown) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
    if (job.attempts >= job.maxAttempts) {
      this.log.error(
        `[worker] job ${job.queue} ${job.id} esgotou ${job.attempts} tentativas: ${message}`,
      );
      await this.db.$executeRaw`
        UPDATE "Job" SET status = 'DEAD', "lockedAt" = NULL, "lockedBy" = '', "lastError" = ${message}, "updatedAt" = now()
         WHERE id = ${job.id} AND "lockedBy" = ${this.workerId}`;
      return;
    }
    const runAt = new Date(Date.now() + backoffMs(job.attempts));
    this.log.warn(
      `[worker] job ${job.queue} ${job.id} falhou (tentativa ${job.attempts}); nova tentativa às ${runAt.toISOString()}: ${message}`,
    );
    await this.db.$executeRaw`
      UPDATE "Job" SET status = 'PENDING', "runAt" = ${runAt}, "lockedAt" = NULL, "lockedBy" = '',
             "lastError" = ${message}, "updatedAt" = now()
       WHERE id = ${job.id} AND "lockedBy" = ${this.workerId}`;
  }

  private async execute(job: ClaimedJob) {
    const handler = this.handlers[job.queue];
    if (!handler) return this.failJob(job, new Error(`Fila sem handler: ${job.queue}`));
    try {
      const out = await handler(job.payload, job);
      await this.complete(job, out?.reschedule);
    } catch (e) {
      await this.failJob(job, e);
    }
  }

  /**
   * Devolve à fila jobs travados por processos que morreram: trava não renovada
   * há mais de `lockTimeoutMs`, ou dono sem sinal de vida (ou encerrado). Se a
   * tentativa interrompida era a última, o job vira DEAD em vez de voltar.
   */
  async reclaimStale(): Promise<number> {
    const lockCutoff = new Date(Date.now() - this.lockTimeoutMs);
    const deadCutoff = new Date(Date.now() - this.workerStaleMs);
    return this.db.$executeRaw`
      WITH stale AS (
        SELECT j.id FROM "Job" j
         WHERE j.status = 'RUNNING'
           AND j."lockedBy" <> ${this.workerId}
           AND (j."lockedAt" IS NULL OR j."lockedAt" < ${lockCutoff}
                OR j."lockedBy" IN (SELECT "workerId" FROM "WorkerHeartbeat"
                                     WHERE "stoppedAt" IS NOT NULL OR "lastSeenAt" < ${deadCutoff}))
         FOR UPDATE SKIP LOCKED)
      UPDATE "Job" j
         SET status = CASE WHEN j.attempts >= j."maxAttempts" THEN 'DEAD'::"JobStatus"
                           ELSE 'PENDING'::"JobStatus" END,
             "lockedAt" = NULL, "lockedBy" = '', "lastError" = ${STALE_LOCK_ERROR}, "updatedAt" = now()
        FROM stale WHERE j.id = stale.id`;
  }

  /** Renova a trava dos jobs deste processo (chamado pelo sinal de vida). */
  async renewLeases(): Promise<number> {
    if (this.inFlight.size === 0) return 0;
    return this.db.$executeRaw`
      UPDATE "Job" SET "lockedAt" = now()
       WHERE status = 'RUNNING' AND "lockedBy" = ${this.workerId}`;
  }

  /**
   * Devolve à fila, na hora, os jobs que este processo ainda segura (prazo do
   * desligamento esgotado). A tentativa interrompida não conta.
   */
  async releaseOwned(): Promise<number> {
    return this.db.$executeRaw`
      UPDATE "Job" SET status = 'PENDING', "runAt" = now(), "lockedAt" = NULL, "lockedBy" = '',
             attempts = GREATEST(attempts - 1, 0),
             "lastError" = 'Interrompido no desligamento do worker; volta para a fila.', "updatedAt" = now()
       WHERE status = 'RUNNING' AND "lockedBy" = ${this.workerId}`;
  }

  /** Uma rodada: reivindica o que couber e espera terminar. Útil em testes e scripts. */
  async runOnce(): Promise<number> {
    const jobs = await this.claim(this.concurrency);
    await Promise.all(jobs.map((j) => this.execute(j)));
    return jobs.length;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.log.info(`[worker] ${this.workerId} ouvindo: ${this.queues.join(", ")}`);
    this.loop = (async () => {
      while (this.running) {
        try {
          const free = this.concurrency - this.inFlight.size;
          const jobs = await this.claim(free);
          for (const job of jobs) {
            const p = this.execute(job).finally(() => this.inFlight.delete(p));
            this.inFlight.add(p);
          }
          if (jobs.length && jobs.length === free) continue; // há mais trabalho: sem espera
        } catch (e) {
          this.log.error("[worker] erro ao buscar jobs:", e);
        }
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, this.pollIntervalMs);
          this.wake = () => {
            clearTimeout(t);
            resolve();
          };
        });
      }
    })();
  }

  /**
   * Para de buscar e espera os jobs em andamento terminarem. Com `timeoutMs`,
   * depois do prazo devolve à fila o que sobrou e responde quantos foram.
   */
  async stop(o: { timeoutMs?: number } = {}): Promise<{ released: number }> {
    this.running = false;
    this.wake?.();
    await this.loop;
    const all = Promise.allSettled([...this.inFlight]).then(() => true);
    if (o.timeoutMs === undefined) {
      await all;
      return { released: 0 };
    }
    let timer: NodeJS.Timeout | undefined;
    const finished = await Promise.race([
      all,
      new Promise<false>((r) => (timer = setTimeout(() => r(false), o.timeoutMs))),
    ]);
    clearTimeout(timer);
    if (finished) return { released: 0 };
    const released = await this.releaseOwned();
    this.log.warn(
      `[worker] prazo de desligamento esgotado: ${released} job(s) devolvido(s) à fila`,
    );
    return { released };
  }
}
