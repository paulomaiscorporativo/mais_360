import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

// O .env fica na raiz do monorepo
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const { prisma } = await import("@mais/db");
const { defaultDeps, messagingJobHandlers, recoverStaleDeliveries } =
  await import("@mais/messaging");
const { JobRunner, newWorkerId } = await import("./runner");
const { apifyFlightSource, flightJobHandlers, sweepLiveFlights } = await import("./flights");
const { domainJobHandlers, sweepDomains } = await import("./domains");
const { authEmailJobHandlers } = await import("./auth-email");

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

// Voos perto da partida ou em andamento: atualiza sozinho a cada 5 min
const flightSweep = apifyToken
  ? setInterval(async () => {
      try {
        await sweepLiveFlights(prisma);
      } catch (e) {
        console.error("[worker] erro na varredura de voos:", e);
      }
    }, 5 * 60_000)
  : null;
if (!apifyToken) console.info("[worker] APIFY_TOKEN ausente: status de voo ao vivo desligado.");

// Domínios próprios dos clientes: pendentes a cada 5 min, verificados uma vez por dia
async function runDomainSweep() {
  try {
    const n = await sweepDomains(prisma);
    if (n) console.info(`[worker] ${n} domínio(s) enviado(s) para verificação de DNS`);
  } catch (e) {
    console.error("[worker] erro na varredura de domínios:", e);
  }
}
const domainSweep = setInterval(runDomainSweep, 5 * 60_000);
void runDomainSweep();

runner.start();

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.info(`[worker] ${signal} recebido: terminando os jobs em andamento…`);
  clearInterval(housekeeping);
  if (flightSweep) clearInterval(flightSweep);
  clearInterval(domainSweep);
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
