import nodemailer from "nodemailer";
import type { SmtpSettings } from "../env";
import { ProviderError, type EmailProvider, type OutgoingEmail } from "./types";

type SmtpError = Error & { responseCode?: number; code?: string };

function classify(e: SmtpError): ProviderError {
  const code = e.responseCode ?? 0;
  if (code === 535 || code === 534 || e.code === "EAUTH") {
    return new ProviderError(
      `Falha de autenticação no servidor de e-mail: ${e.message}`,
      "CONFIG",
      code,
    );
  }
  if (
    [550, 551, 553, 554].includes(code) &&
    /recipient|mailbox|user|address|destinat/i.test(e.message)
  ) {
    return new ProviderError(`Destinatário recusado: ${e.message}`, "RECIPIENT", code);
  }
  if (e.code === "ECONNECTION" || e.code === "ESOCKET" || e.code === "ETIMEDOUT" || code >= 400) {
    return new ProviderError(e.message, "TRANSIENT", code);
  }
  return new ProviderError(e.message, "TRANSIENT", code);
}

/**
 * SMTP com conexão reaproveitada (pool de 1): o mesmo transporte envia a
 * campanha inteira, sem abrir uma conexão por mensagem.
 */
export function createSmtpProvider(
  smtp: SmtpSettings,
  options: { pool?: boolean } = {},
): EmailProvider {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass } } : {}),
    ...(options.pool ? { pool: true, maxConnections: 1 } : {}),
  });
  return {
    kind: "EMAIL",
    senderKey: `smtp:${smtp.user || "anon"}@${smtp.host}`,
    async send(m: OutgoingEmail) {
      try {
        const info = await transport.sendMail({
          from: m.from,
          to: m.to,
          replyTo: m.replyTo || undefined,
          subject: m.subject,
          html: m.html,
          text: m.text,
          headers: m.headers,
        });
        return { providerMessageId: String(info.messageId ?? "") };
      } catch (e) {
        throw classify(e as SmtpError);
      }
    },
    close() {
      transport.close();
    },
  };
}

/** Testa conexão e autenticação no servidor SMTP (botão "Testar conexão" do painel). */
export async function verifySmtpConnection(smtp: SmtpSettings): Promise<void> {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    connectionTimeout: 10_000,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass } } : {}),
  });
  try {
    await transport.verify();
  } catch (e) {
    throw classify(e as SmtpError);
  } finally {
    transport.close();
  }
}
