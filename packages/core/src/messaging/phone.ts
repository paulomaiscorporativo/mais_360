/**
 * Telefones para WhatsApp.
 *
 * Armazenamos E.164 sem o "+": 5511999998888. Para o Brasil, celular com e sem
 * o 9º dígito (55 11 9xxxx-xxxx × 55 11 xxxx-xxxx) é o MESMO WhatsApp — mandar
 * duas vezes para o mesmo aparelho é o tipo de coisa que gera denúncia e
 * bloqueio do número. `whatsappIdentity` devolve uma chave canônica para deduplicar.
 */

export const onlyDigits = (v: string | null | undefined): string =>
  String(v ?? "").replace(/\D/g, "");

export type NormalizedPhone = {
  /** E.164 sem "+" */
  e164: string;
  /** Chave para detectar o mesmo WhatsApp escrito de formas diferentes */
  identity: string;
  isBrazil: boolean;
  isMobile: boolean;
};

/**
 * Normaliza um telefone digitado livremente. Sem código de país, assume Brasil.
 * Devolve null quando não dá para confiar no número.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountry = "55",
): NormalizedPhone | null {
  let d = onlyDigits(raw);
  if (!d) return null;
  // "0 11 9xxxx" (DDD com zero de operadora) e "00 55 ..." (discagem internacional)
  if (d.startsWith("00") && d.length >= 12) d = d.slice(2);
  else if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);

  if (d.length === 10 || d.length === 11) d = defaultCountry + d;

  if (d.startsWith("55")) {
    const national = d.slice(2);
    if (national.length !== 10 && national.length !== 11) return null;
    const ddd = national.slice(0, 2);
    if (Number(ddd) < 11 || ddd[1] === "0") return null;
    const subscriber = national.slice(2);
    // 9 dígitos começando com 9 = celular; 8 dígitos começando com 6-9 = celular sem o 9º dígito
    const isMobile =
      (subscriber.length === 9 && subscriber[0] === "9") ||
      (subscriber.length === 8 && /[6-9]/.test(subscriber[0] ?? ""));
    if (subscriber.length === 9 && subscriber[0] !== "9") return null;
    const canonicalSubscriber = subscriber.length === 8 && isMobile ? "9" + subscriber : subscriber;
    return {
      e164: d,
      identity: `55${ddd}${canonicalSubscriber}`,
      isBrazil: true,
      isMobile,
    };
  }

  // Internacional: confia no comprimento E.164 (8 a 15 dígitos)
  if (d.length < 8 || d.length > 15) return null;
  return { e164: d, identity: d, isBrazil: false, isMobile: true };
}

/** Telefone formatado para exibição: +55 (11) 99999-8888 */
export function formatPhoneBR(e164: string): string {
  const d = onlyDigits(e164);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const n = d.slice(4);
    return `+55 (${ddd}) ${n.slice(0, n.length - 4)}-${n.slice(-4)}`;
  }
  return d ? `+${d}` : "";
}

/** Mascara para logs e relatórios: ...8888 */
export function maskPhone(e164: string): string {
  const d = onlyDigits(e164);
  return d.length > 4 ? `…${d.slice(-4)}` : d;
}
