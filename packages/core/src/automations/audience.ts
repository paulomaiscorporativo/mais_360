import { z } from "zod";
import {
  documentRequirements,
  PERSON_DOCUMENT_LABEL,
  REQUIREMENT_STATUS_LABEL,
  type DocumentRequirementStatus,
  type PersonDocumentKind,
} from "../travel/traveler";
import type { AutomationTrigger } from "./schedule";

/**
 * Quem recebe uma régua: filtro salvo (papéis, situações, categorias) +
 * regras do gatilho (passaporte, documentos, voo, cota de convites).
 */

const ROLES = [
  "TRAVELER",
  "COMPANION",
  "GUEST",
  "ATTENDEE",
  "EXHIBITOR",
  "SPEAKER",
  "STAFF",
  "PRESS",
] as const;
const STATUSES = ["PENDING", "INVITED", "CONFIRMED", "DECLINED", "WAITLIST", "CANCELED"] as const;

export type RegistrationRoleKey = (typeof ROLES)[number];
export type RegistrationStatusKey = (typeof STATUSES)[number];

export const automationFilterSchema = z.object({
  roles: z.array(z.enum(ROLES)).max(ROLES.length).optional(),
  statuses: z.array(z.enum(STATUSES)).max(STATUSES.length).optional(),
  categoryIds: z.array(z.string().min(1)).max(100).optional(),
});

export type AutomationFilter = z.infer<typeof automationFilterSchema>;

/** Lê `MessageAutomation.filter` tolerando Json antigo ou inválido (vira "todos"). */
export function readAutomationFilter(raw: unknown): AutomationFilter {
  if (!raw || typeof raw !== "object") return {};
  const r = automationFilterSchema.safeParse(raw);
  if (r.success) return r.data;
  // Mantém o que der para aproveitar, descartando valores desconhecidos
  const o = raw as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[]) =>
    Array.isArray(v) ? v.filter((x): x is T => allowed.includes(x as T)) : undefined;
  return {
    roles: pick(o.roles, ROLES),
    statuses: pick(o.statuses, STATUSES),
    categoryIds: Array.isArray(o.categoryIds)
      ? o.categoryIds.filter((x): x is string => typeof x === "string" && !!x)
      : undefined,
  };
}

/**
 * Situações que recebem quando a régua não escolheu nenhuma: ninguém que
 * cancelou ou recusou recebe lembrete. No check-in, a pessoa está presente.
 */
export function defaultStatuses(trigger: AutomationTrigger): RegistrationStatusKey[] {
  // Data-limite das cotas: lista de espera não usa convite
  if (trigger === "INVITE_DEADLINE_BEFORE") return ["PENDING", "INVITED", "CONFIRMED"];
  return ["PENDING", "INVITED", "CONFIRMED", "WAITLIST"];
}

/** Situações efetivas da régua (escolhidas, sem nunca incluir cancelados). */
export function effectiveStatuses(
  trigger: AutomationTrigger,
  filter: AutomationFilter,
): RegistrationStatusKey[] {
  const chosen = filter.statuses?.length ? filter.statuses : defaultStatuses(trigger);
  return chosen.filter((s) => s !== "CANCELED");
}

export type FilterableRegistration = {
  role: string;
  status: string;
  categoryId: string | null;
};

/** A inscrição passa no filtro da régua? */
export function matchesAutomationFilter(
  reg: FilterableRegistration,
  trigger: AutomationTrigger,
  filter: AutomationFilter,
): boolean {
  if (!effectiveStatuses(trigger, filter).includes(reg.status as RegistrationStatusKey))
    return false;
  if (filter.roles?.length && !filter.roles.includes(reg.role as RegistrationRoleKey)) return false;
  if (
    filter.categoryIds?.length &&
    (!reg.categoryId || !filter.categoryIds.includes(reg.categoryId))
  )
    return false;
  return true;
}

// ---------------------------------------------------------------------------
// Pendências de viagem
// ---------------------------------------------------------------------------

export type TravelDocument = {
  id: string;
  kind: PersonDocumentKind;
  expiresAt: Date | null;
  createdAt: Date;
};

export type TravelerDocumentState = {
  required: PersonDocumentKind[];
  /** Documentos enviados pela pessoa (PersonDocument) */
  uploaded: TravelDocument[];
  /** Passaporte digitado no cadastro (Person.passportNumber/Expiry) */
  passportNumber?: string;
  passportExpiry?: Date | null;
  tripEnd: Date | null;
};

export type Pendency = {
  kind: PersonDocumentKind;
  status: Exclude<DocumentRequirementStatus, "OK">;
  /** "Passaporte: vencido" */
  label: string;
};

/**
 * Documentos exigidos que ainda não estão em dia. O passaporte digitado no
 * cadastro conta como enviado quando não há arquivo (o cadastro é sincronizado
 * a partir do documento, mas o inverso pode acontecer na importação).
 */
export function travelerPendingDocuments(s: TravelerDocumentState, now: Date): Pendency[] {
  const uploaded = [...s.uploaded];
  if (s.passportNumber && !uploaded.some((d) => d.kind === "PASSPORT")) {
    uploaded.push({
      id: "cadastro",
      kind: "PASSPORT",
      expiresAt: s.passportExpiry ?? null,
      createdAt: new Date(0),
    });
  }
  return documentRequirements(s.required, uploaded, s.tripEnd, now)
    .filter((r): r is typeof r & { status: Pendency["status"] } => r.status !== "OK")
    .map((r) => ({
      kind: r.kind,
      status: r.status,
      label: `${PERSON_DOCUMENT_LABEL[r.kind]}: ${REQUIREMENT_STATUS_LABEL[r.status].toLowerCase()}`,
    }));
}

/** Pendência do passaporte (ausente, vencido ou vencendo), se o passaporte é exigido. */
export function passportPendency(s: TravelerDocumentState, now: Date): Pendency | null {
  if (!s.required.includes("PASSPORT")) return null;
  return (
    travelerPendingDocuments({ ...s, required: ["PASSPORT"] }, now).find(
      (p) => p.kind === "PASSPORT",
    ) ?? null
  );
}

/** Texto do campo {{pendencias}}: uma por linha, com marcador. */
export function formatPendencies(list: readonly Pendency[]): string {
  return list.map((p) => `• ${p.label}`).join("\n");
}

// ---------------------------------------------------------------------------
// Convites com cota
// ---------------------------------------------------------------------------

/** Responsável de empresa ainda tem convites para usar? (público da data-limite) */
export function quotaHasRoom(q: { quota: number; used: number; lockedAt: Date | null }): boolean {
  return !q.lockedAt && q.used < q.quota;
}
