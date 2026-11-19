import "server-only";
import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Política mínima: 10+ caracteres, com letra e número. Devolve a mensagem de erro ou null. */
export function passwordProblem(plain: string): string | null {
  if (plain.length < 10) return "A senha precisa ter pelo menos 10 caracteres.";
  if (!/[A-Za-zÀ-ÿ]/.test(plain) || !/\d/.test(plain)) return "Use letras e números na senha.";
  return null;
}

// Hash de referência para comparar quando o e-mail não existe: o tempo de
// resposta não revela se a conta existe. Gerado uma vez por processo.
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  dummy ??= bcrypt.hash("conta-inexistente", COST);
  return dummy;
}
