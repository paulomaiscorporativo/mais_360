import { readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@mais/db";
import { HEARTBEAT_INTERVAL_MS } from "@mais/core/ops";
import { healthFilePath } from "./health";
import type { Logger } from "./runner";

/**
 * Sinal de vida do worker (tabela WorkerHeartbeat), a cada ~30 s:
 *  • grava/atualiza a linha da instância (host, versão, filas);
 *  • renova a trava dos jobs em andamento (lease), para não serem tomados;
 *  • toca o arquivo de marcação do healthcheck do Docker (health.ts).
 * No desligamento gracioso, grava `stoppedAt`.
 */

export type HeartbeatOptions = {
  db: PrismaClient;
  workerId: string;
  queues: () => string[];
  /** Renova a trava dos jobs deste processo */
  renewLeases?: () => Promise<number>;
  version?: string;
  intervalMs?: number;
  healthFile?: string | null;
  logger?: Logger;
};

/** Versão exibida no painel: APP_VERSION (ex. sha do commit no deploy) ou a do pacote. */
export function workerVersion(env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env.APP_VERSION?.trim();
  if (fromEnv) return fromEnv.slice(0, 64);
  try {
    const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../package.json");
    return String((JSON.parse(readFileSync(pkg, "utf8")) as { version?: string }).version ?? "");
  } catch {
    return "";
  }
}

export class Heartbeat {
  private readonly o: HeartbeatOptions;
  private readonly startedAt = new Date();
  private timer: NodeJS.Timeout | null = null;
  private failures = 0;

  constructor(o: HeartbeatOptions) {
    this.o = o;
  }

  private get log(): Logger {
    return this.o.logger ?? console;
  }

  /** Um sinal. Falha no banco não derruba o worker: o healthcheck acusa. */
  async beat(): Promise<boolean> {
    const { db, workerId } = this.o;
    const now = new Date();
    const data = {
      hostname: hostname().slice(0, 120),
      pid: process.pid,
      version: this.o.version ?? workerVersion(),
      queues: this.o.queues(),
      lastSeenAt: now,
      stoppedAt: null,
    };
    try {
      await db.workerHeartbeat.upsert({
        where: { workerId },
        create: { workerId, startedAt: this.startedAt, ...data },
        update: data,
      });
      await this.o.renewLeases?.();
      this.touchHealthFile(now);
      if (this.failures) this.log.info("[worker] sinal de vida restabelecido.");
      this.failures = 0;
      return true;
    } catch (e) {
      this.failures++;
      // Loga a primeira falha e depois de vez em quando, para não inundar
      if (this.failures === 1 || this.failures % 10 === 0)
        this.log.error(`[worker] falha ao gravar sinal de vida (${this.failures}×):`, e);
      return false;
    }
  }

  private touchHealthFile(now: Date) {
    const file = this.o.healthFile === undefined ? healthFilePath() : this.o.healthFile;
    if (!file) return;
    try {
      writeFileSync(file, now.toISOString());
    } catch (e) {
      if (this.failures === 0) this.log.warn(`[worker] não consegui gravar ${file}:`, e);
    }
  }

  start() {
    if (this.timer) return;
    void this.beat();
    this.timer = setInterval(() => void this.beat(), this.o.intervalMs ?? HEARTBEAT_INTERVAL_MS);
    this.timer.unref();
  }

  /** Para os sinais e marca a instância como encerrada (desligamento gracioso). */
  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      await this.o.db.workerHeartbeat.updateMany({
        where: { workerId: this.o.workerId },
        data: { stoppedAt: new Date(), lastSeenAt: new Date() },
      });
    } catch (e) {
      this.log.error("[worker] falha ao registrar o encerramento:", e);
    }
  }
}
