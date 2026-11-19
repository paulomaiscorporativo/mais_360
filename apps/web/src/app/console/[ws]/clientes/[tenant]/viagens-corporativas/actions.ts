"use server";

import { randomInt } from "node:crypto";
import { z } from "zod";
import { provisionalPassword, splitFullName, zonedTimeToUtc } from "@mais/core";
import {
  canBook,
  canStaffCancel,
  canStaffQuote,
  conditionsForMode,
  evaluatePolicy,
  formatCents,
  normalizeQuoteLines,
  parseMoneyToCents,
  perPaxCents,
  POLICY_UNITS,
  quoteInputSchema,
  statusAfterAssign,
  APPROVAL_MODES,
} from "@mais/core/corporate-travel";
import type { Prisma } from "@mais/db";
import { defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import {
  chooseQuoteFor,
  decideApprovalFor,
  loadApprovalFlows,
  notifyRequester,
  policyFor,
  policySubjectOf,
  REQUEST_DETAIL_INCLUDE,
  requireTravelApprover,
  requireTravelConfig,
  requireTravelDesk,
  submitTravelRequest,
  type CorporateTravelContext,
} from "@/server/corporate-travel";
import { AppError, invalidFields, notFound } from "@/server/errors";
import { saveUpload } from "@/server/files";
import { hashPassword } from "@/server/password";
import { upsertPerson } from "@/server/people";

const tenant = z.string().max(80);
const id = z.string().min(1).max(40);

async function loadRequest(c: CorporateTravelContext, requestId: string) {
  const r = await c.db.travelRequest.findFirst({
    where: { id: requestId },
    include: REQUEST_DETAIL_INCLUDE,
  });
  if (!r) throw notFound("Solicitação não encontrada.");
  return r;
}

function staffAudit(
  c: CorporateTravelContext,
  action: string,
  entityId: string,
  data?: Record<string, string | number | boolean | null>,
) {
  return audit({
    action,
    userId: c.viewer.user.id,
    actorLabel: c.actor,
    tenantId: c.tenantId,
    entityType: "TravelRequest",
    entityId,
    ...(data ? { data } : {}),
  });
}

const actorOf = (c: CorporateTravelContext) => ({
  type: "USER" as const,
  name: c.actor,
  userId: c.viewer.user.id,
});

// ---------------------------------------------------------------------------
// Solicitação pela equipe
// ---------------------------------------------------------------------------

export const createStaffRequest = defineAction(
  z.object({
    tenant,
    request: z.unknown(),
    sendCopy: z.boolean().default(true),
    requester: z.union([
      z.object({ personId: id }),
      z.object({
        name: z.string().trim().max(160),
        email: z.string().trim().max(160).default(""),
        phone: z.string().trim().max(40).default(""),
        company: z.string().trim().max(160).default(""),
      }),
    ]),
  }),
  async (i) => {
    const c = await requireTravelDesk(i.tenant);
    let requester;
    let company = "";
    if ("personId" in i.requester) {
      requester = await c.db.person.findFirst({
        where: { id: i.requester.personId, archivedAt: null },
      });
      if (!requester) throw invalidFields({ requester: "Pessoa não encontrada." });
    } else {
      const errors: Record<string, string> = {};
      if (i.requester.name.length < 3) errors["requester.name"] = "Informe o nome completo.";
      if (!i.requester.email && !i.requester.phone)
        errors["requester.email"] = "Informe o e-mail ou o WhatsApp para enviar as opções.";
      if (Object.keys(errors).length) throw invalidFields(errors);
      const { firstName, lastName } = splitFullName(i.requester.name);
      requester = (
        await upsertPerson(c.db, c.tenantId, {
          firstName,
          lastName,
          email: i.requester.email,
          phone: i.requester.phone,
          organization: i.requester.company,
        })
      ).person;
      company = i.requester.company;
    }
    const request = await submitTravelRequest(
      c.db,
      c.tenant,
      i.request as Parameters<typeof submitTravelRequest>[2],
      { requester, companyName: company, actor: actorOf(c), sendCopy: i.sendCopy },
    );
    return { id: request.id, protocol: request.protocol };
  },
);

// ---------------------------------------------------------------------------
// Atendimento
// ---------------------------------------------------------------------------

export const assignRequest = defineAction(
  z.object({ tenant, requestId: id, userId: id.nullable() }),
  async (i) => {
    const c = await requireTravelDesk(i.tenant);
    const r = await loadRequest(c, i.requestId);
    if (r.status === "BOOKED" || r.status === "CANCELED")
      throw new AppError("Solicitação encerrada não muda de responsável.");
    const userId = i.userId ?? c.viewer.user.id;
    const user =
      userId === c.viewer.user.id
        ? c.viewer.user
        : (
            await c.db.membership.findFirst({
              where: { userId, role: { in: ["ADMIN", "MANAGER", "OPERATOR"] } },
              include: { user: true },
            })
          )?.user;
    if (!user) throw new AppError("Escolha alguém da equipe de atendimento deste cliente.");
    const name = user.name || user.email;
    const status = statusAfterAssign(r.status);
    await c.db.$transaction([
      c.db.travelRequest.update({
        where: { id: r.id },
        data: { assignedUserId: user.id, handledBy: name, status },
      }),
      c.db.travelRequestEvent.create({
        data: {
          requestId: r.id,
          status,
          note:
            user.id === c.viewer.user.id
              ? `${name} assumiu o atendimento.`
              : `Atendimento passado para ${name}.`,
          actorName: c.actor,
          actorType: "USER",
        },
      }),
    ]);
    await staffAudit(c, "travel.request.assign", r.id, { assignedUserId: user.id });
    return null;
  },
);

export const saveQuote = defineAction(
  z.object({ tenant, requestId: id, quoteId: id.optional(), quote: quoteInputSchema }),
  async (i) => {
    const c = await requireTravelDesk(i.tenant);
    const r = await loadRequest(c, i.requestId);
    if (!canStaffQuote(r.status))
      throw new AppError("Nesta etapa as opções não podem mais ser alteradas.");
    const lines = normalizeQuoteLines(i.quote.lines);
    if (!lines.ok) throw invalidFields({ [lines.field]: lines.error }, lines.error);
    if (i.quoteId && r.chosenQuoteId === i.quoteId && r.status !== "REJECTED")
      throw new AppError("Esta opção já foi escolhida pelo solicitante.");

    const requester = r.requesterPersonId
      ? await c.db.person.findFirst({ where: { id: r.requesterPersonId } })
      : null;
    const policy = await policyFor(c.db, requester);
    const items = lines.lines.map((l) => ({
      type: l.type,
      saleCents: l.saleCents,
      quantity: l.quantity,
      details: l.cabin ? { cabin: l.cabin } : l.stars ? { stars: l.stars } : {},
    }));
    const violations = evaluatePolicy(
      policy,
      policySubjectOf(r, r.createdAt, { currency: i.quote.currency, serviceItems: items }),
    );
    const validUntil = i.quote.validUntil ? zonedLocal(i.quote.validUntil, c.tz) : null;
    const data = {
      title: i.quote.title,
      description: i.quote.description,
      currency: i.quote.currency,
      totalCents: lines.totalCents,
      perPaxCents: perPaxCents(lines.totalCents, r.pax),
      validUntil,
      inPolicy: policy ? violations.length === 0 : null,
      createdBy: c.actor,
    };
    const itemRows = lines.lines.map((l, idx) => ({
      tenantId: c.tenantId,
      type: l.type,
      status: "QUOTED" as const,
      provider: "MANUAL" as const,
      title: l.title,
      description: l.description,
      quantity: l.quantity,
      currency: i.quote.currency,
      saleCents: l.saleCents,
      details: (items[idx]?.details ?? {}) as Prisma.InputJsonValue,
      createdBy: c.actor,
    }));

    const quote = await c.db.$transaction(async (tx) => {
      if (i.quoteId) {
        const existing = await tx.travelQuote.findFirst({
          where: { id: i.quoteId, requestId: r.id },
        });
        if (!existing) throw notFound("Opção não encontrada.");
        await tx.serviceItem.deleteMany({ where: { quoteId: existing.id, tenantId: c.tenantId } });
        return tx.travelQuote.update({
          where: { id: existing.id },
          data: { ...data, serviceItems: { create: itemRows } },
        });
      }
      return tx.travelQuote.create({
        data: {
          ...data,
          requestId: r.id,
          sortOrder: r.quotes.length,
          serviceItems: { create: itemRows },
        },
      });
    });
    await staffAudit(c, i.quoteId ? "travel.quote.update" : "travel.quote.create", r.id, {
      quoteId: quote.id,
      totalCents: quote.totalCents,
    });
    return { id: quote.id, violations: violations.map((v) => v.message) };
  },
);

/** "AAAA-MM-DDTHH:MM" no fuso do cliente → instante UTC. */
function zonedLocal(value: string, timeZone: string): Date {
  const [d = "", t = ""] = value.split("T");
  const [year, month, day] = d.split("-").map(Number);
  const [hour, minute] = t.split(":").map(Number);
  return zonedTimeToUtc(
    { year: year ?? 0, month: month ?? 1, day: day ?? 1, hour: hour ?? 0, minute: minute ?? 0 },
    timeZone,
  );
}

export const deleteQuote = defineAction(
  z.object({ tenant, requestId: id, quoteId: id }),
  async (i) => {
    const c = await requireTravelDesk(i.tenant);
    const r = await loadRequest(c, i.requestId);
    if (!canStaffQuote(r.status))
      throw new AppError("Nesta etapa as opções não podem mais ser alteradas.");
    if (r.chosenQuoteId === i.quoteId)
      throw new AppError("Esta opção foi escolhida pelo solicitante e fica no histórico.");
    const q = r.quotes.find((x) => x.id === i.quoteId);
    if (!q) throw notFound("Opção não encontrada.");
    await c.db.$transaction([
      c.db.serviceItem.deleteMany({ where: { quoteId: q.id } }),
      c.db.travelQuote.delete({ where: { id: q.id } }),
    ]);
    await staffAudit(c, "travel.quote.delete", r.id, { quoteId: q.id });
    return null;
  },
);

export const sendQuotes = defineAction(
  z.object({
    tenant,
    requestId: id,
    channels: z.array(z.enum(["EMAIL", "WHATSAPP"])).min(1, "Escolha ao menos um canal."),
    message: z.string().trim().max(1000).default(""),
  }),
  async (i) => {
    const c = await requireTravelDesk(i.tenant);
    const r = await loadRequest(c, i.requestId);
    if (!canStaffQuote(r.status)) throw new AppError("Nesta etapa não há opções para enviar.");
    const now = new Date();
    const valid = r.quotes.filter((q) => !q.validUntil || q.validUntil > now);
    if (!valid.length) throw new AppError("Monte ao menos uma opção válida antes de enviar.");
    const event = await c.db.$transaction(async (tx) => {
      await tx.travelRequest.update({
        where: { id: r.id },
        data: {
          status: "QUOTED",
          assignedUserId: r.assignedUserId ?? c.viewer.user.id,
          handledBy: r.handledBy || c.actor,
        },
      });
      return tx.travelRequestEvent.create({
        data: {
          requestId: r.id,
          status: "QUOTED",
          note: `${valid.length} ${valid.length === 1 ? "opção enviada" : "opções enviadas"} ao solicitante.`,
          actorName: c.actor,
          actorType: "USER",
        },
      });
    });
    const cheapest = [...valid].sort((a, b) => a.perPaxCents - b.perPaxCents)[0]!;
    const sent = await notifyRequester(c.tenant, r, {
      reason: "quotes",
      occurrence: event.id,
      channels: i.channels,
      subject: "Suas opções de viagem estão prontas",
      lines: [
        `Preparamos ${valid.length} ${valid.length === 1 ? "opção" : "opções"} para a sua viagem a **${r.destination}**, a partir de ${formatCents(cheapest.perPaxCents, cheapest.currency)} por passageiro.`,
        ...(i.message ? ["", i.message] : []),
        "",
        "Compare e escolha a sua pelo link abaixo. Os valores podem mudar até a emissão.",
      ],
      whatsapp: `Suas opções de viagem para ${r.destination} estão prontas (a partir de ${formatCents(cheapest.perPaxCents, cheapest.currency)} por passageiro). Escolha a sua pelo link.`,
    });
    await c.db.travelRequest.update({
      where: { id: r.id },
      data: { dispatchLog: `${now.toISOString()} cotações: ${sent.log}`.slice(0, 1000) },
    });
    await staffAudit(c, "travel.quotes.send", r.id, { quotes: valid.length, queued: sent.queued });
    return { queued: sent.queued, log: sent.log };
  },
);

/** A equipe registra a escolha feita por telefone/e-mail, em nome do solicitante. */
export const chooseOnBehalf = defineAction(
  z.object({
    tenant,
    requestId: id,
    quoteId: id,
    justification: z.string().trim().max(2000).default(""),
  }),
  async (i) => {
    const c = await requireTravelDesk(i.tenant);
    const r = await loadRequest(c, i.requestId);
    const result = await chooseQuoteFor(c.db, r, i.quoteId, i.justification, {
      type: "USER",
      name: `${c.actor} (em nome de ${r.requesterName})`,
    });
    await staffAudit(c, "travel.quote.choose", r.id, {
      quoteId: i.quoteId,
      status: result.status,
      onBehalf: true,
    });
    return { status: result.status };
  },
);

const bookingLine = z.object({
  type: z.enum([
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
    "CUSTOM",
  ]),
  title: z.string().trim().min(2, "Descreva a reserva.").max(200),
  locator: z.string().trim().max(40).default(""),
  notes: z.string().trim().max(500).default(""),
});

/**
 * Reserva MANUAL: a equipe emitiu fora (e lançou no Travellink) e registra
 * aqui os localizadores. Cada linha vira um ServiceItem provider = MANUAL.
 * Depois de reservada, ainda dá para acrescentar itens (ex.: hotel emitido depois).
 */
export const bookRequest = defineAction(
  z.object({
    tenant,
    requestId: id,
    lines: z.array(bookingLine).min(1, "Registre ao menos uma reserva.").max(20),
    note: z.string().trim().max(1000).default(""),
  }),
  async (i) => {
    const c = await requireTravelDesk(i.tenant);
    const r = await loadRequest(c, i.requestId);
    if (!canBook(r.status) && r.status !== "BOOKED")
      throw new AppError(
        r.status === "AWAITING_APPROVAL"
          ? "A opção ainda aguarda aprovação."
          : "A reserva é registrada depois da escolha da opção (e da aprovação, quando exigida).",
      );
    const chosen = r.quotes.find((q) => q.id === r.chosenQuoteId);
    const now = new Date();
    const first = r.status !== "BOOKED";
    await c.db.$transaction(async (tx) => {
      for (const l of i.lines)
        await tx.serviceItem.create({
          data: {
            tenantId: c.tenantId,
            travelRequestId: r.id,
            type: l.type,
            status: "ISSUED",
            provider: "MANUAL",
            locator: l.locator.toUpperCase(),
            title: l.title,
            notes: l.notes,
            currency: chosen?.currency ?? r.currency,
            startsAt: r.departDate,
            endsAt: r.returnDate,
            origin: r.origin,
            destination: r.destination,
            createdBy: c.actor,
          },
        });
      await tx.travelRequest.update({
        where: { id: r.id },
        data: { status: "BOOKED", editedAt: now },
      });
      await tx.travelRequestEvent.create({
        data: {
          requestId: r.id,
          status: "BOOKED",
          note: [
            first ? "Reserva emitida." : "Reserva complementada.",
            i.lines
              .map((l) => `${l.title}${l.locator ? ` (${l.locator.toUpperCase()})` : ""}`)
              .join("; "),
            i.note,
          ]
            .filter(Boolean)
            .join(" "),
          actorName: c.actor,
          actorType: "USER",
        },
      });
    });
    await staffAudit(c, "travel.request.book", r.id, { items: i.lines.length });
    await notifyRequester(c.tenant, r, {
      reason: "booked",
      occurrence: String(now.getTime()),
      subject: first ? "Sua viagem está reservada" : "Sua reserva foi atualizada",
      lines: [
        first ? "Sua viagem foi emitida. Seguem os localizadores:" : "Acrescentamos à sua viagem:",
        "",
        ...i.lines.map((l) => `- ${l.title}${l.locator ? `: **${l.locator.toUpperCase()}**` : ""}`),
        ...(i.note ? ["", i.note] : []),
        "",
        "Vouchers e bilhetes ficam disponíveis no link abaixo assim que anexados.",
      ],
      whatsapp: `${first ? "Sua viagem está reservada" : "Sua reserva foi atualizada"}: ${i.lines
        .map((l) => `${l.title}${l.locator ? ` ${l.locator.toUpperCase()}` : ""}`)
        .join("; ")}.`,
    });
    return null;
  },
);

export const uploadBookingDocument = defineAction(z.instanceof(FormData), async (form) => {
  const parsed = z
    .object({
      tenant,
      requestId: id,
      itemId: id,
      kind: z.enum(["VOUCHER", "ETICKET", "INVOICE", "CONFIRMATION", "OTHER"]).default("OTHER"),
    })
    .safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) throw new AppError("Dados do envio inválidos.");
  const i = parsed.data;
  const file = form.get("file");
  if (!(file instanceof File)) throw invalidFields({ file: "Escolha um arquivo." });
  const c = await requireTravelDesk(i.tenant);
  const item = await c.db.serviceItem.findFirst({
    where: { id: i.itemId, travelRequestId: i.requestId, quoteId: null },
    include: { travelRequest: true },
  });
  if (!item?.travelRequest) throw notFound("Reserva não encontrada.");
  const stored = await saveUpload({
    tenantId: c.tenantId,
    file,
    kind: "document",
    visibility: "PRIVATE",
    uploadedBy: c.actor,
  });
  const att = await c.db.serviceItemAttachment.create({
    data: { serviceItemId: item.id, fileId: stored.id, kind: i.kind },
  });
  await staffAudit(c, "travel.document.upload", item.travelRequest.id, {
    itemId: item.id,
    fileId: stored.id,
  });
  await notifyRequester(c.tenant, item.travelRequest, {
    reason: "document",
    occurrence: att.id,
    channels: ["EMAIL"],
    subject: "Novo documento da sua viagem",
    lines: [`Anexamos um documento de **${item.title}**. Baixe pelo link abaixo.`],
    whatsapp: `Novo documento da sua viagem: ${item.title}.`,
  });
  return null;
});

export const cancelByStaff = defineAction(
  z.object({
    tenant,
    requestId: id,
    reason: z.string().trim().min(5, "Diga o motivo ao solicitante.").max(1000),
  }),
  async (i) => {
    const c = await requireTravelDesk(i.tenant);
    const r = await loadRequest(c, i.requestId);
    if (!canStaffCancel(r.status)) throw new AppError("Esta solicitação já está encerrada.");
    await c.db.$transaction([
      c.db.travelApproval.updateMany({
        where: { requestId: r.id, decision: "PENDING" },
        data: { decision: "SKIPPED", decidedAt: new Date(), comment: "Solicitação cancelada." },
      }),
      c.db.travelRequest.update({ where: { id: r.id }, data: { status: "CANCELED" } }),
      c.db.travelRequestEvent.create({
        data: {
          requestId: r.id,
          status: "CANCELED",
          note: `Cancelada pela equipe: ${i.reason}`,
          actorName: c.actor,
          actorType: "USER",
        },
      }),
    ]);
    await staffAudit(c, "travel.request.cancel", r.id);
    await notifyRequester(c.tenant, r, {
      reason: "canceled",
      subject: "Sua solicitação de viagem foi cancelada",
      lines: [`A equipe cancelou a solicitação: ${i.reason}`],
      whatsapp: `Sua solicitação de viagem foi cancelada: ${i.reason}`,
    });
    return null;
  },
);

// ---------------------------------------------------------------------------
// Aprovação
// ---------------------------------------------------------------------------

export const decideApproval = defineAction(
  z.object({
    tenant,
    requestId: id,
    approvalId: id,
    decision: z.enum(["APPROVED", "REJECTED"]),
    comment: z.string().trim().max(1000).default(""),
  }),
  async (i) => {
    const c = await requireTravelApprover(i.tenant);
    const r = await loadRequest(c, i.requestId);
    const result = await decideApprovalFor(c.db, r, i.approvalId, i.decision, i.comment, {
      ...actorOf(c),
      userId: c.viewer.user.id,
    });
    await staffAudit(
      c,
      `travel.approval.${i.decision === "APPROVED" ? "approve" : "reject"}`,
      r.id,
      {
        approvalId: i.approvalId,
        status: result.status,
      },
    );
    if (result.status !== "AWAITING_APPROVAL") {
      const approved = result.status === "APPROVED";
      await notifyRequester(c.tenant, r, {
        reason: approved ? "approved" : "rejected",
        occurrence: i.approvalId,
        subject: approved ? "Sua viagem foi aprovada" : "Sua escolha não foi aprovada",
        lines: approved
          ? ["A opção escolhida foi aprovada. A equipe segue para a emissão."]
          : [
              "A opção escolhida não foi aprovada.",
              ...(i.comment ? [`**Motivo:** ${i.comment}`] : []),
              "Você pode escolher outra opção ou aguardar uma nova cotação.",
            ],
        whatsapp: approved
          ? "Sua viagem foi aprovada. A equipe segue para a emissão."
          : `Sua escolha não foi aprovada${i.comment ? `: ${i.comment}` : "."}`,
      });
    }
    return { status: result.status };
  },
);

// ---------------------------------------------------------------------------
// Política e aprovação (configuração do cliente)
// ---------------------------------------------------------------------------

const ruleInput = z.object({
  serviceType: z.enum(["AIR", "HOTEL"]),
  unit: z.enum(POLICY_UNITS),
  scope: z.enum(["ANY", "DOMESTIC", "INTERNATIONAL"]).default("ANY"),
  destination: z.string().trim().max(120).default(""),
  maxAmount: z.string().trim().max(30).default(""),
  currency: z.enum(["BRL", "USD", "EUR"]).default("BRL"),
  maxCabin: z.enum(["", "ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]).default(""),
  maxHotelStars: z.enum(["", "3", "4", "5"]).default(""),
});

export const savePolicy = defineAction(
  z.object({
    tenant,
    policyId: id.optional(),
    name: z.string().trim().min(2, "Dê um nome à política.").max(80),
    description: z.string().trim().max(500).default(""),
    active: z.boolean().default(true),
    priority: z.coerce.number().int().min(0).max(100).default(0),
    memberTypes: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    jobTitles: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    minAdvanceDays: z.string().trim().max(3).default(""),
    requireInsuranceInternational: z.boolean().default(true),
    requireJustification: z.boolean().default(true),
    rules: z.array(ruleInput).max(20).default([]),
  }),
  async (i) => {
    const c = await requireTravelConfig(i.tenant);
    const days = i.minAdvanceDays ? Number(i.minAdvanceDays) : null;
    if (days !== null && (!Number.isInteger(days) || days < 0 || days > 365))
      throw invalidFields({ minAdvanceDays: "Informe os dias de antecedência (0 a 365)." });
    const rules = i.rules.map((r, idx) => {
      const cents = parseMoneyToCents(r.maxAmount);
      if (cents !== null && (!Number.isFinite(cents) || cents <= 0))
        throw invalidFields({ [`rules.${idx}.maxAmount`]: "Valor inválido. Ex.: 1.200,00" });
      if (cents === null && !r.maxCabin && !r.maxHotelStars)
        throw invalidFields({
          [`rules.${idx}.maxAmount`]: "Informe um limite de valor, classe ou categoria.",
        });
      return {
        serviceType: r.serviceType,
        unit: r.unit,
        scope: r.scope,
        destination: r.destination,
        maxAmountCents: cents,
        currency: r.currency,
        maxCabin: r.serviceType === "AIR" && r.maxCabin ? r.maxCabin : null,
        maxHotelStars:
          r.serviceType === "HOTEL" && r.maxHotelStars ? Number(r.maxHotelStars) : null,
      };
    });
    const data = {
      name: i.name,
      description: i.description,
      active: i.active,
      priority: i.priority,
      appliesTo: { memberTypes: i.memberTypes, jobTitles: i.jobTitles },
      minAdvanceDays: days,
      requireInsuranceInternational: i.requireInsuranceInternational,
      requireJustification: i.requireJustification,
    };
    const policy = await c.db.$transaction(async (tx) => {
      if (i.policyId) {
        const existing = await tx.travelPolicy.findFirst({
          where: { id: i.policyId, tenantId: c.tenantId },
        });
        if (!existing) throw notFound("Política não encontrada.");
        await tx.travelPolicyRule.deleteMany({ where: { policyId: existing.id } });
        return tx.travelPolicy.update({
          where: { id: existing.id },
          data: { ...data, rules: { create: rules } },
        });
      }
      return tx.travelPolicy.create({
        data: { ...data, tenantId: c.tenantId, rules: { create: rules } },
      });
    });
    await audit({
      action: i.policyId ? "travel.policy.update" : "travel.policy.create",
      userId: c.viewer.user.id,
      actorLabel: c.actor,
      tenantId: c.tenantId,
      entityType: "TravelPolicy",
      entityId: policy.id,
      data: { name: policy.name, rules: rules.length },
    });
    return { id: policy.id };
  },
);

export const deletePolicy = defineAction(z.object({ tenant, policyId: id }), async (i) => {
  const c = await requireTravelConfig(i.tenant);
  const p = await c.db.travelPolicy.findFirst({ where: { id: i.policyId } });
  if (!p) throw notFound("Política não encontrada.");
  await c.db.travelPolicy.delete({ where: { id: p.id } });
  await audit({
    action: "travel.policy.delete",
    userId: c.viewer.user.id,
    actorLabel: c.actor,
    tenantId: c.tenantId,
    entityType: "TravelPolicy",
    entityId: p.id,
    data: { name: p.name },
  });
  return null;
});

/**
 * Modo de aprovação desta fase: um fluxo com uma etapa (papel APPROVER do
 * cliente). Os dados já são os do fluxo por alçada — a Fase 6 só acrescenta
 * etapas e condições.
 */
export const setApprovalMode = defineAction(
  z.object({ tenant, mode: z.enum(APPROVAL_MODES) }),
  async (i) => {
    const c = await requireTravelConfig(i.tenant);
    const flows = await loadApprovalFlows(c.db);
    await c.db.$transaction(async (tx) => {
      if (i.mode === "NEVER") {
        await tx.approvalFlow.updateMany({
          where: { tenantId: c.tenantId },
          data: { active: false },
        });
        return;
      }
      const conditions = conditionsForMode(i.mode) as Prisma.InputJsonValue;
      const flow = flows[0];
      if (flow) {
        await tx.approvalFlow.update({
          where: { id: flow.id },
          data: { active: true, conditions },
        });
        if (!flow.steps.length)
          await tx.approvalStep.create({
            data: {
              flowId: flow.id,
              sortOrder: 0,
              name: "Aprovador do cliente",
              approverType: "TENANT_ROLE",
            },
          });
      } else {
        await tx.approvalFlow.create({
          data: {
            tenantId: c.tenantId,
            name: "Aprovação do cliente",
            conditions,
            steps: {
              create: { sortOrder: 0, name: "Aprovador do cliente", approverType: "TENANT_ROLE" },
            },
          },
        });
      }
    });
    await audit({
      action: "travel.approval.mode",
      userId: c.viewer.user.id,
      actorLabel: c.actor,
      tenantId: c.tenantId,
      entityType: "ApprovalFlow",
      data: { mode: i.mode },
    });
    return null;
  },
);

// ---------------------------------------------------------------------------
// Acesso dos associados à área deles
// ---------------------------------------------------------------------------

/** Gera (ou renova) a senha provisória do associado; mostrada uma única vez. */
export const grantMemberAccess = defineAction(z.object({ tenant, personId: id }), async (i) => {
  const c = await requireTravelConfig(i.tenant);
  const person = await c.db.person.findFirst({ where: { id: i.personId, archivedAt: null } });
  if (!person) throw notFound("Pessoa não encontrada.");
  if (!person.emailNorm)
    throw new AppError("Cadastre o e-mail da pessoa antes: ele é o login da área.");
  const password = provisionalPassword(randomInt);
  await c.db.$transaction([
    c.db.person.update({
      where: { id: person.id },
      data: {
        isMember: true,
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
      },
    }),
    c.db.session.updateMany({
      where: { kind: "PERSON", personId: person.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  await audit({
    action: "member.access.grant",
    userId: c.viewer.user.id,
    actorLabel: c.actor,
    tenantId: c.tenantId,
    entityType: "Person",
    entityId: person.id,
  });
  return { password, login: person.email };
});

export const revokeMemberAccess = defineAction(z.object({ tenant, personId: id }), async (i) => {
  const c = await requireTravelConfig(i.tenant);
  const person = await c.db.person.findFirst({ where: { id: i.personId } });
  if (!person) throw notFound("Pessoa não encontrada.");
  await c.db.$transaction([
    c.db.person.update({ where: { id: person.id }, data: { passwordHash: null } }),
    c.db.session.updateMany({
      where: { kind: "PERSON", personId: person.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  await audit({
    action: "member.access.revoke",
    userId: c.viewer.user.id,
    actorLabel: c.actor,
    tenantId: c.tenantId,
    entityType: "Person",
    entityId: person.id,
  });
  return null;
});
