import { z } from "zod";
import { CABIN_CLASSES } from "../catalog";
import { parseMoneyToCents, TRAVEL_CURRENCIES } from "./money";

/**
 * Cotações comparáveis. Cada opção tem linhas por serviço (aéreo, hotel…);
 * o total é a soma das linhas e o valor por passageiro deriva dele — assim a
 * comparação lado a lado e a política sempre batem com o que foi descrito.
 */

/** Serviços que podem aparecer numa linha de cotação. */
export const QUOTE_LINE_TYPES = [
  "AIR",
  "HOTEL",
  "TRANSFER",
  "CAR_RENTAL",
  "CHAUFFEUR",
  "TRAVEL_INSURANCE",
  "CURRENCY_EXCHANGE",
  "VISA",
  "CONNECTIVITY",
  "EVENT_TICKET",
  "SERVICE_FEE",
  "CUSTOM",
] as const;
export type QuoteLineType = (typeof QUOTE_LINE_TYPES)[number];

export const quoteLineSchema = z.object({
  type: z.enum(QUOTE_LINE_TYPES),
  title: z.string().trim().min(2, "Descreva o serviço.").max(200),
  description: z.string().trim().max(1000).default(""),
  amount: z.string().trim().max(30),
  quantity: z.coerce.number().int().min(1).max(365).default(1),
  cabin: z.union([z.enum(CABIN_CLASSES), z.literal("")]).default(""),
  stars: z.union([z.enum(["3", "4", "5"]), z.literal("")]).default(""),
});

export const quoteInputSchema = z.object({
  title: z.string().trim().min(2, "Dê um nome à opção (ex.: Opção 1 — voo direto).").max(120),
  description: z.string().trim().max(2000).default(""),
  currency: z.enum(TRAVEL_CURRENCIES).default("BRL"),
  validUntil: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), z.literal("")])
    .default(""),
  lines: z.array(quoteLineSchema).min(1, "Inclua ao menos um serviço na opção.").max(20),
});

export type QuoteInput = z.input<typeof quoteInputSchema>;

export type NormalizedQuoteLine = {
  type: QuoteLineType;
  title: string;
  description: string;
  saleCents: number;
  quantity: number;
  cabin: (typeof CABIN_CLASSES)[number] | null;
  stars: number | null;
};

export type QuoteLinesResult =
  | { ok: true; lines: NormalizedQuoteLine[]; totalCents: number }
  | { ok: false; error: string; field: string };

export function normalizeQuoteLines(lines: z.output<typeof quoteLineSchema>[]): QuoteLinesResult {
  const out: NormalizedQuoteLine[] = [];
  for (const [i, l] of lines.entries()) {
    const cents = parseMoneyToCents(l.amount);
    if (cents === null || !Number.isFinite(cents) || cents < 0)
      return {
        ok: false,
        error: "Informe o valor do serviço, por exemplo 1.250,00.",
        field: `lines.${i}.amount`,
      };
    out.push({
      type: l.type,
      title: l.title,
      description: l.description,
      saleCents: cents,
      quantity: l.quantity,
      cabin: l.type === "AIR" && l.cabin ? l.cabin : null,
      stars: l.type === "HOTEL" && l.stars ? Number(l.stars) : null,
    });
  }
  const totalCents = out.reduce((s, l) => s + l.saleCents, 0);
  if (totalCents <= 0) return { ok: false, error: "A opção precisa ter valor.", field: "lines" };
  return { ok: true, lines: out, totalCents };
}

/** Valor por passageiro (arredondado ao centavo). */
export const perPaxCents = (totalCents: number, pax: number) =>
  Math.round(totalCents / Math.max(1, pax));

export function isQuoteExpired(validUntil: Date | null | undefined, now: Date): boolean {
  return !!validUntil && validUntil.getTime() < now.getTime();
}

export type ComparableQuote = {
  id: string;
  currency: string;
  totalCents: number;
  validUntil: Date | null;
  inPolicy: boolean | null;
};

/**
 * Destaques da comparação: a mais barata entre as válidas (por moeda
 * principal — a da maioria) e se há mistura de moedas (não comparar
 * direto, avisar).
 */
export function compareQuotes(quotes: readonly ComparableQuote[], now: Date) {
  const valid = quotes.filter((q) => !isQuoteExpired(q.validUntil, now));
  const byCurrency = new Map<string, number>();
  for (const q of valid) byCurrency.set(q.currency, (byCurrency.get(q.currency) ?? 0) + 1);
  const main = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const cheapest = valid
    .filter((q) => q.currency === main)
    .sort((a, b) => a.totalCents - b.totalCents)[0];
  return {
    cheapestId: valid.length > 1 ? (cheapest?.id ?? null) : null,
    mixedCurrencies: byCurrency.size > 1,
    expiredIds: quotes.filter((q) => isQuoteExpired(q.validUntil, now)).map((q) => q.id),
  };
}
