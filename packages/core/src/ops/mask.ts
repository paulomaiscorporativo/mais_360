/**
 * Máscara de dados pessoais e segredos para exibir payloads e erros de jobs no
 * painel de operação. A regra é conservadora: na dúvida, esconde.
 *
 *  • chaves de segredo (token, senha, link, url, hash…) → "•••";
 *  • chaves de contato (e-mail, telefone, destinatário, nome) → valor mascarado;
 *  • em qualquer texto: e-mails, telefones e sequências longas com cara de token;
 *  • corpo de mensagem é cortado; listas grandes viram "n itens".
 */

const HIDDEN = "•••";

const SECRET_KEY =
  /(token|secret|senha|password|pass$|hash|apikey|api_key|authorization|cookie|link|url|signature|embedding|cpf|document)/i;
const CONTACT_KEY = /(email|e-mail|^to$|target|phone|telefone|whatsapp|recipient|name$|nome)/i;
const ID_KEY = /(^id$|Id$|Ids$|^queue$|^kind$|^purpose$|^status$|^channel$)/;

const EMAIL_RE = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
// Telefones: +55 11 91234-5678, (11) 91234-5678, 5511912345678…
const PHONE_RE = /\+?\(?\d{2,3}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g;
// Tokens: 32+ caracteres de base64url/hex seguidos
const TOKEN_RE = /[A-Za-z0-9_-]{32,}/g;

export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return HIDDEN;
  return `${email[0]}•••@${email.slice(at + 1)}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return HIDDEN;
  return `•••${digits.slice(-4)}`;
}

/** Mascara e-mails, telefones e tokens soltos dentro de um texto livre. */
export function maskText(text: string, max = 500): string {
  const masked = text
    .replace(EMAIL_RE, (_m, first: string, domain: string) => `${first}•••@${domain}`)
    .replace(TOKEN_RE, HIDDEN)
    .replace(PHONE_RE, (m) => maskPhone(m));
  return masked.length > max ? `${masked.slice(0, max - 1)}…` : masked;
}

function maskContact(value: string): string {
  if (value.includes("@")) return maskEmail(value.trim());
  if (/\d{6,}/.test(value.replace(/\D/g, ""))) return maskPhone(value);
  // Nome: só a inicial de cada parte
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => `${p[0]}.`)
    .join(" ");
}

type Masked = string | number | boolean | null | Masked[] | { [k: string]: Masked };

/**
 * Versão segura do payload para exibir. Profundidade e tamanho limitados para o
 * painel não virar um despejo do banco.
 */
export function maskPayload(value: unknown, depth = 0, key = ""): Masked {
  if (value === null || value === undefined) return null;
  if (key && SECRET_KEY.test(key) && !ID_KEY.test(key)) return HIDDEN;
  if (typeof value === "string") {
    if (key && ID_KEY.test(key)) return value.length > 64 ? `${value.slice(0, 63)}…` : value;
    if (key && CONTACT_KEY.test(key)) return maskContact(value);
    return maskText(value, 80);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 3) return Array.isArray(value) ? `${value.length} itens` : "{…}";
  if (Array.isArray(value)) {
    if (value.length > 5) return `${value.length} itens`;
    return value.map((v) => maskPayload(v, depth + 1, key));
  }
  if (typeof value === "object") {
    const out: Record<string, Masked> = {};
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [k, v] of entries.slice(0, 12)) out[k] = maskPayload(v, depth + 1, k);
    if (entries.length > 12) out["…"] = `mais ${entries.length - 12} campos`;
    return out;
  }
  return HIDDEN;
}

/** Payload mascarado em uma linha, para tabela. */
export function payloadSummary(value: unknown, max = 240): string {
  const s = JSON.stringify(maskPayload(value));
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
