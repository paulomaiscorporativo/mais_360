import { ProviderError, type FetchLike, type WhatsappProvider } from "./types";

/**
 * Provedor genérico por webhook (Z-API e similares atrás de um adaptador).
 * Contrato: POST <url> { to, text, idempotencyKey } com Bearer <token>;
 * resposta 2xx { id }. 4xx = problema do destinatário/config, 5xx = temporário.
 */

export type WebhookConfig = { url: string; token?: string; senderId: string };

export function createWebhookProvider(
  config: WebhookConfig,
  fetchImpl: FetchLike = fetch,
): WhatsappProvider {
  return {
    kind: "WHATSAPP",
    senderKey: `webhook:${config.senderId}`,
    async connectionState() {
      return config.url ? "open" : "not_found";
    },
    async sendText(to, text, options = {}) {
      let resp: Response;
      try {
        resp = await fetchImpl(config.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
          },
          body: JSON.stringify({ to, text, idempotencyKey: options.idempotencyKey }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (e) {
        const name = (e as Error)?.name;
        if (name === "TimeoutError" || name === "AbortError")
          throw new ProviderError("Webhook não respondeu a tempo.", "UNCERTAIN");
        throw new ProviderError(`Webhook inacessível: ${(e as Error)?.message}`, "TRANSIENT");
      }
      const data = (await resp.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!resp.ok) {
        const msg = data.error ?? `HTTP ${resp.status}`;
        if (resp.status === 401 || resp.status === 403)
          throw new ProviderError(msg, "CONFIG", resp.status);
        if (resp.status >= 400 && resp.status < 500)
          throw new ProviderError(msg, "RECIPIENT", resp.status);
        throw new ProviderError(msg, "TRANSIENT", resp.status);
      }
      return { providerMessageId: data.id ?? "" };
    },
  };
}
