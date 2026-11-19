import {
  ProviderError,
  type EmailProvider,
  type OutgoingEmail,
  type ProviderErrorKind,
  type WhatsappConnectionState,
  type WhatsappProvider,
} from "./types";

/**
 * Provedores falsos para testes e para o modo "simulação" em desenvolvimento.
 * Registram tudo o que "enviaram"; falhas e estado de conexão são programáveis.
 */

export type FakeSent = { to: string; subject?: string; text: string; at: Date };

export class FakeOutbox {
  readonly sent: FakeSent[] = [];
  /** Destinos que falham, com o tipo de erro */
  failFor = new Map<string, ProviderErrorKind>();
  /** Falha todos os envios (ex.: simular credencial errada) */
  failAll: ProviderErrorKind | null = null;
  state: WhatsappConnectionState = "open";
  /** Atraso artificial por envio (para provocar concorrência nos testes) */
  latencyMs = 0;
  private seq = 0;

  async record(to: string, text: string, subject?: string) {
    if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs));
    const kind = this.failAll ?? this.failFor.get(to);
    if (kind) throw new ProviderError(`Falha simulada (${kind}) para ${to}`, kind);
    this.sent.push({ to, text, subject, at: new Date() });
    return { providerMessageId: `fake-${++this.seq}` };
  }

  countTo(to: string) {
    return this.sent.filter((s) => s.to === to).length;
  }
}

export function createFakeEmailProvider(
  outbox: FakeOutbox,
  senderKey = "fake:email",
): EmailProvider {
  return {
    kind: "EMAIL",
    senderKey,
    send: (m: OutgoingEmail) => outbox.record(m.to, m.text, m.subject),
  };
}

export function createFakeWhatsappProvider(
  outbox: FakeOutbox,
  senderKey = "fake:whatsapp",
): WhatsappProvider {
  return {
    kind: "WHATSAPP",
    senderKey,
    connectionState: async () => outbox.state,
    sendText: (to, text) => outbox.record(to, text),
  };
}
