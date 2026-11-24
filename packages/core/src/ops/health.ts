/**
 * Saúde do worker a partir dos sinais de vida (`WorkerHeartbeat`).
 *
 * Cada instância grava o sinal a cada ~30 s. Sem sinal há mais de 2 min, a
 * instância é considerada parada (o processo morreu ou travou). Instâncias
 * encerradas com SIGTERM gravam `stoppedAt` e saem da conta na hora.
 */

/** Intervalo entre sinais de vida de cada worker. */
export const HEARTBEAT_INTERVAL_MS = 30_000;
/** Sem sinal há mais que isso → a instância é dada como parada. */
export const WORKER_STALE_MS = 2 * 60_000;
/** Instâncias paradas aparecem no painel por este tempo; depois somem. */
export const WORKER_VISIBLE_MS = 24 * 3_600_000;

export type WorkerState = "ALIVE" | "LATE" | "STOPPED" | "LOST";

export type HeartbeatView = {
  workerId: string;
  lastSeenAt: Date;
  stoppedAt: Date | null;
  queues: string[];
};

/**
 * ALIVE: sinal recente · LATE: perdeu um ou dois sinais (ainda dentro dos 2 min)
 * STOPPED: encerrou de forma graciosa · LOST: sumiu sem avisar.
 */
export function workerState(
  hb: Pick<HeartbeatView, "lastSeenAt" | "stoppedAt">,
  now: Date,
): WorkerState {
  if (hb.stoppedAt) return "STOPPED";
  const age = now.getTime() - hb.lastSeenAt.getTime();
  if (age > WORKER_STALE_MS) return "LOST";
  if (age > HEARTBEAT_INTERVAL_MS * 2) return "LATE";
  return "ALIVE";
}

export const isWorkerAlive = (state: WorkerState) => state === "ALIVE" || state === "LATE";

export type WorkerFleet = {
  alive: number;
  /** Nenhuma instância viva: nada está sendo processado em segundo plano. */
  down: boolean;
  /** Último sinal de qualquer instância (para "sem sinal desde …"). */
  lastSeenAt: Date | null;
  /** Filas atendidas por pelo menos uma instância viva. */
  servedQueues: Set<string>;
};

export function workerFleet(heartbeats: HeartbeatView[], now: Date): WorkerFleet {
  let alive = 0;
  let lastSeenAt: Date | null = null;
  const servedQueues = new Set<string>();
  for (const hb of heartbeats) {
    if (!lastSeenAt || hb.lastSeenAt > lastSeenAt) lastSeenAt = hb.lastSeenAt;
    if (!isWorkerAlive(workerState(hb, now))) continue;
    alive++;
    for (const q of hb.queues) servedQueues.add(q);
  }
  return { alive, down: alive === 0, lastSeenAt, servedQueues };
}

/**
 * Filas com trabalho vencido que nenhum worker vivo atende. Filas consumidas
 * por outro processo (ex.: `vouchers.issue`, pela web) ficam de fora.
 */
export function unservedQueues(
  dueByQueue: Map<string, number>,
  fleet: WorkerFleet,
  externallyServed: ReadonlySet<string> = EXTERNALLY_SERVED_QUEUES,
): string[] {
  if (fleet.down) return [];
  return [...dueByQueue]
    .filter(([q, n]) => n > 0 && !fleet.servedQueues.has(q) && !externallyServed.has(q))
    .map(([q]) => q)
    .sort();
}

/** Filas que não são do worker: a web consome sob demanda. */
export const EXTERNALLY_SERVED_QUEUES: ReadonlySet<string> = new Set(["vouchers.issue"]);
