/**
 * Healthcheck do worker para o Docker:
 *
 *   node --experimental-strip-types apps/worker/src/health.ts   (Node ≥ 22.6)
 *   npm run health -w @mais/worker                               (via tsx)
 *
 * O sinal de vida (heartbeat.ts) toca um arquivo de marcação a cada ~30 s,
 * SÓ depois de gravar com sucesso no banco. Arquivo velho (ou ausente) quer
 * dizer processo travado ou sem banco → código 1 e o Docker marca "unhealthy".
 *
 * Sem dependências além do Node: roda rápido e não abre conexão com o banco.
 */
import { statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Sem toque há mais que isso → não saudável (3 sinais perdidos). */
export const HEALTH_MAX_AGE_MS = 90_000;

export function healthFilePath(env: Record<string, string | undefined> = process.env): string {
  return env.WORKER_HEALTH_FILE?.trim() || path.join(tmpdir(), "mais-worker-health");
}

export function checkHealthFile(
  file: string,
  now = Date.now(),
  maxAgeMs = HEALTH_MAX_AGE_MS,
): { ok: boolean; reason: string } {
  let mtime: number;
  try {
    mtime = statSync(file).mtimeMs;
  } catch {
    return { ok: false, reason: `sem arquivo de sinal de vida (${file})` };
  }
  const age = now - mtime;
  if (age > maxAgeMs) return { ok: false, reason: `último sinal há ${Math.round(age / 1000)} s` };
  return { ok: true, reason: `último sinal há ${Math.round(age / 1000)} s` };
}

// Executado direto (não importado)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = checkHealthFile(healthFilePath());
  console.log(`[worker] ${r.ok ? "saudável" : "NÃO saudável"}: ${r.reason}`);
  process.exit(r.ok ? 0 : 1);
}
