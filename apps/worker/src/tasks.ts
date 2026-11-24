import type { PrismaClient } from "@mais/db";
import { recoverStaleDeliveries, sweepAutomations } from "@mais/messaging";
import type { CleanupConfig } from "@mais/core/ops";
import { runCleanup } from "./cleanup";
import { sweepDomains } from "./domains";
import { sweepLiveFlights } from "./flights";
import type { JobRunner, Logger } from "./runner";
import type { ScheduledTaskDef } from "./schedule";

const MIN = 60_000;

/**
 * Tarefas periódicas do worker (registradas no agendador em index.ts).
 * Cada janela roda em UM worker só, mesmo com vários processos no ar.
 */
export function defaultScheduledTasks(o: {
  db: PrismaClient;
  runner: JobRunner;
  cleanup: CleanupConfig;
  /** Status de voo ao vivo só com o token da Apify */
  flightsEnabled: boolean;
  logger?: Logger;
}): ScheduledTaskDef[] {
  const { db, runner } = o;
  const log = o.logger ?? console;
  const tasks: ScheduledTaskDef[] = [
    {
      // Devolve jobs de processos que morreram e fecha entregas presas
      name: "jobs.recover",
      everyMs: MIN,
      run: async () => {
        const jobs = await runner.reclaimStale();
        const deliveries = await recoverStaleDeliveries(db);
        if (jobs || deliveries)
          log.warn(
            `[worker] manutenção: ${jobs} job(s) liberado(s), ${deliveries} entrega(s) interrompida(s)`,
          );
        return { jobs, deliveries };
      },
    },
    {
      // Réguas por data (D-1, pós-evento, voos, documentos); o envio tem dedupe próprio
      name: "automations.sweep",
      everyMs: 5 * MIN,
      run: async () => {
        const enqueued = await sweepAutomations(db);
        if (enqueued) log.info(`[worker] ${enqueued} disparo(s) de régua enfileirado(s)`);
        return { enqueued };
      },
    },
    {
      // Domínios próprios: pendentes a cada 5 min, verificados uma vez por dia
      name: "domains.sweep",
      everyMs: 5 * MIN,
      run: async () => {
        const enqueued = await sweepDomains(db);
        if (enqueued)
          log.info(`[worker] ${enqueued} domínio(s) enviado(s) para verificação de DNS`);
        return { enqueued };
      },
    },
    {
      name: "ops.cleanup",
      everyMs: 24 * 60 * MIN,
      timeoutMs: 30 * MIN,
      run: async () => ({ ...(await runCleanup(db, o.cleanup, new Date(), log)) }),
    },
  ];
  if (o.flightsEnabled)
    tasks.push({
      // Voos perto da partida ou em andamento
      name: "flights.sweep",
      everyMs: 5 * MIN,
      run: async () => ({ projects: await sweepLiveFlights(db) }),
    });
  return tasks;
}
