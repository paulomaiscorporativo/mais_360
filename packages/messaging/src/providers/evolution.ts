import {
  ProviderError,
  type FetchLike,
  type WhatsappConnectionState,
  type WhatsappProvider,
} from "./types";

/**
 * Evolution API (WhatsApp comum pareado por QR code).
 *
 * Lições do sistema_convite:
 *  • a chamada só responde depois do "digitando…" + entrega: timeout fixo de
 *    10 s marcava como falha mensagens que tinham saído → 10 s + delay + 20 s;
 *  • corpo v2 { number, text, delay }; HTTP 400 → tenta uma vez o formato v1;
 *  • timeout depois de enviar = resultado INCERTO → nunca reenviar.
 */

const BASE_TIMEOUT_MS = 10_000;
const SLACK_MS = 20_000;

export type EvolutionConfig = { url: string; apiKey: string; instance: string };

const RECIPIENT_ERROR = /exist|not.*(whatsapp|registered)|invalid.*number|n[uú]mero/i;

function errorText(data: unknown): string {
  const d = data as { response?: { message?: unknown }; message?: unknown; error?: unknown } | null;
  const v = d?.response?.message ?? d?.message ?? d?.error ?? d;
  return typeof v === "string" ? v : JSON.stringify(v);
}

export function createEvolutionProvider(
  config: EvolutionConfig,
  fetchImpl: FetchLike = fetch,
): WhatsappProvider {
  const base = config.url.replace(/\/+$/, "");
  const inst = encodeURIComponent(config.instance);

  async function call(method: string, path: string, body: unknown, timeoutMs: number) {
    const resp = await fetchImpl(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data: unknown = await resp.json().catch(() => ({}));
    return { resp, data };
  }

  return {
    kind: "WHATSAPP",
    senderKey: `evolution:${config.instance}`,

    async connectionState(): Promise<WhatsappConnectionState> {
      try {
        const { resp, data } = await call(
          "GET",
          `/instance/connectionState/${inst}`,
          undefined,
          BASE_TIMEOUT_MS,
        );
        if (resp.status === 404) return "not_found";
        if (!resp.ok) return "unavailable";
        const d = data as { instance?: { state?: string }; state?: string };
        const state = d.instance?.state ?? d.state ?? "close";
        return state === "open" ? "open" : state === "connecting" ? "connecting" : "closed";
      } catch {
        return "unavailable";
      }
    },

    async sendText(to, text, options = {}) {
      const delay = Math.max(0, Math.round(options.typingMs ?? 0));
      const timeout = BASE_TIMEOUT_MS + delay + SLACK_MS;
      const path = `/message/sendText/${inst}`;
      try {
        let { resp, data } = await call(
          "POST",
          path,
          { number: to, text, ...(delay ? { delay } : {}) },
          timeout,
        );
        if (resp.status === 400) {
          ({ resp, data } = await call(
            "POST",
            path,
            {
              number: to,
              textMessage: { text },
              ...(delay ? { options: { delay, presence: "composing" } } : {}),
            },
            timeout,
          ));
        }
        if (!resp.ok) {
          const msg = errorText(data);
          if (RECIPIENT_ERROR.test(msg))
            throw new ProviderError(`Número sem WhatsApp: ${msg}`, "RECIPIENT", resp.status);
          if (resp.status === 401 || resp.status === 403 || resp.status === 404) {
            throw new ProviderError(
              `Instância do WhatsApp indisponível: ${msg}`,
              "CONFIG",
              resp.status,
            );
          }
          throw new ProviderError(msg || `HTTP ${resp.status}`, "TRANSIENT", resp.status);
        }
        const d = data as { key?: { id?: string }; messageId?: string };
        return { providerMessageId: d.key?.id ?? d.messageId ?? "" };
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        const name = (e as Error)?.name;
        if (name === "TimeoutError" || name === "AbortError") {
          throw new ProviderError(
            "A Evolution não respondeu a tempo; a mensagem pode ter sido entregue. Não será reenviada automaticamente.",
            "UNCERTAIN",
          );
        }
        // Falha de rede ANTES de enviar (DNS, conexão recusada): seguro tentar de novo
        throw new ProviderError(
          `Servidor de WhatsApp inacessível: ${(e as Error)?.message ?? e}`,
          "TRANSIENT",
        );
      }
    },
  };
}

/** Operações de administração da instância (pareamento por QR no painel). */
export function evolutionAdmin(
  config: Omit<EvolutionConfig, "instance">,
  fetchImpl: FetchLike = fetch,
) {
  const base = config.url.replace(/\/+$/, "");
  const call = async (method: string, path: string, body?: unknown) => {
    const resp = await fetchImpl(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(BASE_TIMEOUT_MS),
    });
    return { resp, data: (await resp.json().catch(() => ({}))) as Record<string, unknown> };
  };
  return {
    async createInstance(instance: string) {
      const { resp, data } = await call("POST", "/instance/create", {
        instanceName: instance,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      });
      // "already in use" = já existe; não é erro para nós
      if (!resp.ok && !JSON.stringify(data).toLowerCase().includes("already")) {
        throw new ProviderError(errorText(data), "CONFIG", resp.status);
      }
    },
    /** QR code em data URL para parear; null quando já conectado. */
    async qrCode(instance: string): Promise<string | null> {
      const { resp, data } = await call("GET", `/instance/connect/${encodeURIComponent(instance)}`);
      if (!resp.ok) throw new ProviderError(errorText(data), "CONFIG", resp.status);
      const b64 =
        (data.base64 as string | undefined) ??
        (data.qrcode as { base64?: string } | undefined)?.base64;
      if (!b64) return null;
      return b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
    },
    async logout(instance: string) {
      await call("DELETE", `/instance/logout/${encodeURIComponent(instance)}`).catch(
        () => undefined,
      );
    },
  };
}
