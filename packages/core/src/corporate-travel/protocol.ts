/**
 * Protocolo legível da solicitação: "VC-2026-000123" (ano da criação +
 * sequência anual por cliente). A unicidade é garantida no banco
 * (@@unique([tenantId, protocol])); aqui fica só o formato.
 */

export const PROTOCOL_PREFIX = "VC";

export function formatProtocol(year: number, seq: number): string {
  return `${PROTOCOL_PREFIX}-${year}-${String(seq).padStart(6, "0")}`;
}

/** Sequência de um protocolo do ano informado, ou null se for de outro ano/formato. */
export function protocolSeq(protocol: string, year: number): number | null {
  const m = /^VC-(\d{4})-(\d{6,})$/.exec(protocol.trim());
  if (!m || Number(m[1]) !== year) return null;
  return Number(m[2]);
}

/** Próximo protocolo do ano, a partir do maior já emitido (ou null se for o primeiro). */
export function nextProtocol(year: number, latest: string | null | undefined): string {
  const seq = latest ? protocolSeq(latest, year) : null;
  return formatProtocol(year, (seq ?? 0) + 1);
}

/** Busca por protocolo aceita "123", "2026-123" ou o código inteiro. */
export function normalizeProtocolQuery(q: string): string {
  return q.trim().toUpperCase().replace(/\s+/g, "");
}
