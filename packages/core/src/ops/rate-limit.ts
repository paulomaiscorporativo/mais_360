/**
 * Limite de tentativas em janela fixa por chave, que começa na primeira
 * tentativa. A contagem fica no banco (`RateLimitBucket`) e é incrementada de
 * forma atômica; aqui só a decisão, para ser testada sem banco.
 *
 * Toda tentativa conta, inclusive as recusadas, mas a janela não se estende:
 * quem insiste espera o mesmo tempo que quem parou.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export function rateLimitDecision(input: {
  /** Tentativas na janela atual, já contando esta. */
  count: number;
  limit: number;
  /** Fim da janela atual. */
  resetAt: Date;
  now: Date;
}): RateLimitResult {
  const allowed = input.count <= input.limit;
  return {
    allowed,
    remaining: Math.max(0, input.limit - input.count),
    retryAfterMs: allowed ? 0 : Math.max(0, input.resetAt.getTime() - input.now.getTime()),
  };
}

/** Valida os parâmetros de quem chama (erro de programação, não do usuário). */
export function assertRateLimitParams(limit: number, windowMs: number) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`Limite inválido: ${limit}`);
  if (!Number.isFinite(windowMs) || windowMs < 1000)
    throw new Error(`Janela inválida: ${windowMs} ms`);
}

/** Minutos inteiros para a mensagem "tente de novo em N min" (nunca 0). */
export const retryAfterMinutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));
