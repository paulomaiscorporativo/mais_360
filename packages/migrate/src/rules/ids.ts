import { createHash } from "node:crypto";

/**
 * Identidade dos registros migrados.
 *
 * Cada registro antigo tem uma chave legível — "abiec:Passenger:<id>" — gravada
 * em `externalIds.legado`/`customFields.legado` para rastreabilidade. O id novo
 * é DERIVADO dessa chave (e do cliente de destino): rodar a migração de novo
 * encontra o mesmo registro e atualiza em vez de duplicar, mesmo em tabelas que
 * não têm campo Json para guardar a origem (voos, quartos, mensagens…).
 */

export function legacyKey(prefix: string, model: string, id: string | number): string {
  return `${prefix}:${model}:${id}`;
}

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Id estável no formato cuid ("c" + 24 caracteres [0-9a-z]), aceito pelas
 * validações `z.cuid()` da aplicação. Mesmo cliente + mesma chave → mesmo id.
 */
export function deterministicId(tenantId: string, key: string): string {
  const digest = createHash("sha256").update(`mais-migracao|${tenantId}|${key}`).digest();
  let out = "c";
  for (let i = 0; i < 24; i++) out += BASE36[digest[i]! % 36];
  return out;
}

/** Lê a chave de origem gravada no Json (string ou lista de chaves fundidas). */
export function legacyKeysOf(json: unknown): string[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  const o = json as Record<string, unknown>;
  const keys: string[] = [];
  if (typeof o.legado === "string") keys.push(o.legado);
  if (Array.isArray(o.legadoFundidos)) {
    for (const k of o.legadoFundidos) if (typeof k === "string") keys.push(k);
  }
  return keys;
}

/** Acrescenta chaves de origem ao Json, preservando o que já estava lá. */
export function withLegacyKeys(json: unknown, keys: readonly string[]): Record<string, unknown> {
  const base =
    json && typeof json === "object" && !Array.isArray(json)
      ? { ...(json as Record<string, unknown>) }
      : {};
  const all = [...new Set([...legacyKeysOf(base), ...keys])];
  if (!all.length) return base;
  base.legado = typeof base.legado === "string" ? base.legado : all[0];
  const rest = all.filter((k) => k !== base.legado);
  if (rest.length) base.legadoFundidos = rest;
  else delete base.legadoFundidos;
  return base;
}
