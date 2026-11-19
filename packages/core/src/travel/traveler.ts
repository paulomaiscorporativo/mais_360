import { z } from "zod";
import { isVisibleTo, type AudienceViewer, type SegmentAudience } from "./operations";

/**
 * Regras do que o viajante vê e faz: mural, suporte, documentos exigidos e
 * vouchers. Puro e testado — as telas e o portal só orquestram.
 */

// ---------------------------------------------------------------------------
// Mural
// ---------------------------------------------------------------------------

export type MuralPostLike = {
  id: string;
  audience: SegmentAudience;
  audienceId: string | null;
  urgent: boolean;
  pinned: boolean;
  active: boolean;
  publishAt: Date;
  expiresAt: Date | null;
};

export type MuralState = "SCHEDULED" | "LIVE" | "EXPIRED" | "HIDDEN";

export const MURAL_STATE_LABEL: Record<MuralState, string> = {
  SCHEDULED: "Agendado",
  LIVE: "No ar",
  EXPIRED: "Expirado",
  HIDDEN: "Oculto",
};

/** Situação do aviso agora: oculto, agendado, no ar ou expirado. */
export function muralState(post: MuralPostLike, now = new Date()): MuralState {
  if (!post.active) return "HIDDEN";
  if (post.publishAt.getTime() > now.getTime()) return "SCHEDULED";
  if (post.expiresAt && post.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "LIVE";
}

/** Ordem do mural: fixados, depois urgentes, depois os mais recentes. */
export function sortMural<T extends Pick<MuralPostLike, "pinned" | "urgent" | "publishAt">>(
  posts: T[],
): T[] {
  return [...posts].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      Number(b.urgent) - Number(a.urgent) ||
      b.publishAt.getTime() - a.publishAt.getTime(),
  );
}

/** Avisos que o viajante vê agora, na ordem do mural. */
export function visibleMural<T extends MuralPostLike>(
  posts: T[],
  viewer: AudienceViewer,
  now = new Date(),
): T[] {
  return sortMural(posts.filter((p) => muralState(p, now) === "LIVE" && isVisibleTo(p, viewer)));
}

// ---------------------------------------------------------------------------
// Suporte
// ---------------------------------------------------------------------------

export type TicketStatus = "NEW" | "IN_PROGRESS" | "ANSWERED" | "RESOLVED";

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: "Novo",
  IN_PROGRESS: "Em atendimento",
  ANSWERED: "Respondido",
  RESOLVED: "Resolvido",
};

/** Como o viajante enxerga o chamado (do ponto de vista dele). */
export const TICKET_STATUS_TRAVELER_LABEL: Record<TicketStatus, string> = {
  NEW: "Enviado",
  IN_PROGRESS: "Em atendimento",
  ANSWERED: "Respondido pela equipe",
  RESOLVED: "Resolvido",
};

/**
 * Status depois de uma nova mensagem: a equipe respondendo deixa "respondido";
 * o viajante escrevendo num chamado respondido ou resolvido o reabre.
 */
export function ticketStatusAfterMessage(
  current: TicketStatus,
  author: "PERSON" | "USER",
): TicketStatus {
  if (author === "USER") return "ANSWERED";
  if (current === "ANSWERED" || current === "RESOLVED") return "IN_PROGRESS";
  return current;
}

/** Chamado espera a equipe? (fila de atendimento) */
export function ticketAwaitsStaff(status: TicketStatus): boolean {
  return status === "NEW" || status === "IN_PROGRESS";
}

// ---------------------------------------------------------------------------
// Documentos do viajante
// ---------------------------------------------------------------------------

export type PersonDocumentKind =
  "PASSPORT" | "RG" | "CNH" | "VISA" | "INSURANCE" | "VACCINE" | "PHOTO" | "OTHER";

export const PERSON_DOCUMENT_LABEL: Record<PersonDocumentKind, string> = {
  PASSPORT: "Passaporte",
  RG: "RG",
  CNH: "CNH",
  VISA: "Visto",
  INSURANCE: "Seguro viagem",
  VACCINE: "Comprovante de vacina",
  PHOTO: "Foto",
  OTHER: "Outro",
};

export const PERSON_DOCUMENT_KINDS = Object.keys(PERSON_DOCUMENT_LABEL) as PersonDocumentKind[];

/** Documentos que expiram e por isso pedem validade. */
export const EXPIRING_KINDS: ReadonlySet<PersonDocumentKind> = new Set([
  "PASSPORT",
  "VISA",
  "CNH",
  "INSURANCE",
]);

export type ProjectDocumentCategory =
  "GENERAL" | "VOUCHER" | "INSURANCE" | "TICKET" | "ITINERARY" | "OTHER";

export const PROJECT_DOCUMENT_LABEL: Record<ProjectDocumentCategory, string> = {
  GENERAL: "Geral",
  VOUCHER: "Voucher",
  INSURANCE: "Seguro",
  TICKET: "Bilhete / ingresso",
  ITINERARY: "Roteiro",
  OTHER: "Outro",
};

/** Configuração de viagem do projeto (`Project.settings.travel`). */
export const travelSettingsSchema = z.object({
  /** Documentos que cada viajante precisa enviar. Vazio = padrão pelo tipo de viagem. */
  requiredDocuments: z
    .array(z.enum(["PASSPORT", "RG", "CNH", "VISA", "INSURANCE", "VACCINE", "PHOTO", "OTHER"]))
    .max(8)
    .default([]),
  /** Viajante pode enviar os próprios documentos pelo portal. */
  travelerUploads: z.boolean().default(true),
  /** Texto do canal de contato de emergência exibido no portal. */
  emergencyContact: z.string().max(300).default(""),
});

export type TravelSettings = z.infer<typeof travelSettingsSchema>;

/** Lê `settings.travel` com defaults, tolerando Json antigo ou inválido. */
export function readTravelSettings(settings: unknown): TravelSettings {
  const raw =
    settings && typeof settings === "object" ? (settings as Record<string, unknown>).travel : {};
  const r = travelSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : travelSettingsSchema.parse({});
}

/** Documentos exigidos: os configurados ou, sem configuração, passaporte (internacional) ou RG. */
export function requiredDocumentKinds(
  settings: TravelSettings,
  international: boolean,
): PersonDocumentKind[] {
  if (settings.requiredDocuments.length) return [...new Set(settings.requiredDocuments)];
  return international ? ["PASSPORT"] : ["RG"];
}

export type DocumentRequirementStatus = "MISSING" | "EXPIRED" | "EXPIRING" | "OK";

export const REQUIREMENT_STATUS_LABEL: Record<DocumentRequirementStatus, string> = {
  MISSING: "Falta enviar",
  EXPIRED: "Vencido",
  EXPIRING: "Vence antes ou logo após a viagem",
  OK: "Em dia",
};

/** Margem de validade: passaporte precisa valer 6 meses após a volta; o resto, até a volta. */
function validityMarginDays(kind: PersonDocumentKind) {
  return kind === "PASSPORT" ? 182 : 0;
}

export type RequirementRow = {
  kind: PersonDocumentKind;
  status: DocumentRequirementStatus;
  documentId: string | null;
};

/**
 * Situação de cada documento exigido para UMA pessoa, considerando o mais
 * recente enviado de cada tipo e a data de volta da viagem.
 */
export function documentRequirements(
  required: PersonDocumentKind[],
  uploaded: { id: string; kind: PersonDocumentKind; expiresAt: Date | null; createdAt: Date }[],
  tripEnd: Date | null,
  now = new Date(),
): RequirementRow[] {
  return required.map((kind) => {
    const latest = uploaded
      .filter((d) => d.kind === kind)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (!latest) return { kind, status: "MISSING", documentId: null };
    if (!latest.expiresAt || !EXPIRING_KINDS.has(kind))
      return { kind, status: "OK", documentId: latest.id };
    if (latest.expiresAt.getTime() < now.getTime())
      return { kind, status: "EXPIRED", documentId: latest.id };
    const ref = Math.max((tripEnd ?? now).getTime(), now.getTime());
    const limit = ref + validityMarginDays(kind) * 86_400_000;
    return {
      kind,
      status: latest.expiresAt.getTime() < limit ? "EXPIRING" : "OK",
      documentId: latest.id,
    };
  });
}

/** Resumo para a lista: quantos exigidos estão em dia. */
export function requirementSummary(rows: RequirementRow[]) {
  const ok = rows.filter((r) => r.status === "OK").length;
  return { ok, total: rows.length, complete: ok === rows.length };
}

// ---------------------------------------------------------------------------
// Vouchers
// ---------------------------------------------------------------------------

/** Até este tamanho a emissão é feita na hora; acima, vira job. */
export const VOUCHER_INLINE_LIMIT = 10;

/** Lotes de emissão em segundo plano (um PDF por viajante). */
export function chunkBatches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size))
    out.push(items.slice(i, i + Math.max(1, size)));
  return out;
}

/** Nome do arquivo do voucher: "voucher-maria-silva.pdf" (sem acento nem espaço). */
export function voucherFileName(templateName: string, personName: string): string {
  const slug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  return `${slug(templateName) || "voucher"}-${slug(personName) || "viajante"}.pdf`;
}

/** Chave estável de um lote de emissão, para o uniqueKey do job. */
export function voucherJobKey(projectId: string, templateId: string, registrationIds: string[]) {
  const ids = [...new Set(registrationIds)].sort().join(",");
  let h = 0x811c9dc5;
  for (let i = 0; i < ids.length; i++) {
    h ^= ids.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `vouchers:${projectId}:${templateId}:${h.toString(36)}`;
}
