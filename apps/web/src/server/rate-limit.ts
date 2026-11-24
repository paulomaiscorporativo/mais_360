import "server-only";
import { prisma } from "./db";
import { clearRateLimit, hitRateLimit } from "./rate-limit-store";

/**
 * Limite de tentativas em janela fixa (começa na primeira tentativa), guardado
 * no Postgres: vale para todos os nós e sobrevive a reinícios. Regras em
 * `@mais/core/ops`; armazenamento em rate-limit-store.ts. Contadores vencidos
 * são apagados pela limpeza diária do worker.
 *
 * Se o banco falhar, deixa passar (e registra): sem banco, o login e os
 * formulários também não funcionam, e não queremos bloquear por engano.
 */
export async function rateLimit(key: string, limit: number, windowMs: number) {
  try {
    return await hitRateLimit(prisma, key, limit, windowMs);
  } catch (err) {
    console.error("[rate-limit] falha ao consultar o contador; liberando:", err);
    return { allowed: true, remaining: 0, retryAfterMs: 0 };
  }
}

export async function resetRateLimit(key: string) {
  try {
    await clearRateLimit(prisma, key);
  } catch (err) {
    console.error("[rate-limit] falha ao zerar o contador:", err);
  }
}
