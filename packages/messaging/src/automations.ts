import {
  automationEventJobKey,
  automationReason,
  automationRunJobKey,
  DISPATCH_BLOCK_LABEL,
  dispatchBlock,
  DUE_TOLERANCE_MS,
  eventDispatchable,
  flightLeadMs,
  flightOccurrence,
  isDue,
  isEventTrigger,
  matchesAutomationFilter,
  nextOccurrence,
  passportPendency,
  projectOccurrences,
  quotaHasRoom,
  readAutomationFilter,
  travelerPendingDocuments,
  type AutomationFilter,
  type AutomationTrigger,
  type Occurrence,
  type TravelerDocumentState,
} from "@mais/core/automations";
import {
  planRecipients,
  SKIP_REASON_LABELS,
  transactionalKey,
  type Channel,
  type SkipReason,
} from "@mais/core/messaging";
import { Prisma, type MessageAutomation, type PrismaClient } from "@mais/db";
import { z } from "zod";
import { whatsappOptOuts } from "./campaigns";
import { defaultTimeZone } from "./env";
import { projectRequiredDocuments, travelerDocumentStates } from "./group-travel";
import { enqueueJob, enqueueJobOnce, enqueueJobs, QUEUES } from "./jobs";
import type { DeliverySendPayload } from "./processor";
import { templateContentSchema, validateForChannel, type TemplateContent } from "./template";

/**
 * MOTOR DAS RÉGUAS — executa as `MessageAutomation`.
 *
 *  • Gatilhos por evento: a web só enfileira `automations.event` (um job por
 *    acontecimento e inscrição, `uniqueKey` estável); o handler encontra as
 *    réguas ativas do projeto com aquele gatilho e envia.
 *  • Gatilhos por data: a varredura periódica (`sweepAutomations`) calcula as
 *    ocorrências no fuso do projeto e enfileira `automations.run` UMA vez por
 *    (régua, ocorrência) — `enqueueJobOnce`; o processamento percorre as
 *    inscrições em lotes.
 *  • Todo envio tem `dedupeKey` = t:automation:<régua>:<inscrição>:<canal>[:<ocorrência>]:
 *    rodar de novo nunca duplica. Quem não tem contato (ou recusou WhatsApp)
 *    vira uma entrega SKIPPED, para o histórico da régua e para não reavaliar.
 *
 * Regras puras (agenda, tolerância, filtro, pendências) em @mais/core/automations.
 */

const BATCH = 200;
const EVENT_TRIGGERS_LIST = [
  "REGISTRATION_CREATED",
  "REGISTRATION_CONFIRMED",
  "CHECKED_IN",
] as const;
type EventTrigger = (typeof EVENT_TRIGGERS_LIST)[number];

export type AutomationRunSummary = {
  considered: number;
  queued: number;
  skipped: number;
  duplicate: number;
  /** Motivo quando nada foi feito (régua desligada, projeto arquivado…) */
  blocked?: string;
};

const emptySummary = (blocked?: string): AutomationRunSummary => ({
  considered: 0,
  queued: 0,
  skipped: 0,
  duplicate: 0,
  ...(blocked ? { blocked } : {}),
});

// ---------------------------------------------------------------------------
// Carregamento
// ---------------------------------------------------------------------------

const scopeSelect = {
  id: true,
  tenantId: true,
  status: true,
  archivedAt: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  settings: true,
  inviteSettings: { select: { inviteDeadline: true } },
  tenant: { select: { status: true, timezone: true, workspace: { select: { status: true } } } },
} satisfies Prisma.ProjectSelect;

type ProjectScope = Prisma.ProjectGetPayload<{ select: typeof scopeSelect }>;

const projectTz = (p: ProjectScope) => p.timezone || p.tenant.timezone || defaultTimeZone();

function blockOf(p: ProjectScope): string | null {
  const b = dispatchBlock({ project: p, tenant: p.tenant, workspace: p.tenant.workspace });
  return b ? DISPATCH_BLOCK_LABEL[b] : null;
}

const projectDates = (p: ProjectScope) => ({
  timeZone: projectTz(p),
  startsAt: p.startsAt,
  endsAt: p.endsAt,
  inviteDeadline: p.inviteSettings?.inviteDeadline ?? null,
});

/** Ocorrências de nível do projeto de uma régua (vazio para evento/voo). */
export function automationProjectOccurrences(a: MessageAutomation, p: ProjectScope): Occurrence[] {
  return projectOccurrences(a as Parameters<typeof projectOccurrences>[0], projectDates(p));
}

async function loadTemplate(db: PrismaClient, a: { tenantId: string; templateId: string }) {
  const t = await db.messageTemplate.findFirst({
    where: { id: a.templateId, tenantId: a.tenantId, archivedAt: null },
  });
  return t ? templateContentSchema.parse(t) : null;
}

// ---------------------------------------------------------------------------
// Envio de uma régua para uma inscrição
// ---------------------------------------------------------------------------

type Recipient = {
  id: string;
  personId: string;
  name: string;
  email: string;
  phone: string;
};

type DeliverInput = {
  automation: Pick<MessageAutomation, "id" | "tenantId" | "channels">;
  projectId: string;
  template: TemplateContent;
  occurrence?: string;
  flightId?: string;
};

type Outcome = "QUEUED" | "SKIPPED" | "DUPLICATE";

async function deliverOne(
  db: PrismaClient,
  input: DeliverInput,
  r: Recipient,
  channel: Channel,
  optedOut: boolean,
): Promise<Outcome> {
  const [plan] = planRecipients(
    [
      {
        recipientId: r.id,
        personId: r.personId,
        registrationId: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        whatsappOptOut: optedOut,
      },
    ],
    channel,
  );
  if (!plan) return "SKIPPED";
  const dedupeKey = transactionalKey(
    automationReason(input.automation.id),
    r.id,
    channel,
    input.occurrence,
  );
  const base = {
    tenantId: input.automation.tenantId,
    channel,
    personId: r.personId,
    registrationId: r.id,
    recipientName: r.name,
    target: plan.target,
    dedupeKey,
    automationId: input.automation.id,
  };
  try {
    if (plan.skip) {
      await db.messageDelivery.create({
        data: { ...base, status: "SKIPPED", error: SKIP_REASON_LABELS[plan.skip as SkipReason] },
      });
      return "SKIPPED";
    }
    await db.$transaction(async (tx) => {
      const d = await tx.messageDelivery.create({ data: { ...base, status: "QUEUED" } });
      const payload: DeliverySendPayload = {
        deliveryId: d.id,
        template: input.template,
        projectId: input.projectId,
        ...(input.flightId ? { flightId: input.flightId } : {}),
      };
      await enqueueJob(tx, {
        queue: QUEUES.deliverySend,
        payload,
        uniqueKey: `delivery:${d.id}`,
        maxAttempts: 6,
      });
    });
    return "QUEUED";
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "DUPLICATE";
    throw e;
  }
}

/** Envia a régua para um lote de inscrições, em todos os canais da régua. */
async function deliverBatch(
  db: PrismaClient,
  input: DeliverInput,
  recipients: Recipient[],
  summary: AutomationRunSummary,
) {
  const channels = (input.automation.channels as Channel[]).filter(
    (c) => !validateForChannel(input.template, c),
  );
  const optOut = channels.includes("WHATSAPP")
    ? await whatsappOptOuts(
        db,
        input.automation.tenantId,
        recipients.map((r) => r.personId),
      )
    : new Set<string>();
  for (const r of recipients) {
    summary.considered++;
    for (const channel of channels) {
      const o = await deliverOne(db, input, r, channel, optOut.has(r.personId));
      if (o === "QUEUED") summary.queued++;
      else if (o === "SKIPPED") summary.skipped++;
      else summary.duplicate++;
    }
  }
}

// ---------------------------------------------------------------------------
// Público de uma régua por data
// ---------------------------------------------------------------------------

const regSelect = {
  id: true,
  personId: true,
  role: true,
  status: true,
  categoryId: true,
  person: { select: { firstName: true, lastName: true, email: true, phone: true } },
} satisfies Prisma.RegistrationSelect;
type RegRow = Prisma.RegistrationGetPayload<{ select: typeof regSelect }>;

const toRecipient = (r: RegRow): Recipient => ({
  id: r.id,
  personId: r.personId,
  name: `${r.person.firstName} ${r.person.lastName}`.trim(),
  email: r.person.email,
  phone: r.person.phone,
});

function baseWhere(
  a: Pick<MessageAutomation, "tenantId" | "projectId">,
  filter: AutomationFilter,
): Prisma.RegistrationWhereInput {
  return {
    tenantId: a.tenantId,
    projectId: a.projectId,
    status: { not: "CANCELED" },
    ...(filter.roles?.length ? { role: { in: filter.roles } } : {}),
    ...(filter.categoryIds?.length ? { categoryId: { in: filter.categoryIds } } : {}),
  };
}

/**
 * Percorre o público elegível da régua em lotes (cursor por id). Aplica o
 * filtro salvo e a regra do gatilho (documentos, voo, cota).
 */
export async function* automationAudience(
  db: PrismaClient,
  a: MessageAutomation,
  project: ProjectScope,
  now: Date,
  opts: { flightId?: string } = {},
): AsyncGenerator<RegRow[]> {
  const trigger = a.trigger as AutomationTrigger;
  const filter = readAutomationFilter(a.filter);
  const where = baseWhere(a, filter);
  if (trigger === "FLIGHT_DEPARTURE_BEFORE") {
    if (!opts.flightId) return;
    where.flights = { some: { flightId: opts.flightId } };
  }
  if (trigger === "INVITE_DEADLINE_BEFORE") where.invite = { kind: "RESPONSIBLE" };

  const needsDocs = trigger === "PASSPORT_EXPIRING" || trigger === "DOCUMENTS_PENDING";
  const required = needsDocs ? await projectRequiredDocuments(db, project) : [];
  if (needsDocs && !required.length) return;

  let cursor: string | undefined;
  for (;;) {
    const rows = await db.registration.findMany({
      where,
      select: {
        ...regSelect,
        invite: { select: { companyQuotaId: true } },
      },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) return;
    cursor = rows[rows.length - 1]!.id;

    let batch = rows.filter((r) => matchesAutomationFilter(r, trigger, filter));
    if (needsDocs && batch.length) {
      const states = await travelerDocumentStates(
        db,
        a.tenantId,
        batch.map((r) => r.personId),
        required,
        project.endsAt,
      );
      batch = batch.filter((r) => {
        const s: TravelerDocumentState | undefined = states.get(r.personId);
        if (!s) return false;
        return trigger === "PASSPORT_EXPIRING"
          ? !!passportPendency(s, now)
          : travelerPendingDocuments(s, now).length > 0;
      });
    }
    if (trigger === "INVITE_DEADLINE_BEFORE" && batch.length) {
      const quotaIds = [
        ...new Set(batch.map((r) => r.invite?.companyQuotaId).filter((x): x is string => !!x)),
      ];
      const quotas = await db.companyQuota.findMany({
        where: { tenantId: a.tenantId, id: { in: quotaIds } },
        select: {
          id: true,
          quota: true,
          lockedAt: true,
          _count: {
            select: { invites: { where: { registration: { status: { not: "CANCELED" } } } } },
          },
        },
      });
      const room = new Set(
        quotas
          .filter((q) =>
            quotaHasRoom({ quota: q.quota, used: q._count.invites, lockedAt: q.lockedAt }),
          )
          .map((q) => q.id),
      );
      batch = batch.filter((r) => !!r.invite?.companyQuotaId && room.has(r.invite.companyQuotaId));
    }
    if (batch.length) yield batch;
    if (rows.length < BATCH) return;
  }
}

// ---------------------------------------------------------------------------
// Gatilhos por evento
// ---------------------------------------------------------------------------

export const automationEventPayloadSchema = z.object({
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  registrationId: z.string().min(1),
  trigger: z.enum(EVENT_TRIGGERS_LIST),
  at: z.coerce.date(),
});
export type AutomationEventPayload = z.infer<typeof automationEventPayloadSchema>;

/**
 * Enfileira os acontecimentos (um job por inscrição). Só enfileira se o
 * projeto tiver alguma régua ativa com esse gatilho — o balcão de check-in não
 * gera trabalho à toa. Uma única instrução para o lote todo.
 */
export async function enqueueAutomationEvents(
  db: PrismaClient,
  input: {
    tenantId: string;
    projectId: string;
    trigger: EventTrigger;
    registrationIds: string[];
    at?: Date;
  },
): Promise<number> {
  const ids = [...new Set(input.registrationIds)];
  if (!ids.length) return 0;
  const any = await db.messageAutomation.findFirst({
    where: {
      tenantId: input.tenantId,
      projectId: input.projectId,
      trigger: input.trigger,
      active: true,
    },
    select: { id: true },
  });
  if (!any) return 0;
  const at = (input.at ?? new Date()).toISOString();
  return enqueueJobs(
    db,
    ids.map((registrationId) => ({
      queue: QUEUES.automationEvent,
      uniqueKey: automationEventJobKey(input.trigger, registrationId),
      payload: {
        tenantId: input.tenantId,
        projectId: input.projectId,
        registrationId,
        trigger: input.trigger,
        at,
      } satisfies Omit<AutomationEventPayload, "at"> & { at: string },
      maxAttempts: 5,
    })),
  );
}

export async function processAutomationEvent(
  db: PrismaClient,
  raw: unknown,
  now: Date = new Date(),
): Promise<AutomationRunSummary> {
  // O payload vem do Json do job (datas como texto)
  const payload = automationEventPayloadSchema.parse(raw);
  const project = await db.project.findFirst({
    where: { id: payload.projectId, tenantId: payload.tenantId },
    select: scopeSelect,
  });
  if (!project) return emptySummary("Projeto não encontrado.");
  const blocked = blockOf(project);
  if (blocked) return emptySummary(blocked);

  const reg = await db.registration.findFirst({
    where: { id: payload.registrationId, tenantId: payload.tenantId, projectId: project.id },
    select: regSelect,
  });
  if (!reg) return emptySummary("Inscrição não encontrada.");

  const automations = await db.messageAutomation.findMany({
    where: {
      tenantId: payload.tenantId,
      projectId: project.id,
      trigger: payload.trigger,
      active: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const summary = emptySummary();
  for (const a of automations) {
    const ok = eventDispatchable(payload.trigger, payload.at, now, a.activatedAt ?? a.createdAt);
    if (!ok.ok) continue;
    if (!matchesAutomationFilter(reg, payload.trigger, readAutomationFilter(a.filter))) continue;
    const template = await loadTemplate(db, a);
    if (!template) continue;
    await deliverBatch(
      db,
      { automation: a, projectId: project.id, template },
      [toRecipient(reg)],
      summary,
    );
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Gatilhos por data: varredura e processamento
// ---------------------------------------------------------------------------

export const automationRunPayloadSchema = z.object({
  automationId: z.string().min(1),
  occurrenceKey: z.string().min(1),
  flightId: z.string().min(1).optional(),
  /** Disparo antecipado pelo operador (ignora a janela) */
  manual: z.boolean().default(false),
});
export type AutomationRunPayload = z.input<typeof automationRunPayloadSchema>;

const scheduledTriggers = [
  "DAYS_BEFORE_START",
  "DAYS_AFTER_END",
  "INVITE_DEADLINE_BEFORE",
  "PASSPORT_EXPIRING",
  "DOCUMENTS_PENDING",
  "FLIGHT_DEPARTURE_BEFORE",
] as const;

/** Voos do projeto que podem ter lembrete pendente (departureAt dentro da antecedência). */
async function flightsInLead(db: PrismaClient, a: MessageAutomation, from: Date, to: Date) {
  return db.flight.findMany({
    where: {
      tenantId: a.tenantId,
      projectId: a.projectId,
      departureAt: { gte: from, lte: to },
      passengers: { some: {} },
    },
    select: { id: true, departureAt: true },
    orderBy: { departureAt: "asc" },
  });
}

/**
 * Encontra as ocorrências devidas agora e enfileira o processamento de cada
 * uma (uma vez só). Chamada pelo worker a cada poucos minutos.
 */
export async function sweepAutomations(db: PrismaClient, now: Date = new Date()): Promise<number> {
  const automations = await db.messageAutomation.findMany({
    where: { active: true, trigger: { in: [...scheduledTriggers] } },
  });
  if (!automations.length) return 0;
  const projects = await db.project.findMany({
    where: { id: { in: [...new Set(automations.map((a) => a.projectId))] } },
    select: scopeSelect,
  });
  const byId = new Map(projects.map((p) => [p.id, p]));
  let enqueued = 0;
  for (const a of automations) {
    const p = byId.get(a.projectId);
    if (!p || p.tenantId !== a.tenantId || blockOf(p)) continue;
    const activated = a.activatedAt ?? a.createdAt;
    const jobs: { key: string; flightId?: string }[] = [];
    if (a.trigger === "FLIGHT_DEPARTURE_BEFORE") {
      const lead = flightLeadMs(a);
      const flights = await flightsInLead(
        db,
        a,
        now,
        new Date(now.getTime() + lead + DUE_TOLERANCE_MS),
      );
      for (const f of flights) {
        if (!f.departureAt) continue;
        const occ = flightOccurrence(a, { id: f.id, departureAt: f.departureAt });
        if (isDue(occ, now, activated)) jobs.push({ key: occ.key, flightId: f.id });
      }
    } else {
      for (const occ of automationProjectOccurrences(a, p))
        if (isDue(occ, now, activated)) jobs.push({ key: occ.key });
    }
    for (const j of jobs) {
      const created = await enqueueJobOnce(db, {
        queue: QUEUES.automationRun,
        uniqueKey: automationRunJobKey(a.id, j.key),
        payload: { automationId: a.id, occurrenceKey: j.key, flightId: j.flightId },
        maxAttempts: 5,
      });
      if (created) enqueued++;
    }
  }
  return enqueued;
}

/** Ocorrência de dedupe: a data do disparo, o voo, ou a repetição. */
function dedupeOccurrence(trigger: string, occurrenceKey: string, flightId?: string) {
  if (trigger === "FLIGHT_DEPARTURE_BEFORE" && flightId) return `f${flightId}`;
  return occurrenceKey;
}

export async function processAutomationRun(
  db: PrismaClient,
  raw: AutomationRunPayload,
  now: Date = new Date(),
): Promise<AutomationRunSummary> {
  const payload = automationRunPayloadSchema.parse(raw);
  const a = await db.messageAutomation.findUnique({ where: { id: payload.automationId } });
  if (!a || !a.active) return emptySummary("Régua desligada ou removida.");
  if (isEventTrigger(a.trigger)) return emptySummary("Régua por evento não roda por data.");
  const project = await db.project.findFirst({
    where: { id: a.projectId, tenantId: a.tenantId },
    select: scopeSelect,
  });
  if (!project) return emptySummary("Projeto não encontrado.");
  const blocked = blockOf(project);
  if (blocked) return emptySummary(blocked);

  // A ocorrência ainda existe? (data do projeto ou do voo pode ter mudado)
  if (a.trigger === "FLIGHT_DEPARTURE_BEFORE") {
    const f = payload.flightId
      ? await db.flight.findFirst({
          where: { id: payload.flightId, tenantId: a.tenantId, projectId: a.projectId },
          select: { id: true, departureAt: true },
        })
      : null;
    if (!f?.departureAt) return emptySummary("Voo não encontrado.");
    const occ = flightOccurrence(a, { id: f.id, departureAt: f.departureAt });
    if (occ.key !== payload.occurrenceKey) return emptySummary("O voo foi remarcado.");
    if (!payload.manual && now.getTime() >= f.departureAt.getTime())
      return emptySummary("O voo já partiu.");
  } else {
    const occ = automationProjectOccurrences(a, project).find(
      (o) => o.key === payload.occurrenceKey,
    );
    if (!occ) return emptySummary("A data do projeto mudou; o disparo foi reprogramado.");
  }

  const template = await loadTemplate(db, a);
  if (!template) return emptySummary("O modelo da régua foi arquivado.");
  const summary = emptySummary();
  const input: DeliverInput = {
    automation: a,
    projectId: project.id,
    template,
    occurrence: dedupeOccurrence(a.trigger, payload.occurrenceKey, payload.flightId),
    flightId: payload.flightId,
  };
  for await (const batch of automationAudience(db, a, project, now, { flightId: payload.flightId }))
    await deliverBatch(db, input, batch.map(toRecipient), summary);
  return summary;
}

// ---------------------------------------------------------------------------
// Para a tela: próximo disparo, histórico, prévia e antecipação
// ---------------------------------------------------------------------------

export type AutomationNext =
  | { kind: "event" }
  | { kind: "scheduled"; at: Date; key: string; flightId?: string; label?: string }
  | { kind: "none"; reason: string };

/** Próximo disparo previsto de uma régua (no instante `now`). */
export async function automationNextRun(
  db: PrismaClient,
  a: MessageAutomation,
  now: Date = new Date(),
): Promise<AutomationNext> {
  if (isEventTrigger(a.trigger)) return { kind: "event" };
  const project = await db.project.findFirst({
    where: { id: a.projectId, tenantId: a.tenantId },
    select: scopeSelect,
  });
  if (!project) return { kind: "none", reason: "Projeto não encontrado." };
  const blocked = blockOf(project);
  if (blocked) return { kind: "none", reason: blocked };
  if (a.trigger === "FLIGHT_DEPARTURE_BEFORE") {
    const flights = await db.flight.findMany({
      where: {
        tenantId: a.tenantId,
        projectId: a.projectId,
        departureAt: { gt: now },
        passengers: { some: {} },
      },
      select: { id: true, departureAt: true, flightNumber: true, originIata: true, destIata: true },
      orderBy: { departureAt: "asc" },
      take: 50,
    });
    for (const f of flights) {
      const occ = flightOccurrence(a, { id: f.id, departureAt: f.departureAt! });
      if (occ.windowEnd.getTime() > now.getTime())
        return {
          kind: "scheduled",
          at: occ.at,
          key: occ.key,
          flightId: f.id,
          label: `${f.flightNumber} ${f.originIata} → ${f.destIata}`,
        };
    }
    return { kind: "none", reason: "Nenhum voo futuro com passageiros." };
  }
  const next = nextOccurrence(automationProjectOccurrences(a, project), now);
  if (next) return { kind: "scheduled", at: next.at, key: next.key };
  const dates = projectDates(project);
  if (!dates.startsAt && a.trigger !== "INVITE_DEADLINE_BEFORE")
    return { kind: "none", reason: "O projeto ainda não tem data de início." };
  if (a.trigger === "INVITE_DEADLINE_BEFORE" && !dates.inviteDeadline)
    return { kind: "none", reason: "O evento não tem data-limite das cotas." };
  return { kind: "none", reason: "A data deste disparo já passou." };
}

export type AutomationStats = {
  sent: number;
  queued: number;
  skipped: number;
  failed: number;
  lastAt: Date | null;
};

/** Histórico resumido por régua, a partir das entregas. */
export async function automationStats(
  db: PrismaClient,
  tenantId: string,
  automationIds: string[],
): Promise<Map<string, AutomationStats>> {
  const out = new Map<string, AutomationStats>();
  if (!automationIds.length) return out;
  const rows = await db.messageDelivery.groupBy({
    by: ["automationId", "status"],
    where: { tenantId, automationId: { in: automationIds } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  for (const r of rows) {
    if (!r.automationId) continue;
    const s = out.get(r.automationId) ?? {
      sent: 0,
      queued: 0,
      skipped: 0,
      failed: 0,
      lastAt: null,
    };
    const n = r._count._all;
    if (["SENT", "DELIVERED", "READ"].includes(r.status)) s.sent += n;
    else if (["QUEUED", "SENDING"].includes(r.status)) s.queued += n;
    else if (r.status === "SKIPPED") s.skipped += n;
    else if (r.status === "FAILED") s.failed += n;
    const last = r._max.createdAt;
    if (last && (!s.lastAt || last > s.lastAt)) s.lastAt = last;
    out.set(r.automationId, s);
  }
  return out;
}

export type AutomationAudiencePreview = {
  total: number;
  sample: { name: string; email: string; phone: string }[];
  withoutContact: number;
  /** Já receberam esta ocorrência */
  alreadySent: number;
  occurrenceLabel?: string;
};

/**
 * Quem receberia a régua no próximo disparo (por data) ou, nas réguas por
 * evento, quem hoje se encaixa no filtro. Somente leitura.
 */
export async function previewAutomationAudience(
  db: PrismaClient,
  tenantId: string,
  automationId: string,
  now: Date = new Date(),
): Promise<AutomationAudiencePreview | null> {
  const a = await db.messageAutomation.findFirst({ where: { id: automationId, tenantId } });
  if (!a) return null;
  const project = await db.project.findFirst({
    where: { id: a.projectId, tenantId },
    select: scopeSelect,
  });
  if (!project) return null;
  const next = await automationNextRun(db, a, now);
  const flightId = next.kind === "scheduled" ? next.flightId : undefined;
  const occurrence =
    next.kind === "scheduled" ? dedupeOccurrence(a.trigger, next.key, flightId) : undefined;
  const preview: AutomationAudiencePreview = {
    total: 0,
    sample: [],
    withoutContact: 0,
    alreadySent: 0,
  };
  if (a.trigger === "FLIGHT_DEPARTURE_BEFORE" && !flightId) return preview;
  const channels = a.channels as Channel[];
  for await (const batch of automationAudience(db, a, project, now, { flightId })) {
    const keys = batch.flatMap((r) =>
      channels.map((c) => transactionalKey(automationReason(a.id), r.id, c, occurrence)),
    );
    const sentKeys = new Set(
      (
        await db.messageDelivery.findMany({
          where: { dedupeKey: { in: keys } },
          select: { dedupeKey: true },
        })
      ).map((d) => d.dedupeKey),
    );
    for (const r of batch) {
      preview.total++;
      const rec = toRecipient(r);
      const reachable = channels.some(
        (c) => !planRecipients([{ ...rec, recipientId: rec.id }], c)[0]?.skip,
      );
      if (!reachable) preview.withoutContact++;
      if (
        channels.every((c) =>
          sentKeys.has(transactionalKey(automationReason(a.id), r.id, c, occurrence)),
        )
      )
        preview.alreadySent++;
      if (preview.sample.length < 25)
        preview.sample.push({ name: rec.name, email: rec.email, phone: rec.phone });
    }
  }
  if (next.kind === "scheduled" && next.label) preview.occurrenceLabel = next.label;
  return preview;
}

/**
 * Antecipa o próximo disparo de uma régua por data: roda AGORA a mesma
 * ocorrência que sairia no horário previsto (mesma chave de job e de envio),
 * então o horário previsto não envia de novo.
 */
export async function runAutomationNow(
  db: PrismaClient,
  tenantId: string,
  automationId: string,
  now: Date = new Date(),
): Promise<{ ok: true; occurrenceKey: string } | { ok: false; error: string }> {
  const a = await db.messageAutomation.findFirst({ where: { id: automationId, tenantId } });
  if (!a) return { ok: false, error: "Régua não encontrada." };
  if (!a.active) return { ok: false, error: "Ligue a régua antes de disparar." };
  if (isEventTrigger(a.trigger))
    return { ok: false, error: "Réguas por evento saem sozinhas a cada inscrição." };
  const next = await automationNextRun(db, a, now);
  if (next.kind !== "scheduled") {
    return { ok: false, error: next.kind === "none" ? next.reason : "Nada para disparar." };
  }
  const created = await enqueueJobOnce(db, {
    queue: QUEUES.automationRun,
    uniqueKey: automationRunJobKey(a.id, next.key),
    payload: {
      automationId: a.id,
      occurrenceKey: next.key,
      flightId: next.flightId,
      manual: true,
    },
    maxAttempts: 5,
  });
  if (!created) return { ok: false, error: "Este disparo já foi feito ou está em andamento." };
  return { ok: true, occurrenceKey: next.key };
}
