import { z } from "zod";
import { CABIN_CLASS_LABELS, CABIN_CLASSES, SERVICE_TYPES } from "../catalog";
import { foldText } from "../people";
import { formatCents } from "./money";

/**
 * POLÍTICA DE VIAGEM — regras do cliente como DADO (TravelPolicy +
 * TravelPolicyRule). Esta é a avaliação pura: recebe a política, a
 * solicitação e (opcionalmente) a cotação, e devolve as violações em
 * português. Fora da política NÃO bloqueia: a solicitação é sinalizada e
 * passa a exigir justificativa e/ou aprovação (ver approval.ts).
 *
 * Valores comparados por passageiro:
 *   unidade "trecho" → total do serviço ÷ passageiros ÷ trechos
 *   unidade "viagem" → total do serviço ÷ passageiros
 *   unidade "noite" / "diaria" → total ÷ quantidade (noites/diárias) do item
 *   unidade "pessoa" → total ÷ passageiros
 */

export type CabinClass = (typeof CABIN_CLASSES)[number];
export const POLICY_UNITS = ["trecho", "viagem", "noite", "diaria", "pessoa"] as const;
export type PolicyUnit = (typeof POLICY_UNITS)[number];
export const POLICY_UNIT_LABELS: Record<PolicyUnit, string> = {
  trecho: "por trecho",
  viagem: "por viagem",
  noite: "por noite",
  diaria: "por diária",
  pessoa: "por pessoa",
};

export const policyAppliesToSchema = z
  .object({
    memberTypes: z.array(z.string()).default([]),
    jobTitles: z.array(z.string()).default([]),
  })
  .catch({ memberTypes: [], jobTitles: [] });

export type PolicyAppliesTo = z.output<typeof policyAppliesToSchema>;

export type PolicyRule = {
  serviceType: string;
  scope: "ANY" | "DOMESTIC" | "INTERNATIONAL";
  destination: string;
  maxAmountCents: number | null;
  unit: string;
  currency: string;
  maxCabin: CabinClass | null;
  maxHotelStars: number | null;
};

export type Policy = {
  id: string;
  name: string;
  active: boolean;
  priority: number;
  appliesTo: unknown;
  minAdvanceDays: number | null;
  requireInsuranceInternational: boolean;
  requireJustification: boolean;
  rules: PolicyRule[];
};

export type PolicyTraveler = { memberType: string; jobTitle: string };

function matchesList(list: readonly string[], value: string): boolean {
  if (!list.length) return true;
  const v = foldText(value);
  return !!v && list.some((x) => foldText(x) === v);
}

/** Quantas condições a política restringe (a mais específica vence no empate de prioridade). */
function specificity(a: PolicyAppliesTo) {
  return (a.memberTypes.length ? 1 : 0) + (a.jobTitles.length ? 1 : 0);
}

/**
 * Política que vale para o solicitante: ativa, cujo público inclui a pessoa
 * (listas vazias = todos), de maior prioridade; no empate, a mais específica.
 */
export function selectPolicy<P extends Policy>(
  policies: readonly P[],
  traveler: PolicyTraveler,
): P | null {
  const candidates = policies
    .filter((p) => p.active)
    .map((p) => ({ p, a: policyAppliesToSchema.parse(p.appliesTo ?? {}) }))
    .filter(
      ({ a }) =>
        matchesList(a.memberTypes, traveler.memberType) &&
        matchesList(a.jobTitles, traveler.jobTitle),
    )
    .sort((x, y) => y.p.priority - x.p.priority || specificity(y.a) - specificity(x.a));
  return candidates[0]?.p ?? null;
}

export type PolicySubject = {
  scope: "DOMESTIC" | "INTERNATIONAL";
  destinations: readonly string[];
  departDate: Date | null;
  /** Momento da compra (criação da solicitação ou escolha da opção) */
  at: Date;
  segments: number;
  pax: number;
  requestedServices: readonly string[];
  requestedCabin?: CabinClass | null;
  requestedStars?: number | null;
  quote?: {
    currency: string;
    items: readonly {
      type: string;
      saleCents: number;
      quantity: number;
      cabin?: CabinClass | null;
      stars?: number | null;
    }[];
  } | null;
};

export type PolicyViolation = {
  code: "ADVANCE" | "CABIN" | "HOTEL_STARS" | "AMOUNT" | "INSURANCE";
  /** Regra em linguagem de gente: "Antecedência mínima" */
  rule: string;
  expected: string;
  found: string;
  message: string;
};

const DAY = 86_400_000;

/** Dias inteiros entre o dia da compra e o dia do embarque (calendário UTC). */
export function advanceDays(at: Date, departDate: Date): number {
  const a = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  const d = Date.UTC(
    departDate.getUTCFullYear(),
    departDate.getUTCMonth(),
    departDate.getUTCDate(),
  );
  return Math.round((d - a) / DAY);
}

const cabinRank = (c: CabinClass) => CABIN_CLASSES.indexOf(c);

function ruleApplies(rule: PolicyRule, s: PolicySubject): boolean {
  if (rule.scope !== "ANY" && rule.scope !== s.scope) return false;
  const dest = foldText(rule.destination);
  if (!dest) return true;
  return s.destinations.some((d) => foldText(d).includes(dest));
}

/** Tipos de serviço comparáveis pela mesma regra (um "Hotel" vale para resort e temporada). */
function sameFamily(ruleType: string, itemType: string): boolean {
  if (ruleType === itemType) return true;
  const lodging = ["HOTEL", "RESORT", "VACATION_RENTAL"];
  return lodging.includes(ruleType) && lodging.includes(itemType);
}

function serviceLabel(type: string) {
  return (SERVICE_TYPES as Record<string, { label: string }>)[type]?.label ?? type;
}

function perUnitCents(rule: PolicyRule, s: PolicySubject): number | null {
  const items = (s.quote?.items ?? []).filter((i) => sameFamily(rule.serviceType, i.type));
  if (!items.length) return null;
  const total = items.reduce((sum, i) => sum + i.saleCents, 0);
  const pax = Math.max(1, s.pax);
  switch (rule.unit as PolicyUnit) {
    case "trecho":
      return Math.round(total / pax / Math.max(1, s.segments));
    case "viagem":
    case "pessoa":
      return Math.round(total / pax);
    case "noite":
    case "diaria": {
      const qty = items.reduce((sum, i) => sum + Math.max(1, i.quantity), 0);
      return Math.round(total / qty);
    }
    default:
      return Math.round(total / pax);
  }
}

/**
 * Avalia a solicitação (e a cotação, se houver) contra a política. Devolve a
 * lista de violações — vazia quando está dentro da política.
 */
export function evaluatePolicy(policy: Policy | null, s: PolicySubject): PolicyViolation[] {
  if (!policy) return [];
  const out: PolicyViolation[] = [];

  if (policy.minAdvanceDays !== null && s.departDate) {
    const days = advanceDays(s.at, s.departDate);
    if (days < policy.minAdvanceDays) {
      out.push({
        code: "ADVANCE",
        rule: "Antecedência mínima",
        expected: `${policy.minAdvanceDays} dias`,
        found: `${Math.max(0, days)} ${days === 1 ? "dia" : "dias"}`,
        message: `A compra está sendo feita com ${Math.max(0, days)} ${days === 1 ? "dia" : "dias"} de antecedência; a política pede pelo menos ${policy.minAdvanceDays}.`,
      });
    }
  }

  if (
    policy.requireInsuranceInternational &&
    s.scope === "INTERNATIONAL" &&
    !s.requestedServices.includes("TRAVEL_INSURANCE") &&
    !(s.quote?.items ?? []).some((i) => i.type === "TRAVEL_INSURANCE")
  ) {
    out.push({
      code: "INSURANCE",
      rule: "Seguro viagem",
      expected: "Incluído",
      found: "Não pedido",
      message: "Viagens internacionais precisam de seguro viagem pela política.",
    });
  }

  const rules = policy.rules.filter((r) => ruleApplies(r, s));
  for (const rule of rules) {
    // Classe da cabine: a pedida e a cotada
    if (rule.maxCabin && sameFamily(rule.serviceType, "AIR")) {
      const quoted = (s.quote?.items ?? [])
        .filter((i) => i.type === "AIR" && i.cabin)
        .map((i) => i.cabin!);
      const cabins = [...(s.requestedCabin ? [s.requestedCabin] : []), ...quoted];
      const worst = cabins.sort((a, b) => cabinRank(b) - cabinRank(a))[0];
      if (worst && cabinRank(worst) > cabinRank(rule.maxCabin)) {
        out.push({
          code: "CABIN",
          rule: "Classe permitida",
          expected: `Até ${CABIN_CLASS_LABELS[rule.maxCabin].toLowerCase()}`,
          found: CABIN_CLASS_LABELS[worst],
          message: `A classe ${CABIN_CLASS_LABELS[worst].toLowerCase()} está acima do permitido (até ${CABIN_CLASS_LABELS[rule.maxCabin].toLowerCase()}).`,
        });
      }
    }

    // Categoria do hotel
    if (rule.maxHotelStars && sameFamily(rule.serviceType, "HOTEL")) {
      const quoted = (s.quote?.items ?? [])
        .filter((i) => sameFamily("HOTEL", i.type) && i.stars)
        .map((i) => i.stars!);
      const stars = [...(s.requestedStars ? [s.requestedStars] : []), ...quoted];
      const top = Math.max(0, ...stars);
      if (top > rule.maxHotelStars) {
        out.push({
          code: "HOTEL_STARS",
          rule: "Categoria do hotel",
          expected: `Até ${rule.maxHotelStars} estrelas`,
          found: `${top} estrelas`,
          message: `Hotel de ${top} estrelas está acima do permitido (até ${rule.maxHotelStars}).`,
        });
      }
    }

    // Limite de valor (só com cotação na mesma moeda da regra)
    if (rule.maxAmountCents !== null && s.quote && s.quote.currency === rule.currency) {
      const value = perUnitCents(rule, s);
      if (value !== null && value > rule.maxAmountCents) {
        const unit = POLICY_UNIT_LABELS[rule.unit as PolicyUnit] ?? "";
        const label = serviceLabel(rule.serviceType);
        out.push({
          code: "AMOUNT",
          rule: `Limite de ${label.toLowerCase()} ${unit}`.trim(),
          expected: `Até ${formatCents(rule.maxAmountCents, rule.currency)}`,
          found: formatCents(value, rule.currency),
          message: `${label} ${unit} sai por ${formatCents(value, rule.currency)} por passageiro; o limite é ${formatCents(rule.maxAmountCents, rule.currency)}.`,
        });
      }
    }
  }

  return out;
}

/** Ex.: "Limite de aéreo por trecho: até R$ 1.200,00". */
export function describeRule(rule: PolicyRule): string {
  const parts: string[] = [];
  const label = serviceLabel(rule.serviceType);
  if (rule.maxAmountCents !== null)
    parts.push(
      `${label} ${POLICY_UNIT_LABELS[rule.unit as PolicyUnit] ?? ""}: até ${formatCents(rule.maxAmountCents, rule.currency)}`,
    );
  if (rule.maxCabin) parts.push(`classe até ${CABIN_CLASS_LABELS[rule.maxCabin].toLowerCase()}`);
  if (rule.maxHotelStars) parts.push(`hotel até ${rule.maxHotelStars} estrelas`);
  const where = [
    rule.scope === "DOMESTIC" ? "nacional" : rule.scope === "INTERNATIONAL" ? "internacional" : "",
    rule.destination ? `destino ${rule.destination}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return parts.join(" · ") + (where ? ` (${where})` : "");
}
