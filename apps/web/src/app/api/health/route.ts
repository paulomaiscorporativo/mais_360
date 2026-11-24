import { prisma } from "@/server/db";

/**
 * Healthcheck da web (Docker, Caddy, monitor externo):
 *   GET /api/health → 200 {"status":"ok"} · 503 {"status":"erro"}
 * Confere só a conexão com o banco (SELECT 1 com prazo de 3 s). Sem sessão e
 * sem detalhes: não revela versão, host nem a mensagem do erro.
 */
const TIMEOUT_MS = 3_000;

export async function GET() {
  let ok = false;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("tempo esgotado")), TIMEOUT_MS);
      }),
    ]);
    ok = true;
  } catch (err) {
    console.error("[health] banco indisponível:", err);
  } finally {
    clearTimeout(timer);
  }
  return Response.json(
    { status: ok ? "ok" : "erro" },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
