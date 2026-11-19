import { z } from "zod";
import { normalizePhone } from "./phone";
import type { Channel } from "./dedupe";

/**
 * Público de uma campanha. Guardado em `MessageCampaign.audience` e expandido
 * pelo servidor em entregas individuais no momento da criação.
 */

const registrationStatus = z.enum([
  "PENDING",
  "INVITED",
  "CONFIRMED",
  "DECLINED",
  "WAITLIST",
  "CANCELED",
]);
const registrationRole = z.enum([
  "TRAVELER",
  "COMPANION",
  "GUEST",
  "ATTENDEE",
  "EXHIBITOR",
  "SPEAKER",
  "STAFF",
  "PRESS",
]);

export const audienceSchema = z.discriminatedUnion("kind", [
  /** Filtro sobre as inscrições de um projeto */
  z.object({
    kind: z.literal("registrations"),
    statuses: z.array(registrationStatus).optional(),
    roles: z.array(registrationRole).optional(),
    categoryIds: z.array(z.string().min(1)).optional(),
    groupIds: z.array(z.string().min(1)).optional(),
    /** true = só credenciados; false = só quem ainda não fez check-in */
    checkedIn: z.boolean().optional(),
    /** Inclui inscrições canceladas? Padrão: não */
    includeCanceled: z.boolean().default(false),
  }),
  /** Inscrições escolhidas uma a uma */
  z.object({
    kind: z.literal("explicit"),
    registrationIds: z.array(z.string().min(1)).min(1, "Selecione ao menos uma pessoa."),
  }),
  /** Base de membros do cliente (associados, colaboradores…) — sem projeto */
  z.object({
    kind: z.literal("members"),
    memberTypes: z.array(z.string()).optional(),
    personIds: z.array(z.string().min(1)).optional(),
  }),
]);

export type Audience = z.output<typeof audienceSchema>;

export type Candidate = {
  /** id usado na dedupeKey: inscrição (projeto) ou pessoa (membros) */
  recipientId: string;
  personId: string;
  registrationId?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  /** Consentimento WHATSAPP explicitamente negado */
  whatsappOptOut?: boolean;
};

export type SkipReason =
  "NO_EMAIL" | "INVALID_EMAIL" | "NO_PHONE" | "INVALID_PHONE" | "DUPLICATE" | "OPT_OUT";

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  NO_EMAIL: "Sem e-mail cadastrado",
  INVALID_EMAIL: "E-mail inválido",
  NO_PHONE: "Sem WhatsApp cadastrado",
  INVALID_PHONE: "Telefone inválido para WhatsApp",
  DUPLICATE: "Mesmo destino de outra pessoa da lista",
  OPT_OUT: "Não autorizou mensagens por WhatsApp",
};

export type PlannedRecipient =
  | { candidate: Candidate; target: string; skip?: undefined }
  | { candidate: Candidate; target: string; skip: SkipReason };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Decide, para cada candidato, o destino no canal e se deve ser pulado.
 * Um envio por destino: dois cadastros com o mesmo e-mail/WhatsApp recebem uma vez.
 */
export function planRecipients(
  candidates: readonly Candidate[],
  channel: Channel,
): PlannedRecipient[] {
  const seen = new Set<string>();
  return candidates.map((c) => {
    if (channel === "EMAIL") {
      const email = String(c.email ?? "")
        .trim()
        .toLowerCase();
      if (!email) return { candidate: c, target: "", skip: "NO_EMAIL" as const };
      if (!EMAIL_RE.test(email))
        return { candidate: c, target: email, skip: "INVALID_EMAIL" as const };
      if (seen.has(email)) return { candidate: c, target: email, skip: "DUPLICATE" as const };
      seen.add(email);
      return { candidate: c, target: email };
    }
    if (!String(c.phone ?? "").trim())
      return { candidate: c, target: "", skip: "NO_PHONE" as const };
    const phone = normalizePhone(c.phone);
    if (!phone || !phone.isMobile)
      return { candidate: c, target: String(c.phone), skip: "INVALID_PHONE" as const };
    if (c.whatsappOptOut) return { candidate: c, target: phone.e164, skip: "OPT_OUT" as const };
    if (seen.has(phone.identity))
      return { candidate: c, target: phone.e164, skip: "DUPLICATE" as const };
    seen.add(phone.identity);
    return { candidate: c, target: phone.e164 };
  });
}
