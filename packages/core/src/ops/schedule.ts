/**
 * Tarefas periódicas do worker. Cada tarefa tem uma linha em `ScheduledTask`;
 * o worker que conseguir "reivindicar" a linha (horário vencido e sem trava
 * ativa) roda a tarefa daquela janela — os outros pulam. Assim, com vários
 * workers, cada janela roda uma vez só.
 */

export type TaskStatusName = "IDLE" | "RUNNING" | "OK" | "ERROR";

/** Próximo horário: sempre a partir do início desta execução, sem acumular atraso. */
export function nextRunAt(startedAt: Date, everyMs: number): Date {
  return new Date(startedAt.getTime() + everyMs);
}

/**
 * Trava da execução: se o processo morrer no meio, depois desse prazo outro
 * worker pode assumir. Nunca menor que 1 min nem maior que o intervalo + 1 min.
 */
export function taskLeaseMs(everyMs: number, timeoutMs?: number): number {
  const wanted = timeoutMs ?? Math.min(everyMs, 30 * 60_000);
  return Math.max(60_000, Math.min(wanted, everyMs + 60_000));
}

/** Tarefa que deveria ter rodado e não rodou (nenhum worker vivo, ou travada). */
export function isTaskLate(task: { nextRunAt: Date; everyMs: number }, now: Date): boolean {
  return now.getTime() - task.nextRunAt.getTime() > Math.max(2 * 60_000, task.everyMs);
}

export const TASK_LABELS: Record<string, string> = {
  "jobs.recover": "Recuperar jobs e entregas interrompidos",
  "flights.sweep": "Varredura de voos ao vivo",
  "domains.sweep": "Varredura de domínios",
  "ops.cleanup": "Limpeza diária",
};

export const taskLabel = (name: string) => TASK_LABELS[name] ?? name;
