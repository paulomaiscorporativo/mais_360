import { z } from "zod";

/**
 * Retenção da limpeza periódica do worker. Cada prazo pode ser ajustado por
 * variável de ambiente; `AuditLog` e `MessageDelivery` nunca são apagados.
 */

const DAY = 86_400_000;

const days = (fallback: number) =>
  z.preprocess(
    (v) => (v === undefined || v === "" ? fallback : Number(v)),
    z.number().int().min(1).max(3650),
  );

export const cleanupConfigSchema = z.object({
  /** Sessões vencidas ou revogadas há mais que isso. */
  sessionDays: days(30),
  /** Convites e links de acesso usados, revogados ou vencidos há mais que isso. */
  tokenDays: days(30),
  /** Jobs concluídos. */
  jobDoneDays: days(14),
  /** Jobs com falha definitiva (FAILED/DEAD). */
  jobFailedDays: days(60),
  /** Sinais de vida de workers que pararam. */
  heartbeatDays: days(7),
  batchSize: z.preprocess(
    (v) => (v === undefined || v === "" ? 1000 : Number(v)),
    z.number().int().min(10).max(50_000),
  ),
});

export type CleanupConfig = z.infer<typeof cleanupConfigSchema>;

/** Lê as variáveis CLEANUP_*; valor inválido derruba o worker na partida, com o motivo. */
export function cleanupConfigFromEnv(env: Record<string, string | undefined>): CleanupConfig {
  const parsed = cleanupConfigSchema.safeParse({
    sessionDays: env.CLEANUP_SESSION_DAYS,
    tokenDays: env.CLEANUP_TOKEN_DAYS,
    jobDoneDays: env.CLEANUP_JOB_DONE_DAYS,
    jobFailedDays: env.CLEANUP_JOB_FAILED_DAYS,
    heartbeatDays: env.CLEANUP_HEARTBEAT_DAYS,
    batchSize: env.CLEANUP_BATCH_SIZE,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuração de limpeza inválida (CLEANUP_*): ${fields}`);
  }
  return parsed.data;
}

export type CleanupCutoffs = {
  session: Date;
  token: Date;
  jobDone: Date;
  jobFailed: Date;
  heartbeat: Date;
};

export function cleanupCutoffs(config: CleanupConfig, now: Date): CleanupCutoffs {
  const ago = (d: number) => new Date(now.getTime() - d * DAY);
  return {
    session: ago(config.sessionDays),
    token: ago(config.tokenDays),
    jobDone: ago(config.jobDoneDays),
    jobFailed: ago(config.jobFailedDays),
    heartbeat: ago(config.heartbeatDays),
  };
}
