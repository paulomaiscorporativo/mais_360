/**
 * Dinheiro em centavos (Int) + moeda. Entrada digitada em formato brasileiro
 * ("1.234,56", "R$ 980", "1234.5") vira centavos; a exibição usa Intl.
 */

export const TRAVEL_CURRENCIES = ["BRL", "USD", "EUR"] as const;
export type TravelCurrency = (typeof TRAVEL_CURRENCIES)[number];

/**
 * Converte texto digitado em centavos. Vazio → null; texto inválido → NaN
 * (quem chama decide a mensagem). Aceita vírgula ou ponto como decimal.
 */
export function parseMoneyToCents(input: string | null | undefined): number | null {
  const raw = (input ?? "").replace(/[^\d,.-]/g, "").trim();
  if (!raw) return null;
  if (raw.startsWith("-")) return Number.NaN;
  let normalized: string;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  if (lastComma > -1 && lastComma > lastDot) {
    // 1.234,56 → vírgula decimal, pontos de milhar
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1 && lastComma > -1) {
    // 1,234.56 → ponto decimal, vírgulas de milhar
    normalized = raw.replace(/,/g, "");
  } else if (lastDot > -1) {
    // Só pontos: "1.234" (milhar) ou "1234.5" (decimal)
    const decimals = raw.length - lastDot - 1;
    normalized = decimals === 3 && raw.split(".").length >= 2 ? raw.replace(/\./g, "") : raw;
  } else normalized = raw;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  return Math.round(Number(normalized) * 100);
}

/** "R$ 1.234,56" / "US$ 980,00" / "€ 1.020,00". */
export function formatCents(cents: number | null | undefined, currency = "BRL"): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2).replace(".", ",")}`;
  }
}

/** Centavos para o campo de edição ("1234,56"), sem símbolo. */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}
