import "server-only";

/**
 * Limite de tentativas em janela deslizante, em memória do processo.
 * Suficiente para um nó; com vários nós, trocar por uma tabela no Postgres
 * mantendo esta mesma interface.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  const allowed = recent.length < limit;
  if (allowed) recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  const retryAfterMs = allowed ? 0 : windowMs - (now - (recent[0] ?? now));
  return { allowed, remaining: Math.max(0, limit - recent.length), retryAfterMs };
}

export function resetRateLimit(key: string) {
  hits.delete(key);
}
