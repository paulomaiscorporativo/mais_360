import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifra de segredos guardados no banco (senha SMTP, tokens de WhatsApp) com
 * AES-256-GCM. Formato: "v1:<iv>:<tag>:<conteúdo>", tudo em base64url.
 * A chave vem de ENCRYPTION_KEY (32 bytes em base64).
 */

const VERSION = "v1";

export function parseKey(keyBase64: string | undefined): Buffer {
  const key = Buffer.from(String(keyBase64 ?? "").trim(), "base64");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY inválida: informe 32 bytes em base64 (openssl rand -base64 32).",
    );
  }
  return key;
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const content = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    content.toString("base64url"),
  ].join(":");
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [version, iv, tag, content] = payload.split(":");
  if (version !== VERSION || !iv || !tag || content === undefined) {
    throw new Error("Segredo cifrado em formato desconhecido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(content, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Vazio continua vazio — campos opcionais não precisam de cifra. */
export const encryptOptional = (plain: string, key: Buffer) =>
  plain ? encryptSecret(plain, key) : "";
export const decryptOptional = (payload: string, key: Buffer) =>
  payload ? decryptSecret(payload, key) : "";
