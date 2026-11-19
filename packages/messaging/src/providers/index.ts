import type { ResolvedChannel, ResolvedEmailChannel, ResolvedWhatsappChannel } from "../channels";
import { createEvolutionProvider } from "./evolution";
import { createMetaCloudProvider } from "./meta-cloud";
import { createSmtpProvider } from "./smtp";
import type { EmailProvider, WhatsappProvider } from "./types";
import { createWebhookProvider } from "./webhook";

export * from "./types";
export * from "./fake";
export { createSmtpProvider, verifySmtpConnection } from "./smtp";
export { createEvolutionProvider, evolutionAdmin } from "./evolution";
export { createMetaCloudProvider } from "./meta-cloud";
export { createWebhookProvider } from "./webhook";

/** Fábrica injetável: os testes trocam por provedores falsos. */
export type ProviderFactory = {
  email(channel: ResolvedEmailChannel, options?: { pool?: boolean }): EmailProvider;
  whatsapp(channel: ResolvedWhatsappChannel): WhatsappProvider;
};

export const realProviders: ProviderFactory = {
  email: (c, options) => createSmtpProvider(c.smtp, options),
  whatsapp: (c) => {
    switch (c.provider) {
      case "EVOLUTION":
        return createEvolutionProvider(c.evolution);
      case "META_CLOUD":
        return createMetaCloudProvider(c.meta);
      case "WEBHOOK":
        return createWebhookProvider(c.webhook);
    }
  },
};

/** Identificador do remetente sem instanciar o provedor (para contar o limite diário). */
export function senderKeyOf(c: ResolvedChannel): string {
  if (c.kind === "EMAIL") return `smtp:${c.smtp.user || "anon"}@${c.smtp.host}`;
  switch (c.provider) {
    case "EVOLUTION":
      return `evolution:${c.evolution.instance}`;
    case "META_CLOUD":
      return `meta:${c.meta.phoneNumberId}`;
    case "WEBHOOK":
      return `webhook:${c.webhook.senderId}`;
  }
}
