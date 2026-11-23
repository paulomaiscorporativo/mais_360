/**
 * Tokens de acesso de usuário da equipe (convite de primeiro acesso e
 * redefinição de senha). Regras puras: validade, expiração e mensagens.
 *
 * O token em si é aleatório (gerado no servidor) e só o hash SHA-256 fica no
 * banco. Cada token é de uso único; emitir um novo do mesmo propósito revoga
 * os anteriores ainda abertos.
 */

export const ACCESS_TOKEN_PURPOSES = ["INVITE", "PASSWORD_RESET"] as const;
export type AccessTokenPurpose = (typeof ACCESS_TOKEN_PURPOSES)[number];

const HOUR = 60 * 60 * 1000;

/** Convite vale 7 dias; redefinição de senha, 1 hora. */
export const ACCESS_TOKEN_TTL_MS: Record<AccessTokenPurpose, number> = {
  INVITE: 7 * 24 * HOUR,
  PASSWORD_RESET: HOUR,
};

export function accessTokenExpiry(purpose: AccessTokenPurpose, now: Date = new Date()): Date {
  return new Date(now.getTime() + ACCESS_TOKEN_TTL_MS[purpose]);
}

export type AccessTokenState = {
  purpose: AccessTokenPurpose;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
};

export type AccessTokenStatus = "VALID" | "USED" | "REVOKED" | "EXPIRED";

/** Situação do token agora. Uso e revogação têm precedência sobre a expiração. */
export function accessTokenStatus(t: AccessTokenState, now: Date = new Date()): AccessTokenStatus {
  if (t.usedAt) return "USED";
  if (t.revokedAt) return "REVOKED";
  if (t.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "VALID";
}

/** Mensagem para quem abriu um link que não vale mais (null = válido). */
export function accessTokenProblem(
  t: AccessTokenState | null,
  now: Date = new Date(),
): string | null {
  if (!t) return "Este link não é válido. Confira se copiou o endereço inteiro.";
  const status = accessTokenStatus(t, now);
  const invite = t.purpose === "INVITE";
  switch (status) {
    case "VALID":
      return null;
    case "USED":
      return invite
        ? "Este convite já foi usado. Entre com o seu e-mail e a senha que você definiu."
        : "Este link de redefinição já foi usado. Se precisar, peça um novo.";
    case "REVOKED":
      return invite
        ? "Um convite mais recente foi enviado para você. Use o link do último e-mail."
        : "Um link mais recente foi enviado para você. Use o do último e-mail.";
    case "EXPIRED":
      return invite
        ? "Este convite expirou. Peça ao administrador que envie um novo."
        : "Este link expirou (vale por 1 hora). Peça um novo em “Esqueci a senha”.";
  }
}

/** Texto curto da validade, para e-mails e telas: "7 dias", "1 hora". */
export function accessTokenValidityLabel(purpose: AccessTokenPurpose): string {
  return purpose === "INVITE" ? "7 dias" : "1 hora";
}

/** Chave de idempotência do e-mail de um token (um envio por token). */
export const accessTokenEmailKey = (tokenId: string) => `auth.email:token:${tokenId}`;

/** Situação do acesso de um usuário da equipe, para listas de equipe. */
export type UserAccessStatus = "ACTIVE" | "INVITED" | "DISABLED";

export function userAccessStatus(u: {
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
}): UserAccessStatus {
  if (!u.active) return "DISABLED";
  if (u.mustChangePassword && !u.lastLoginAt) return "INVITED";
  return "ACTIVE";
}

export const USER_ACCESS_STATUS_LABELS: Record<UserAccessStatus, string> = {
  ACTIVE: "Ativo",
  INVITED: "Convite pendente",
  DISABLED: "Desativado",
};
