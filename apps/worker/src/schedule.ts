import type { Prisma, PrismaClient } from "@mais/db";
import { taskLeaseMs } from "@mais/core/ops";
import type { Logger } from "./runner";

/**
 * Agendador de tarefas periódicas, seguro com vários workers ao mesmo tempo.
 *
 * Cada tarefa tem uma linha em `ScheduledTask`. A cada volta, o worker tenta
 * reivindicá-la com um único comando atômico (INSERT … ON CONFLICT DO UPDATE
 * … WHERE horário vencido e sem trava ativa). Só um worker consegue por
 * janela; os outros pulam. A trava (`lockedUntil`) cobre o processo que morre
 * no meio: vencida, outro worker assume na próxima volta.
 *
 * Os horários usam o relógio do banco (now()), nunca o de cada máquina.
 */

export type TaskResult = Prisma.InputJsonValue | void;

export type ScheduledTaskDef = {
  name: string;
  everyMs: number;
  /** Trava da execução; padrão: o intervalo, entre 1 e 30 min. */
  timeoutMs?: number;
  run: () => Promise<TaskResult>;
};

export type SchedulerOptions = {
  db: PrismaClient;
  workerId: string;
  tasks: ScheduledTaskDef[];
  /** Frequência com que cada worker confere se há tarefa vencida. */
  tickMs?: number;
  logger?: Logger;
};

export class Scheduler {
  private readonly db: PrismaClient;
  private readonly workerId: string;
  private readonly tasks: ScheduledTaskDef[];
  private readonly tickMs: number;
  private readonly log: Logger;
  private readonly running = new Map<string, Promise<void>>();
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(o: SchedulerOptions) {
    this.db = o.db;
    this.workerId = o.workerId;
    this.tasks = o.tasks;
    this.tickMs = o.tickMs ?? 15_000;
    this.log = o.logger ?? console;
    const names = new Set(o.tasks.map((t) => t.name));
    if (names.size !== o.tasks.length) throw new Error("Tarefas periódicas com nome repetido.");
  }

  get taskNames(): string[] {
    return this.tasks.map((t) => t.name);
  }

  /** Tenta reivindicar a janela da tarefa. true = este worker roda agora. */
  async claim(task: ScheduledTaskDef): Promise<boolean> {
    const lease = taskLeaseMs(task.everyMs, task.timeoutMs);
    const rows = await this.db.$queryRaw<{ name: string }[]>`
      INSERT INTO "ScheduledTask" (name, "everyMs", "nextRunAt", "lockedBy", "lockedUntil", status,
                                   "lastStartedAt", "lastWorkerId", "updatedAt")
      VALUES (${task.name}, ${task.everyMs}, now() + ${task.everyMs}::int * interval '1 millisecond',
              ${this.workerId}, now() + ${lease}::int * interval '1 millisecond', 'RUNNING',
              now(), ${this.workerId}, now())
      ON CONFLICT (name) DO UPDATE SET
        "everyMs" = EXCLUDED."everyMs",
        "nextRunAt" = EXCLUDED."nextRunAt",
        "lockedBy" = EXCLUDED."lockedBy",
        "lockedUntil" = EXCLUDED."lockedUntil",
        status = 'RUNNING',
        "lastStartedAt" = now(),
        "lastWorkerId" = EXCLUDED."lastWorkerId",
        "updatedAt" = now()
      WHERE "ScheduledTask"."nextRunAt" <= now()
        AND ("ScheduledTask"."lockedUntil" IS NULL OR "ScheduledTask"."lockedUntil" < now())
      RETURNING name`;
    return rows.length > 0;
  }

  private async finish(
    task: ScheduledTaskDef,
    startedAt: number,
    result: TaskResult,
    error?: unknown,
  ) {
    const message = error
      ? (error instanceof Error ? error.message : String(error)).slice(0, 2000)
      : "";
    await this.db.scheduledTask.updateMany({
      where: { name: task.name, lockedBy: this.workerId },
      data: {
        status: error ? "ERROR" : "OK",
        lockedBy: "",
        lockedUntil: null,
        lastFinishedAt: new Date(),
        lastDurationMs: Date.now() - startedAt,
        lastError: message,
        ...(error ? {} : { lastResult: result ?? {} }),
      },
    });
  }

  /** Roda a tarefa se este worker ganhar a janela. Devolve se rodou. */
  async runIfDue(task: ScheduledTaskDef): Promise<boolean> {
    if (this.running.has(task.name) || this.stopped) return false;
    if (!(await this.claim(task))) return false;
    const p = (async () => {
      const startedAt = Date.now();
      try {
        const result = await task.run();
        await this.finish(task, startedAt, result);
      } catch (e) {
        this.log.error(`[worker] tarefa ${task.name} falhou:`, e);
        await this.finish(task, startedAt, undefined, e).catch(() => {});
      }
    })().finally(() => this.running.delete(task.name));
    this.running.set(task.name, p);
    await p;
    return true;
  }

  /** Uma volta: confere todas as tarefas (em paralelo; cada uma no máximo uma vez). */
  async tick(): Promise<string[]> {
    const ran: string[] = [];
    await Promise.all(
      this.tasks.map(async (t) => {
        try {
          if (await this.runIfDue(t)) ran.push(t.name);
        } catch (e) {
          this.log.error(`[worker] agendador: erro ao reivindicar ${t.name}:`, e);
        }
      }),
    );
    return ran;
  }

  start() {
    if (this.timer || this.stopped) return;
    this.log.info(`[worker] agendador: ${this.taskNames.join(", ")}`);
    const loop = () => {
      if (this.stopped) return;
      // Não espera as tarefas longas (limpeza) para conferir as curtas
      for (const t of this.tasks)
        if (!this.running.has(t.name))
          void this.runIfDue(t).catch((e) =>
            this.log.error(`[worker] agendador: erro ao reivindicar ${t.name}:`, e),
          );
    };
    loop();
    this.timer = setInterval(loop, this.tickMs);
  }

  /**
   * Para de agendar e espera as tarefas em andamento até o prazo. O que não
   * terminar tem a trava liberada para outro worker assumir na hora.
   */
  async stop(timeoutMs = 30_000): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.running.size === 0) return;
    let timer: NodeJS.Timeout | undefined;
    const finished = await Promise.race([
      Promise.allSettled([...this.running.values()]).then(() => true),
      new Promise<false>((r) => (timer = setTimeout(() => r(false), timeoutMs))),
    ]);
    clearTimeout(timer);
    if (finished) return;
    const names = [...this.running.keys()];
    await this.db.scheduledTask.updateMany({
      where: { name: { in: names }, lockedBy: this.workerId },
      data: {
        status: "ERROR",
        lockedBy: "",
        lockedUntil: null,
        nextRunAt: new Date(),
        lastError: "Interrompida no desligamento do worker.",
      },
    });
    this.log.warn(`[worker] tarefas interrompidas no desligamento: ${names.join(", ")}`);
  }
}
