/**
 * Configuração global vinda do ambiente. Clientes e projetos podem ter canais
 * próprios (MessagingChannel); sem eles, vale o que está aqui.
 */

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function defaultTimeZone(): string {
  return process.env.DEFAULT_TIMEZONE || "America/Sao_Paulo";
}

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

/**
 * SMTP global. `replyTo` (SMTP_REPLY_TO) é o "responder para" padrão: vale quando
 * o remetente não recebe respostas (ex.: nao-responda@) e o cliente não definiu o próprio.
 */
export function globalSmtp(): { smtp: SmtpSettings; from: string; replyTo: string } | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  return {
    smtp: {
      host,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      user: process.env.SMTP_USER?.trim() ?? "",
      pass: process.env.SMTP_PASS ?? "",
    },
    from:
      process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || "nao-responda@localhost",
    replyTo: process.env.SMTP_REPLY_TO?.trim() ?? "",
  };
}

export function globalEvolution(): { url: string; apiKey: string; instance: string } | null {
  const url = process.env.EVOLUTION_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_APIKEY?.trim();
  if (!url || !apiKey) return null;
  return { url, apiKey, instance: process.env.EVOLUTION_INSTANCE?.trim() ?? "" };
}

/** Intervalo entre e-mails de uma campanha (evita bloqueio/spam do provedor). */
export function emailIntervalMs(): number {
  return Math.max(0, Number(process.env.MESSAGING_EMAIL_INTERVAL_MS ?? 2000));
}
