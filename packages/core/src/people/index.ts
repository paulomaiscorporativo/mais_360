import { normalizePhone } from "../messaging/phone";

/**
 * Regras puras do cadastro único de pessoas (sem I/O).
 * Usadas pela aplicação web, pela importação de planilhas e pelas integrações.
 */

/** Minúsculo e sem acentos — base da busca e das comparações. */
export function foldText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEmail(value: string | null | undefined): string {
  const m = /[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+/.exec(String(value ?? ""));
  return m ? m[0].toLowerCase() : "";
}

/** CPF só com dígitos; recupera zeros à esquerda que o Excel apaga. */
export function normalizeCpf(value: string | number | null | undefined): string {
  const d = String(value ?? "").replace(/\D/g, "");
  if (d.length >= 9 && d.length < 11) return d.padStart(11, "0");
  return d;
}

export function isValidCpf(value: string | null | undefined): boolean {
  const d = normalizeCpf(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

/** "Maria da Silva Souza" → { firstName: "Maria", lastName: "da Silva Souza" } */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = cleanText(full).split(" ").filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

const NAME_SUFFIX = /^(filho|filha|junior|júnior|jr\.?|neto|neta|sobrinho|segundo|terceiro)$/i;
const LOWER_PARTICLES = new Set(["da", "de", "do", "das", "dos", "e"]);

function titleCase(word: string): string {
  const w = word.toLocaleLowerCase("pt-BR");
  return LOWER_PARTICLES.has(w) ? w : w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1);
}

/** Nome curto do crachá: primeiro nome + último sobrenome (preserva "Filho", "Júnior"…). */
export function defaultBadgeName(firstName: string, lastName: string): string {
  const n = cleanText(firstName).split(" ").filter(Boolean);
  const s = cleanText(lastName).split(" ").filter(Boolean);
  let last = s.length ? s[s.length - 1]! : n.length > 1 ? n[n.length - 1]! : "";
  if (NAME_SUFFIX.test(last) && s.length > 1) last = `${s[s.length - 2]} ${last}`;
  return [n[0], ...last.split(" ")]
    .filter((p): p is string => !!p)
    .map((p) => (LOWER_PARTICLES.has(p.toLowerCase()) ? p.toLowerCase() : titleCase(p)))
    .join(" ");
}

export function personDisplayName(p: { firstName: string; lastName?: string | null }): string {
  return cleanText(`${p.firstName} ${p.lastName ?? ""}`);
}

/** Texto pesquisável (sem acentos) gravado em Person.searchText. */
export function personSearchText(p: {
  firstName: string;
  lastName?: string | null;
  badgeName?: string | null;
  email?: string | null;
  cpf?: string | null;
  jobTitle?: string | null;
  city?: string | null;
  organizations?: string[];
}): string {
  return foldText(
    [
      p.firstName,
      p.lastName,
      p.badgeName,
      p.email,
      p.cpf,
      p.jobTitle,
      p.city,
      ...(p.organizations ?? []),
    ].join(" "),
  );
}

export type IdentityKeys = { cpf: string; email: string; phone: string };

/** Chaves de identidade comparáveis (CPF, e-mail normalizado, telefone canônico). */
export function identityKeys(p: {
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
}): IdentityKeys {
  return {
    cpf: isValidCpf(p.cpf) ? normalizeCpf(p.cpf) : "",
    email: normalizeEmail(p.email),
    phone: normalizePhone(p.phone)?.identity ?? "",
  };
}

export type DuplicateMatch<T> = { person: T; reason: "CPF" | "EMAIL" | "PHONE" };

/**
 * Encontra a pessoa já cadastrada que corresponde ao candidato.
 * Prioridade: CPF > e-mail > telefone. Mesmo e-mail ou telefone com CPF
 * DIFERENTE é outra pessoa (mãe e filha com o mesmo e-mail).
 */
export function findDuplicate<
  T extends { cpf?: string | null; email?: string | null; phone?: string | null },
>(
  candidate: { cpf?: string | null; email?: string | null; phone?: string | null },
  existing: readonly T[],
): DuplicateMatch<T> | null {
  const c = identityKeys(candidate);
  const keyed = existing.map((person) => ({ person, k: identityKeys(person) }));
  const compatible = (k: IdentityKeys) => !(c.cpf && k.cpf && c.cpf !== k.cpf);

  if (c.cpf) {
    const hit = keyed.find((e) => e.k.cpf === c.cpf);
    if (hit) return { person: hit.person, reason: "CPF" };
  }
  if (c.email) {
    const hit = keyed.find((e) => e.k.email === c.email && compatible(e.k));
    if (hit) return { person: hit.person, reason: "EMAIL" };
  }
  if (c.phone) {
    const hit = keyed.find((e) => e.k.phone === c.phone && compatible(e.k));
    if (hit) return { person: hit.person, reason: "PHONE" };
  }
  return null;
}

/** "sim", "x", "autorizo"… → true */
export function parseYes(value: unknown): boolean {
  return ["sim", "s", "yes", "y", "1", "true", "x", "autorizo", "aceito"].includes(
    foldText(String(value ?? "")),
  );
}
