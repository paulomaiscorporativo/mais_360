import { ProviderError, type FetchLike, type WhatsappProvider } from "./types";

/**
 * WhatsApp Cloud API (oficial da Meta).
 * Atenção: fora da janela de 24 h desde a última mensagem do contato, a Meta só
 * aceita mensagens de MODELO aprovado (erro 131047). Texto livre é para respostas.
 */

export type MetaCloudConfig = { token: string; phoneNumberId: string; apiVersion?: string };

export function createMetaCloudProvider(
  config: MetaCloudConfig,
  fetchImpl: FetchLike = fetch,
): WhatsappProvider {
  const base = `https://graph.facebook.com/${config.apiVersion ?? "v21.0"}/${encodeURIComponent(config.phoneNumberId)}`;
  const headers = { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" };

  return {
    kind: "WHATSAPP",
    senderKey: `meta:${config.phoneNumberId}`,

    async connectionState() {
      try {
        const resp = await fetchImpl(`${base}?fields=id`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        });
        if (resp.ok) return "open";
        return resp.status === 404 ? "not_found" : "closed";
      } catch {
        return "unavailable";
      }
    },

    async sendText(to, text) {
      let resp: Response;
      try {
        resp = await fetchImpl(`${base}/messages`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: text, preview_url: true },
          }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (e) {
        const name = (e as Error)?.name;
        if (name === "TimeoutError" || name === "AbortError") {
          throw new ProviderError(
            "A API da Meta não respondeu a tempo; resultado incerto.",
            "UNCERTAIN",
          );
        }
        throw new ProviderError(`API da Meta inacessível: ${(e as Error)?.message}`, "TRANSIENT");
      }
      const data = (await resp.json().catch(() => ({}))) as {
        messages?: { id?: string }[];
        error?: { message?: string; code?: number };
      };
      if (!resp.ok) {
        const code = data.error?.code;
        const msg = data.error?.message ?? `HTTP ${resp.status}`;
        if (code === 131026 || code === 131030)
          throw new ProviderError(`Número sem WhatsApp: ${msg}`, "RECIPIENT", resp.status);
        if (code === 131047)
          throw new ProviderError(
            "Fora da janela de 24 h: use um modelo aprovado pela Meta.",
            "RECIPIENT",
            resp.status,
          );
        if (resp.status === 401 || resp.status === 403 || code === 190)
          throw new ProviderError(`Token da Meta inválido: ${msg}`, "CONFIG", resp.status);
        throw new ProviderError(msg, "TRANSIENT", resp.status);
      }
      return { providerMessageId: data.messages?.[0]?.id ?? "" };
    },
  };
}
