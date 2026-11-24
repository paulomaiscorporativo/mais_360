/**
 * Regras da fila de jobs vistas pela operação: atraso, falhas, recuperação de
 * jobs abandonados e o que pode ser repetido ou descartado.
 */

export type JobStatusName = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "DEAD";

/** PENDING com horário vencido há mais que isso conta como atrasado. */
export const JOB_OVERDUE_MS = 5 * 60_000;

export function isJobOverdue(
  job: { status: JobStatusName; runAt: Date },
  now: Date,
  thresholdMs = JOB_OVERDUE_MS,
): boolean {
  return job.status === "PENDING" && now.getTime() - job.runAt.getTime() > thresholdMs;
}

/** Falhas definitivas: o worker desistiu e só uma pessoa resolve. */
export const FAILED_JOB_STATUSES = ["FAILED", "DEAD"] as const satisfies JobStatusName[];

export const isFailedJob = (status: JobStatusName) =>
  (FAILED_JOB_STATUSES as readonly JobStatusName[]).includes(status);

/** "Tentar de novo" e "Descartar" só valem para falhas definitivas. */
export function jobActionProblem(
  status: JobStatusName,
  action: "retry" | "discard",
): string | null {
  if (isFailedJob(status)) return null;
  if (status === "RUNNING") return "Este job está em execução agora. Aguarde ele terminar.";
  if (status === "DONE") return "Este job já foi concluído.";
  return action === "retry"
    ? "Este job já está na fila e vai rodar no horário previsto."
    : "Só jobs com falha definitiva podem ser descartados.";
}

/**
 * Job travado por um processo que morreu: volta para a fila se ainda tem
 * tentativas; senão, vira falha definitiva (a tentativa interrompida conta).
 */
export function staleJobOutcome(job: {
  attempts: number;
  maxAttempts: number;
}): "PENDING" | "DEAD" {
  return job.attempts >= job.maxAttempts ? "DEAD" : "PENDING";
}

export const STALE_LOCK_ERROR = "Trava expirada: o processo que executava este job parou.";

/** Nomes das filas para quem opera (a fila sem nome conhecido aparece crua). */
export const QUEUE_LABELS: Record<string, string> = {
  "messaging.campaign.tick": "Campanhas (ritmo de envio)",
  "messaging.delivery.send": "Mensagens transacionais",
  "flights.refresh": "Status de voos",
  "domains.verify": "Verificação de domínios",
  "auth.email": "E-mails de acesso",
  "vouchers.issue": "Emissão de vouchers",
};

export const queueLabel = (queue: string) => QUEUE_LABELS[queue] ?? queue;
