import type { PrismaClient } from "@mais/db";
import { cleanupConfigFromEnv } from "@mais/core/ops";
import { Heartbeat } from "./heartbeat";
import type { JobRunner, Logger } from "./runner";
import { Scheduler, type ScheduledTaskDef } from "./schedule";
import { defaultScheduledTasks } from "./tasks";

/**
 * Operação do worker: sinal de vida, agendador de tarefas periódicas e
 * desligamento gracioso. Registrado em index.ts com uma chamada.
 *
 * Desligamento (SIGTERM do Docker): para de pegar jobs e tarefas, espera os
 * que estão em andamento até WORKER_SHUTDOWN_TIMEOUT_MS, devolve à fila o que
 * sobrar, libera as travas e marca a instância como encerrada.
 */
export function startOperations(o: {
  db: PrismaClient;
  runner: JobRunner;
  flightsEnabled: boolean;
  /** Tarefas extras de outras frentes (réguas etc.) */
  extraTasks?: ScheduledTaskDef[];
  env?: Record<string, string | undefined>;
  logger?: Logger;
}) {
  const env = o.env ?? process.env;
  const log = o.logger ?? console;
  const shutdownMs = Math.max(1_000, Number(env.WORKER_SHUTDOWN_TIMEOUT_MS || 45_000));

  const heartbeat = new Heartbeat({
    db: o.db,
    workerId: o.runner.workerId,
    queues: () => o.runner.queues,
    renewLeases: () => o.runner.renewLeases(),
    logger: log,
  });
  const scheduler = new Scheduler({
    db: o.db,
    workerId: o.runner.workerId,
    tasks: [
      ...defaultScheduledTasks({
        db: o.db,
        runner: o.runner,
        cleanup: cleanupConfigFromEnv(env),
        flightsEnabled: o.flightsEnabled,
        logger: log,
      }),
      ...(o.extraTasks ?? []),
    ],
    logger: log,
  });
  heartbeat.start();
  scheduler.start();

  return {
    heartbeat,
    scheduler,
    /** Devolve o código de saída: 0 se tudo terminou no prazo. */
    async shutdown(): Promise<number> {
      const deadline = Date.now() + shutdownMs;
      const remaining = () => Math.max(1_000, deadline - Date.now());
      const [jobs] = await Promise.all([
        o.runner.stop({ timeoutMs: remaining() }),
        scheduler.stop(remaining()),
      ]);
      await heartbeat.stop();
      log.info(
        jobs.released
          ? `[worker] encerrado; ${jobs.released} job(s) devolvido(s) à fila.`
          : "[worker] encerrado sem pendências.",
      );
      return jobs.released ? 1 : 0;
    },
  };
}
