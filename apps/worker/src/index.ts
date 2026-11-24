import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

// O .env fica na raiz do monorepo
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const { prisma } = await import("@mais/db");
const { defaultDeps, messagingJobHandlers } = await import("@mais/messaging");
const { JobRunner, newWorkerId } = await import("./runner");
const { apifyFlightSource, flightJobHandlers } = await import("./flights");
const { domainJobHandlers } = await import("./domains");
const { authEmailJobHandlers } = await import("./auth-email");
const { startOperations } = await import("./operations");

// Status de voo ao vivo só funciona com o token da Apify
const apifyToken = process.env.APIFY_TOKEN?.trim() ?? "";

const workerId = newWorkerId();
const runner = new JobRunner({
  db: prisma,
  workerId,
  concurrency: Number(process.env.WORKER_CONCURRENCY || 4),
  handlers: {
    ...messagingJobHandlers(prisma, defaultDeps({ workerId })),
    // E-mails de sistema da equipe: convite, redefinição de senha, novo acesso
    ...authEmailJobHandlers(prisma),
    ...(apifyToken ? flightJobHandlers(prisma, apifyFlightSource(apifyToken)) : {}),
    ...domainJobHandlers(prisma),
  },
});

if (!apifyToken) console.info("[worker] APIFY_TOKEN ausente: status de voo ao vivo desligado.");

// Sinal de vida + tarefas periódicas (manutenção, voos, domínios, limpeza): ver operations.ts
const ops = startOperations({ db: prisma, runner, flightsEnabled: Boolean(apifyToken) });

runner.start();

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.info(`[worker] ${signal} recebido: terminando os jobs em andamento…`);
  const exitCode = await ops.shutdown();
  await prisma.$disconnect();
  process.exit(exitCode);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
