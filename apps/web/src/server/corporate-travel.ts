import "server-only";
import { cache } from "react";
import {
  approvalOutcome,
  canChooseQuote,
  currentApproval,
  evaluatePolicy,
  formatCents,
  isQuoteExpired,
  justificationProblem,
  nextProtocol,
  normalizeTravelRequest,
  requiredApprovalSteps,
  selectPolicy,
  travelRequestInputSchema,
  type CabinClass,
  type NormalizedTravelRequest,
  type Policy,
  type PolicySubject,
  type PolicyViolation,
  type TravelRequestInput,
} from "@mais/core/corporate-travel";
import { normalizeCpf, normalizeEmail, zonedParts } from "@mais/core";
import { Prisma, type ActorType, type Person, type ServiceType, type TenantRole } from "@mais/db";
import { sendTransactional, type TemplateContent } from "@mais/messaging";
import { audit } from "./audit";
import { requireTenant } from "./auth";
import { prisma } from "./db";
import { AppError, forbidden, invalidFields, notFound } from "./errors";
import { modulesForTenant } from "./modules";
import { tenantPublicBase } from "./public-links";
import { tenantDb, type TenantDb } from "./tenant-db";

/**
 * Mais 360 Travel — viagens corporativas (antiga "linha direta").
 *
 * Toda página e action do console passa por `requireCorporateTravel`: cliente
 * sem o módulo CORPORATE_TRAVEL não enxerga nada (404). A área do associado
 * usa `member-portal.ts` e os mesmos serviços daqui (criação, escolha da
 * opção), sempre com o Prisma escopado ao cliente.
 *
 * A reserva é MANUAL: a equipe emite fora (e lança no Travellink) e registra
 * os localizadores como ServiceItem com provider = MANUAL.
 */

/** Atendimento (fila, cotação, reserva). */
const DESK_ROLES = new Set<TenantRole>(["ADMIN", "MANAGER", "OPERATOR"]);
/** Decisão de aprovação. */
const APPROVER_ROLES = new Set<TenantRole>(["ADMIN", "APPROVER"]);
/** Política e acessos. */
const POLICY_ROLES = new Set<TenantRole>(["ADMIN", "MANAGER"]);

export const requireCorporateTravel = cache(async (slug: string) => {
  const ctx = await requireTenant(slug, "VIEWER");
  const active = await modulesForTenant(ctx.tenant);
  if (!active.has("CORPORATE_TRAVEL")) throw notFound("Módulo não contratado.");
  return {
    ...ctx,
    db: tenantDb(ctx),
    canAttend: DESK_ROLES.has(ctx.role),
    canApprove: APPROVER_ROLES.has(ctx.role),
    canConfigure: POLICY_ROLES.has(ctx.role),
    actor: ctx.viewer.user.name || ctx.viewer.user.email,
    tz: ctx.tenant.timezone,
  };
});

export type CorporateTravelContext = Awaited<ReturnType<typeof requireCorporateTravel>>;

export async function requireTravelDesk(slug: string) {
  const c = await requireCorporateTravel(slug);
  if (!c.canAttend) throw forbidden("Só a equipe de atendimento pode fazer isso.");
  return c;
}

export async function requireTravelApprover(slug: string) {
  const c = await requireCorporateTravel(slug);
  if (!c.canApprove) throw forbidden("Só o aprovador do cliente pode decidir.");
  return c;
}

export async function requireTravelConfig(slug: string) {
  const c = await requireCorporateTravel(slug);
  if (!c.canConfigure) throw forbidden("Só o administrador ou o gestor do cliente pode alterar.");
  return c;
}

export const corporateTravelBase = (ws: string, tenant: string) =>
  `/console/${ws}/clientes/${tenant}/viagens-corporativas`;

/** Link da solicitação na área do associado. */
export async function memberRequestUrl(tenant: { id: string; slug: string }, requestId: string) {
  return `${await tenantPublicBase(tenant)}/viagens/${requestId}`;
}

// ---------------------------------------------------------------------------
// Política e aprovação
// ---------------------------------------------------------------------------

export async function loadPolicies(db: TenantDb): Promise<(Policy & { description: string })[]> {
  const rows = await db.travelPolicy.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: { rules: { orderBy: { serviceType: "asc" } } },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    active: p.active,
    priority: p.priority,
    appliesTo: p.appliesTo,
    minAdvanceDays: p.minAdvanceDays,
    requireInsuranceInternational: p.requireInsuranceInternational,
    requireJustification: p.requireJustification,
    rules: p.rules.map((r) => ({
      serviceType: r.serviceType,
      scope: r.scope,
      destination: r.destination,
      maxAmountCents: r.maxAmountCents,
      unit: r.unit,
      currency: r.currency,
      maxCabin: r.maxCabin,
      maxHotelStars: r.maxHotelStars,
    })),
  }));
}

export async function loadApprovalFlows(db: TenantDb) {
  return db.approvalFlow.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: { steps: { orderBy: { sortOrder: "asc" } } },
  });
}

type RequestForPolicy = {
  scope: "DOMESTIC" | "INTERNATIONAL" | "ANY";
  departDate: Date | null;
  pax: number;
  requestedServices: string[];
  serviceDetails: unknown;
  segments: { destination: string }[];
  destination: string;
};

type QuoteForPolicy = {
  currency: string;
  serviceItems: { type: string; saleCents: number; quantity: number; details: unknown }[];
};

const CABINS = new Set(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]);

function readObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Monta a entrada da regra pura a partir do que está no banco. */
export function policySubjectOf(
  r: RequestForPolicy,
  at: Date,
  quote?: QuoteForPolicy | null,
): PolicySubject {
  const details = readObj(r.serviceDetails);
  const air = readObj(details.AIR);
  const hotel = readObj(details.HOTEL);
  const cabin = typeof air.cabin === "string" && CABINS.has(air.cabin) ? air.cabin : null;
  const stars =
    typeof hotel.stars === "string" && hotel.stars !== "ANY" ? Number(hotel.stars) : null;
  return {
    scope: r.scope === "INTERNATIONAL" ? "INTERNATIONAL" : "DOMESTIC",
    destinations: r.segments.length ? r.segments.map((s) => s.destination) : [r.destination],
    departDate: r.departDate,
    at,
    segments: Math.max(1, r.segments.length),
    pax: r.pax,
    requestedServices: r.requestedServices,
    requestedCabin: r.requestedServices.includes("AIR") ? (cabin as CabinClass | null) : null,
    requestedStars: r.requestedServices.includes("HOTEL") && stars ? stars : null,
    quote: quote
      ? {
          currency: quote.currency,
          items: quote.serviceItems.map((i) => {
            const d = readObj(i.details);
            return {
              type: i.type,
              saleCents: i.saleCents,
              quantity: i.quantity,
              cabin:
                typeof d.cabin === "string" && CABINS.has(d.cabin) ? (d.cabin as CabinClass) : null,
              stars: typeof d.stars === "number" ? d.stars : null,
            };
          }),
        }
      : null,
  };
}

/** Política aplicável ao solicitante (pelo tipo de membro e cargo do cadastro). */
export async function policyFor(
  db: TenantDb,
  requester: Pick<Person, "memberType" | "jobTitle"> | null,
) {
  const policies = await loadPolicies(db);
  return selectPolicy(policies, {
    memberType: requester?.memberType ?? "",
    jobTitle: requester?.jobTitle ?? "",
  });
}

export function violationsJson(v: PolicyViolation[]): Prisma.InputJsonValue {
  return v.map((x) => ({ ...x })) as Prisma.InputJsonValue;
}

export function readViolations(v: unknown): PolicyViolation[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is PolicyViolation =>
      !!x && typeof x === "object" && typeof (x as PolicyViolation).message === "string",
  );
}

// ---------------------------------------------------------------------------
// Solicitação
// ---------------------------------------------------------------------------

export type Actor = { type: ActorType; name: string; userId?: string | null };

/** Liga passageiros a pessoas do cadastro quando há correspondência segura. */
async function linkPassengers(
  db: TenantDb,
  requester: Person,
  passengers: NormalizedTravelRequest["passengers"],
) {
  const out: NormalizedTravelRequest["passengers"] = [];
  for (const p of passengers) {
    if (p.personId) {
      const exists = await db.person.count({ where: { id: p.personId, archivedAt: null } });
      out.push({ ...p, personId: exists ? p.personId : null });
      continue;
    }
    if (p.type === "HOLDER") {
      out.push({ ...p, personId: requester.id });
      continue;
    }
    const email = normalizeEmail(p.email);
    const or: Prisma.PersonWhereInput[] = [];
    if (email) or.push({ emailNorm: email });
    if (p.docType === "CPF" && normalizeCpf(p.docNumber).length === 11)
      or.push({ cpf: normalizeCpf(p.docNumber) });
    if (p.docType === "PASSPORT" && p.docNumber) or.push({ passportNumber: p.docNumber.trim() });
    const match = or.length
      ? await db.person.findFirst({ where: { archivedAt: null, OR: or }, select: { id: true } })
      : null;
    out.push({ ...p, personId: match?.id ?? null });
  }
  return out;
}

async function allocateProtocol(db: TenantDb, now: Date) {
  const year = now.getUTCFullYear();
  const latest = await db.travelRequest.findFirst({
    where: { protocol: { startsWith: `VC-${year}-` } },
    orderBy: { protocol: "desc" },
    select: { protocol: true },
  });
  return nextProtocol(year, latest?.protocol);
}

/**
 * Cria a solicitação (área do associado ou console). Avalia a política no
 * pedido (antecedência, classe, categoria, seguro) — o valor só é avaliado
 * quando houver cotação. Fora da política não bloqueia: sinaliza.
 */
export async function createTravelRequest(
  db: TenantDb,
  tenantId: string,
  opts: {
    data: NormalizedTravelRequest;
    requester: Person;
    companyName: string;
    actor: Actor;
    sendCopy: boolean;
  },
) {
  const { data, requester } = opts;
  const now = new Date();
  const policy = await policyFor(db, requester);
  const violations = evaluatePolicy(
    policy,
    policySubjectOf({ ...data, segments: data.segments }, now),
  );
  const passengers = await linkPassengers(db, requester, data.passengers);
  const org = await db.personOrganization.findFirst({
    where: { personId: requester.id, primary: true },
    select: { organizationId: true, organization: { select: { name: true } } },
  });

  for (let attempt = 0; ; attempt++) {
    const protocol = await allocateProtocol(db, now);
    try {
      return await db.travelRequest.create({
        data: {
          tenantId,
          protocol,
          requesterPersonId: requester.id,
          requesterName: `${requester.firstName} ${requester.lastName}`.trim(),
          requesterEmail: requester.email,
          requesterPhone: requester.phone,
          organizationId: org?.organizationId ?? null,
          companyName: opts.companyName || org?.organization.name || "",
          policyId: policy?.id ?? null,
          kind: data.kind,
          tripType: data.tripType,
          origin: data.origin,
          destination: data.destination,
          departDate: data.departDate,
          returnDate: data.returnDate,
          scope: data.scope,
          flexibleDates: data.flexibleDates,
          pax: data.pax,
          budgetCents: data.budgetCents,
          currency: data.currency,
          purpose: data.purpose,
          notes: data.notes,
          requestedServices: data.requestedServices as ServiceType[],
          serviceDetails: data.serviceDetails as Prisma.InputJsonValue,
          outOfPolicy: violations.length > 0,
          policyViolations: violationsJson(violations),
          sendCopy: opts.sendCopy,
          segments: { create: data.segments },
          passengers: { create: passengers },
          events: {
            create: {
              status: "NEW",
              note:
                opts.actor.type === "USER"
                  ? `Solicitação registrada pela equipe (${opts.actor.name}).`
                  : "Solicitação enviada.",
              actorName: opts.actor.name,
              actorType: opts.actor.type,
            },
          },
        },
      });
    } catch (e) {
      // Duas solicitações no mesmo instante disputaram o protocolo: tenta o próximo
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 4)
        continue;
      throw e;
    }
  }
}

export const REQUEST_DETAIL_INCLUDE = {
  segments: { orderBy: { sortOrder: "asc" } },
  passengers: { orderBy: { sortOrder: "asc" } },
  quotes: {
    orderBy: { sortOrder: "asc" },
    include: { serviceItems: { orderBy: { createdAt: "asc" } } },
  },
  events: { orderBy: { createdAt: "asc" } },
  approvals: { orderBy: [{ requestedAt: "asc" }, { sortOrder: "asc" }] },
  serviceItems: {
    where: { quoteId: null },
    orderBy: { createdAt: "asc" },
    include: { attachments: true },
  },
  requester: { select: { id: true, memberType: true, jobTitle: true } },
  policy: { select: { id: true, name: true, requireJustification: true } },
} satisfies Prisma.TravelRequestInclude;

export type RequestDetail = Prisma.TravelRequestGetPayload<{
  include: typeof REQUEST_DETAIL_INCLUDE;
}>;

/** Aprovações da rodada atual (a da última escolha de opção). */
export function currentRound<T extends { requestedAt: Date }>(
  approvals: readonly T[],
  decidedAt: Date | null,
): T[] {
  if (!decidedAt) return [];
  return approvals.filter((a) => a.requestedAt.getTime() >= decidedAt.getTime());
}

/**
 * Escolha da opção (pelo solicitante, ou pela equipe em nome dele). Reavalia
 * a política com a cotação, exige justificativa quando a política pede e abre
 * a rodada de aprovação quando o fluxo do cliente exige; sem aprovação,
 * a solicitação segue direto para a emissão (APPROVED).
 */
export async function chooseQuoteFor(
  db: TenantDb,
  request: RequestDetail,
  quoteId: string,
  justification: string,
  actor: Actor,
) {
  if (!canChooseQuote(request.status))
    throw new AppError("Esta solicitação não está aguardando a escolha de uma opção.");
  const quote = request.quotes.find((q) => q.id === quoteId);
  if (!quote) throw notFound("Opção não encontrada.");
  const now = new Date();
  if (isQuoteExpired(quote.validUntil, now))
    throw new AppError("Esta opção venceu. Peça à equipe uma cotação atualizada.");

  const requester = request.requesterPersonId
    ? await db.person.findFirst({ where: { id: request.requesterPersonId } })
    : null;
  const policy = await policyFor(db, requester);
  const violations = evaluatePolicy(policy, policySubjectOf(request, request.createdAt, quote));
  const outOfPolicy = violations.length > 0;
  const problem = justificationProblem(
    outOfPolicy,
    policy?.requireJustification ?? false,
    justification,
  );
  if (problem) throw invalidFields({ justification: problem }, problem);

  const flows = await loadApprovalFlows(db);
  const plan = requiredApprovalSteps(flows, {
    outOfPolicy,
    totalCents: quote.totalCents,
    scope: request.scope === "INTERNATIONAL" ? "INTERNATIONAL" : "DOMESTIC",
  });
  const status = plan ? "AWAITING_APPROVAL" : "APPROVED";
  const note = [
    `Opção escolhida: ${quote.title} (${formatCents(quote.totalCents, quote.currency)}).`,
    outOfPolicy
      ? `Fora da política: ${violations.map((v) => v.rule.toLowerCase()).join(", ")}.`
      : "",
    plan ? "Enviada para aprovação." : "Sem aprovação exigida: segue para a emissão.",
  ]
    .filter(Boolean)
    .join(" ");

  await db.$transaction(async (tx) => {
    // Rodada anterior pendente (escolha trocada) não vale mais
    await tx.travelApproval.updateMany({
      where: { requestId: request.id, decision: "PENDING" },
      data: { decision: "SKIPPED", decidedAt: now, comment: "Substituída por nova escolha." },
    });
    await tx.travelQuote.update({ where: { id: quote.id }, data: { inPolicy: !outOfPolicy } });
    await tx.travelRequest.update({
      where: { id: request.id },
      data: {
        status,
        chosenQuoteId: quote.id,
        decidedAt: now,
        outOfPolicy,
        policyViolations: violationsJson(violations),
        policyId: policy?.id ?? null,
        justification: justification.trim(),
      },
    });
    if (plan) {
      await tx.travelApproval.createMany({
        data: plan.steps.map((s) => ({
          requestId: request.id,
          stepId: s.id,
          sortOrder: s.sortOrder,
          stepName: s.name,
          approverUserId: s.approverUserId,
          approverPersonId: s.approverPersonId,
          requestedAt: now,
        })),
      });
    }
    await tx.travelRequestEvent.create({
      data: { requestId: request.id, status, note, actorName: actor.name, actorType: actor.type },
    });
  });
  return { status, outOfPolicy, quote };
}

/**
 * Decisão do aprovador na etapa atual. Recusa encerra a rodada (REJECTED:
 * o solicitante pode escolher outra opção ou a equipe recotar); aprovação
 * da última etapa libera a emissão (APPROVED).
 */
export async function decideApprovalFor(
  db: TenantDb,
  request: RequestDetail,
  approvalId: string,
  decision: "APPROVED" | "REJECTED",
  comment: string,
  actor: Actor & { userId: string },
) {
  if (request.status !== "AWAITING_APPROVAL")
    throw new AppError("Esta solicitação não está aguardando aprovação.");
  const round = currentRound(request.approvals, request.decidedAt);
  const current = currentApproval(round);
  if (!current || current.id !== approvalId)
    throw new AppError("Esta etapa já foi decidida ou ainda não está liberada.");
  if (current.approverUserId && current.approverUserId !== actor.userId)
    throw forbidden("Esta etapa é de outro aprovador.");
  if (decision === "REJECTED" && comment.trim().length < 5)
    throw invalidFields({ comment: "Diga o motivo da recusa ao solicitante." });

  const now = new Date();
  const after = round.map((a) => (a.id === current.id ? { ...a, decision } : a));
  const outcome = approvalOutcome(after);
  const status =
    outcome === "APPROVED" ? "APPROVED" : outcome === "REJECTED" ? "REJECTED" : "AWAITING_APPROVAL";

  await db.$transaction(async (tx) => {
    await tx.travelApproval.update({
      where: { id: current.id },
      data: {
        decision,
        comment: comment.trim(),
        decidedAt: now,
        approverUserId: current.approverUserId ?? actor.userId,
      },
    });
    if (status !== "AWAITING_APPROVAL")
      await tx.travelRequest.update({ where: { id: request.id }, data: { status } });
    await tx.travelRequestEvent.create({
      data: {
        requestId: request.id,
        status,
        note:
          (decision === "APPROVED"
            ? `Aprovada por ${actor.name}${current.stepName ? ` (${current.stepName})` : ""}.`
            : `Recusada por ${actor.name}.`) + (comment.trim() ? ` "${comment.trim()}"` : ""),
        actorName: actor.name,
        actorType: "USER",
      },
    });
  });
  return { status, outcome };
}

// ---------------------------------------------------------------------------
// Avisos ao solicitante (motor de comunicação: Job + dedupeKey)
// ---------------------------------------------------------------------------

/** Texto vindo do usuário não pode virar campo dinâmico do modelo. */
const literal = (s: string) => s.replace(/\{\{/g, "{ {").replace(/\}\}/g, "} }");

/**
 * Mensagem ao solicitante com conteúdo explícito e link para a área do
 * associado. Idempotente: `reason` + pessoa + canal (+ `occurrence`) formam a
 * dedupeKey. Falhar aqui nunca desfaz a operação — fica registrado em copyLog.
 */
export async function notifyRequester(
  tenant: { id: string; slug: string },
  request: { id: string; protocol: string; requesterPersonId: string | null },
  msg: {
    reason: string;
    occurrence?: string;
    subject: string;
    lines: string[];
    whatsapp: string;
    channels?: ("EMAIL" | "WHATSAPP")[];
  },
) {
  if (!request.requesterPersonId) return { queued: 0, log: "Solicitante sem cadastro." };
  const link = await memberRequestUrl(tenant, request.id);
  const template: TemplateContent = {
    name: `Viagem ${request.protocol}`,
    emailSubject: literal(`${msg.subject} · ${request.protocol}`).slice(0, 200),
    emailBody: [
      "Olá, {{primeiro_nome}}!",
      "",
      ...msg.lines.map(literal),
      "",
      `**Protocolo:** ${request.protocol}`,
      `**Acompanhe:** ${link}`,
    ].join("\n"),
    whatsappBody: [
      "Olá, {{primeiro_nome}}!",
      "",
      literal(msg.whatsapp),
      "",
      `Protocolo ${request.protocol}: ${link}`,
    ].join("\n"),
    includeActions: false,
  };
  try {
    const r = await sendTransactional(prisma, {
      tenantId: tenant.id,
      personId: request.requesterPersonId,
      channels: msg.channels ?? ["EMAIL", "WHATSAPP"],
      reason: `travel.${msg.reason}.${request.id}`,
      occurrence: msg.occurrence,
      template,
    });
    if (!r.ok) return { queued: 0, log: r.error };
    const queued = r.data.filter((o) => o.status === "QUEUED").length;
    const log = r.data
      .map(
        (o) =>
          `${o.channel === "EMAIL" ? "E-mail" : "WhatsApp"}: ${o.status === "QUEUED" ? "na fila" : (o.detail ?? o.status)}`,
      )
      .join(" · ");
    await prisma.travelRequest.updateMany({
      where: { id: request.id, tenantId: tenant.id },
      data: { copyLog: `${new Date().toISOString()} ${msg.reason}: ${log}`.slice(0, 1000) },
    });
    return { queued, log };
  } catch (e) {
    console.error("[viagens] aviso ao solicitante", e);
    return { queued: 0, log: "Falha ao enfileirar o aviso." };
  }
}

/** Nome exibido de quem agiu na área do associado. */
export const personName = (p: { firstName: string; lastName: string; socialName?: string }) =>
  p.socialName || `${p.firstName} ${p.lastName}`.trim();

/**
 * Valida e grava uma solicitação vinda do formulário (associado ou equipe),
 * avisa o solicitante (comprovante) e registra a auditoria.
 */
export async function submitTravelRequest(
  db: TenantDb,
  tenant: { id: string; slug: string; timezone: string },
  raw: TravelRequestInput,
  opts: { requester: Person; companyName: string; actor: Actor; sendCopy: boolean },
) {
  const parsed = travelRequestInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    throw invalidFields(fieldErrors);
  }
  const today = zonedParts(new Date(), tenant.timezone).day;
  const n = normalizeTravelRequest(parsed.data, today);
  if (!n.ok) throw invalidFields(n.fieldErrors, n.error);

  const request = await createTravelRequest(db, tenant.id, { ...opts, data: n.data });
  await audit({
    action: "travel.request.create",
    actorType: opts.actor.type,
    actorLabel: opts.actor.name,
    userId: opts.actor.userId ?? null,
    tenantId: tenant.id,
    entityType: "TravelRequest",
    entityId: request.id,
    data: { protocol: request.protocol, outOfPolicy: request.outOfPolicy },
  });
  if (opts.sendCopy)
    await notifyRequester(tenant, request, {
      reason: "receipt",
      subject: "Recebemos sua solicitação de viagem",
      lines: [
        `Recebemos sua solicitação para **${request.destination}**. A equipe vai cotar e enviar as opções por aqui.`,
        request.outOfPolicy
          ? "Atenção: o pedido tem pontos fora da política de viagem. Você verá os detalhes na solicitação."
          : "",
      ].filter(Boolean),
      whatsapp: `Recebemos sua solicitação de viagem para ${request.destination}. A equipe vai cotar e enviar as opções.`,
    });
  return request;
}
