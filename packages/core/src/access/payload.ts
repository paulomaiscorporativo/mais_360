import { z } from "zod";
import { AUTH_EMAIL_KINDS } from "./email";

/** Fila dos e-mails de sistema da equipe (convite, redefinição, novo acesso). */
export const AUTH_EMAIL_QUEUE = "auth.email";

/**
 * Payload do job `auth.email`. Sem segredo além do link (que já é o que vai no
 * e-mail). Com `tokenId`, o worker confere se o token ainda vale antes de
 * enviar — convite substituído ou conta desativada não recebe e-mail velho.
 */
export const authEmailPayloadSchema = z.object({
  kind: z.enum(AUTH_EMAIL_KINDS),
  to: z.string().email(),
  recipientName: z.string().default(""),
  link: z.string().url(),
  tokenId: z.string().optional(),
  brand: z.object({
    name: z.string().min(1),
    color: z.string(),
    byline: z.string().optional(),
  }),
  contextName: z.string().optional(),
  actorName: z.string().optional(),
  roleLabel: z.string().optional(),
});

export type AuthEmailPayload = z.input<typeof authEmailPayloadSchema>;
