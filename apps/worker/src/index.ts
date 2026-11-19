import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

// O .env fica na raiz do monorepo
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const { prisma } = await import("@mais/db");
const { defaultDeps, messagingJobHandlers, recoverStaleDeliveries } =
  await import("@mais/messaging");
const { JobRunner, newWorkerId } = await import("./runner");

const workerId = newWorkerId();
const runner = new JobRunner({
  db: prisma,
  workerId,
  concurrency: Number(process.env.WORKER_CONCURRENCY || 4),
  handlers: {
    ...messagingJobHandlers(prisma, defaultDeps({ workerId })),
  },
});

// Manutenção: devolve jobs de processos que morreram e fecha entregas presas
const housekeeping = setInterval(async () => {
  try {
    const jobs = await runner.reclaimStale();
    const deliveries = await recoverStaleDeliveries(prisma);
    if (jobs || deliveries)
      console.warn(
        `[worker] manutenção: ${jobs} job(s) liberado(s), ${deliveries} entrega(s) interrompida(s)`,
      );
  } catch (e) {
    console.error("[worker] erro na manutenção:", e);
  }
}, 60_000);

runner.start();

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.info(`[worker] ${signal} recebido: terminando os jobs em andamento…`);
  clearInterval(housekeeping);
  const force = setTimeout(() => {
    console.error("[worker] tempo esgotado; encerrando à força.");
    process.exit(1);
  }, 60_000);
  await runner.stop();
  await prisma.$disconnect();
  clearTimeout(force);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
