/**
 * Chaves de idempotência de `MessageDelivery.dedupeKey` (única no banco).
 * Inserir duas vezes a mesma chave falha — é isso que impede o envio triplicado
 * que aconteceu em 17/11/2026.
 */

export type Channel = "EMAIL" | "WHATSAPP";

/** Uma entrega por (campanha, destinatário, canal). */
export function campaignDeliveryKey(
  campaignId: string,
  recipientId: string,
  channel: Channel,
): string {
  return `c:${campaignId}:${recipientId}:${channel}`;
}

/**
 * Mensagem transacional: um envio por (motivo, entidade, canal).
 * Ex.: transactionalKey("registration.confirmed", registrationId, "EMAIL").
 * `occurrence` diferencia reenvios intencionais ("reenviar convite").
 */
export function transactionalKey(
  reason: string,
  entityId: string,
  channel: Channel,
  occurrence?: string,
): string {
  return `t:${reason}:${entityId}:${channel}${occurrence ? `:${occurrence}` : ""}`;
}

/** Envio de teste nunca colide com envio real. */
export function testDeliveryKey(nonce: string, channel: Channel): string {
  return `test:${nonce}:${channel}`;
}
