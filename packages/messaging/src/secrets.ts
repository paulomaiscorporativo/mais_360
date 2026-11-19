import { decryptOptional, encryptOptional, parseKey } from "@mais/core/crypto";

let cached: Buffer | null = null;

function key(): Buffer {
  cached ??= parseKey(process.env.ENCRYPTION_KEY);
  return cached;
}

/** Cifra um segredo para gravar no banco (senha SMTP, token de WhatsApp). */
export const sealSecret = (plain: string) => encryptOptional(plain, key());

/** Decifra um segredo lido do banco. */
export const openSecret = (sealed: string) => decryptOptional(sealed, key());

/** Só para testes: troca a chave em uso. */
export function __setEncryptionKeyForTests(k: Buffer | null) {
  cached = k;
}
