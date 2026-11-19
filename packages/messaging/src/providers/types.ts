/**
 * Contratos dos provedores de envio. Toda a lógica de campanha fala só com
 * estas interfaces — trocar Evolution por Meta Cloud (ou um fake nos testes)
 * não muda nada acima delas.
 */

/**
 * RECIPIENT  problema do destinatário (número sem WhatsApp, caixa inexistente):
 *            não conta para a pausa automática, não tenta de novo.
 * CONFIG     credencial/instância errada: pausa a campanha.
 * TRANSIENT  falha temporária: pode tentar de novo.
 * UNCERTAIN  não sabemos se saiu (timeout após o envio). NÃO reenvia —
 *            mandar duas vezes é pior do que não mandar.
 */
export type ProviderErrorKind = "RECIPIENT" | "CONFIG" | "TRANSIENT" | "UNCERTAIN";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export const asProviderError = (e: unknown): ProviderError =>
  e instanceof ProviderError
    ? e
    : new ProviderError(e instanceof Error ? e.message : String(e), "TRANSIENT");

export type OutgoingEmail = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export interface EmailProvider {
  readonly kind: "EMAIL";
  /** Identifica a conta remetente (para logs e limites) */
  readonly senderKey: string;
  send(message: OutgoingEmail): Promise<{ providerMessageId: string }>;
  close?(): void;
}

export type WhatsappConnectionState =
  "open" | "connecting" | "closed" | "not_found" | "unavailable";

export interface WhatsappProvider {
  readonly kind: "WHATSAPP";
  /** Identifica o NÚMERO remetente — o limite diário é por número */
  readonly senderKey: string;
  connectionState(): Promise<WhatsappConnectionState>;
  sendText(
    to: string,
    text: string,
    options?: { typingMs?: number; idempotencyKey?: string },
  ): Promise<{ providerMessageId: string }>;
}

export type MessagingProvider = EmailProvider | WhatsappProvider;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
