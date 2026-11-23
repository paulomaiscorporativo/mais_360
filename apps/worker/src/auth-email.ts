/**
 * E-mails de sistema da equipe (fila `auth.email`): convite de primeiro acesso,
 * redefinição de senha e aviso de novo acesso.
 *
 * A web só enfileira (uma entrega por token, via uniqueKey); aqui o worker
 * confere se o token ainda vale — convite substituído, já usado ou conta
 * desativada não recebem e-mail velho —, renderiza o modelo de @mais/core e
 * envia pelo SMTP global do .env.
 */
import type { PrismaClient } from "@mais/db";
import {
  accessTokenStatus,
  AUTH_EMAIL_QUEUE,
  authEmailPayloadSchema,
  renderAuthEmail,
} from "@mais/core";
import { createSmtpProvider, globalSmtp, ProviderError, type OutgoingEmail } from "@mais/messaging";
import type { JobHandler, Logger } from "./runner";

/** `from` vazio = remetente do SMTP global; `fromName` troca só o nome exibido. */
export type SendEmail = (m: OutgoingEmail & { fromName?: string }) => Promise<void>;

/** "Nome <endereço>" com o nome trocado (o endereço continua o do SMTP). */
export function withDisplayName(from: string, name: string): string {
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from.trim();
  const safe = name.replace(/[\s"<>\\]+/g, " ").trim();
  return safe ? `"${safe}" <${address}>` : from;
}

/** Envio pelo SMTP global (SMTP_* do .env). Sem SMTP configurado, falha (e o job tenta de novo). */
export function globalSmtpSender(): SendEmail {
  return async ({ fromName, ...m }) => {
    const cfg = globalSmtp();
    if (!cfg) throw new Error("SMTP global não configurado (SMTP_HOST vazio).");
    const provider = createSmtpProvider(cfg.smtp);
    const base = m.from || cfg.from;
    try {
      await provider.send({ ...m, from: fromName ? withDisplayName(base, fromName) : base });
    } finally {
      provider.close?.();
    }
  };
}

export function authEmailJobHandlers(
  db: PrismaClient,
  send: SendEmail = globalSmtpSender(),
  log: Logger = console,
): Record<string, JobHandler> {
  return {
    [AUTH_EMAIL_QUEUE]: async (raw) => {
      const payload = authEmailPayloadSchema.parse(raw);
      if (payload.tokenId) {
        const token = await db.userAccessToken.findUnique({
          where: { id: payload.tokenId },
          include: { user: { select: { active: true, email: true } } },
        });
        if (!token || accessTokenStatus(token) !== "VALID" || !token.user.active) {
          log.info(
            `[worker] auth.email: token ${payload.tokenId} não vale mais; e-mail descartado.`,
          );
          return;
        }
        // O e-mail vai sempre para o dono do token (nunca para outro endereço do payload)
        payload.to = token.user.email;
      }
      const rendered = renderAuthEmail(payload);
      try {
        await send({
          from: "",
          fromName: payload.brand.name,
          to: payload.to,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          headers: { "Auto-Submitted": "auto-generated" },
        });
      } catch (e) {
        // Caixa inexistente não melhora tentando de novo
        if (e instanceof ProviderError && e.kind === "RECIPIENT") {
          log.warn(`[worker] auth.email: destinatário recusado (${payload.kind}): ${e.message}`);
          return;
        }
        throw e;
      }
    },
  };
}
