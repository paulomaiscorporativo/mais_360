import "server-only";
import { formatInZone } from "@mais/core";
import {
  compareQuotes,
  formatCents,
  isQuoteExpired,
  PASSENGER_TYPE_LABELS,
  quotesVisibleToRequester,
  TIME_PREFERENCE_LABELS,
  TRAVEL_DOC_LABELS,
  TRIP_TYPE_LABELS,
  TRAVEL_SCOPE_LABELS,
} from "@mais/core/corporate-travel";
import { CABIN_CLASS_LABELS, ROOM_TYPE_LABELS } from "@mais/core";
import type { QuoteView } from "@/components/corporate-travel/quote-compare";
import type { TimelineItem } from "@/components/corporate-travel/display";
import { serviceLabel } from "@/components/corporate-travel/labels";
import { currentRound, readViolations, type RequestDetail } from "./corporate-travel";

/**
 * Transforma a solicitação do banco nos dados prontos para a tela (datas no
 * fuso do cliente, dinheiro formatado). Usado pelo console e pela área do
 * associado — a área só recebe o que o solicitante pode ver.
 */

const dateOnly = (d: Date | null, tz: string) => (d ? formatInZone(d, tz, "date") : "");

function readObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Detalhes pedidos por serviço, em frases curtas. */
export function serviceSummaries(r: RequestDetail, tz: string) {
  const details = readObj(r.serviceDetails);
  return r.requestedServices.map((type) => {
    const d = readObj(details[type]);
    const parts: string[] = [];
    const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
    switch (type) {
      case "AIR":
        if (str("cabin"))
          parts.push(CABIN_CLASS_LABELS[str("cabin") as keyof typeof CABIN_CLASS_LABELS] ?? "");
        if (str("preferredAirline")) parts.push(`cia. preferida ${str("preferredAirline")}`);
        parts.push(
          d.checkedBaggage === false ? "sem bagagem despachada" : "com bagagem despachada",
        );
        if (str("seatPreference") === "WINDOW") parts.push("janela");
        if (str("seatPreference") === "AISLE") parts.push("corredor");
        if (str("loyaltyProgram")) parts.push(`fidelidade ${str("loyaltyProgram")}`);
        break;
      case "HOTEL": {
        if (str("city")) parts.push(str("city"));
        const ci = d.checkIn ? new Date(String(d.checkIn)) : null;
        const co = d.checkOut ? new Date(String(d.checkOut)) : null;
        if (ci && co) parts.push(`${dateOnly(ci, tz)} a ${dateOnly(co, tz)}`);
        if (str("stars") && str("stars") !== "ANY") parts.push(`${str("stars")} estrelas`);
        if (typeof d.rooms === "number")
          parts.push(`${d.rooms} ${d.rooms === 1 ? "quarto" : "quartos"}`);
        if (str("roomType"))
          parts.push(ROOM_TYPE_LABELS[str("roomType") as keyof typeof ROOM_TYPE_LABELS] ?? "");
        parts.push(d.breakfast === false ? "sem café" : "com café");
        if (str("reference")) parts.push(str("reference"));
        break;
      }
      case "CAR_RENTAL":
        for (const k of ["category", "pickup", "dropoff"]) if (str(k)) parts.push(str(k));
        if (d.extraDriver === true) parts.push("condutor adicional");
        break;
      case "EVENT_TICKET":
        if (str("eventName")) parts.push(str("eventName"));
        break;
      default:
        if (str("notes")) parts.push(str("notes"));
    }
    return { type, label: serviceLabel(type), text: parts.filter(Boolean).join(" · ") };
  });
}

export function quoteViews(r: RequestDetail, tz: string, now = new Date()): QuoteView[] {
  const cmp = compareQuotes(
    r.quotes.map((q) => ({
      id: q.id,
      currency: q.currency,
      totalCents: q.totalCents,
      validUntil: q.validUntil,
      inPolicy: q.inPolicy,
    })),
    now,
  );
  return r.quotes.map((q) => ({
    id: q.id,
    title: q.title,
    description: q.description,
    total: formatCents(q.totalCents, q.currency),
    perPax: formatCents(q.perPaxCents, q.currency),
    validUntil: q.validUntil ? formatInZone(q.validUntil, tz, "datetime") : "",
    expired: isQuoteExpired(q.validUntil, now),
    inPolicy: q.inPolicy,
    cheapest: cmp.cheapestId === q.id,
    chosen: r.chosenQuoteId === q.id,
    lines: q.serviceItems.map((i) => ({
      id: i.id,
      type: i.type,
      title: i.title,
      description: i.description,
      amount: formatCents(i.saleCents, i.currency),
      quantity: i.quantity,
    })),
  }));
}

export function timelineItems(r: RequestDetail, tz: string): TimelineItem[] {
  return r.events.map((e) => ({
    id: e.id,
    status: e.status,
    note: e.note,
    actor: e.actorName,
    at: formatInZone(e.createdAt, tz, "datetime"),
  }));
}

/** Tudo que as duas telas de detalhe mostram. */
export function requestView(r: RequestDetail, tz: string, audience: "staff" | "member") {
  const showQuotes = audience === "staff" || quotesVisibleToRequester(r.status);
  const round = currentRound(r.approvals, r.decidedAt);
  return {
    id: r.id,
    protocol: r.protocol,
    status: r.status,
    tripType: TRIP_TYPE_LABELS[r.tripType],
    scope: TRAVEL_SCOPE_LABELS[r.scope === "INTERNATIONAL" ? "INTERNATIONAL" : "DOMESTIC"],
    flexibleDates: r.flexibleDates,
    requester: r.requesterName,
    requesterEmail: r.requesterEmail,
    requesterPhone: r.requesterPhone,
    company: r.companyName,
    purpose: r.purpose,
    notes: r.notes,
    budget: r.budgetCents !== null ? formatCents(r.budgetCents, r.currency) : "",
    pax: r.pax,
    createdAt: formatInZone(r.createdAt, tz, "datetime"),
    handledBy: r.handledBy,
    assignedUserId: r.assignedUserId,
    outOfPolicy: r.outOfPolicy,
    violations: readViolations(r.policyViolations),
    justification: r.justification,
    policyName: r.policy?.name ?? "",
    requireJustification: r.policy?.requireJustification ?? false,
    segments: r.segments.map((s) => ({
      id: s.id,
      origin: s.origin,
      destination: s.destination,
      date: dateOnly(s.date, tz),
      time: s.timePreference === "ANY" ? "" : TIME_PREFERENCE_LABELS[s.timePreference],
      notes: s.notes,
    })),
    passengers: r.passengers.map((p) => ({
      id: p.id,
      name: p.name,
      type: PASSENGER_TYPE_LABELS[p.type],
      linked: !!p.personId,
      doc: p.docNumber ? `${TRAVEL_DOC_LABELS[p.docType]} ${p.docNumber}` : "",
      docExpiry: dateOnly(p.docExpiry, tz),
      birthDate: dateOnly(p.birthDate, tz),
      contact: [p.email, p.phone].filter(Boolean).join(" · "),
      loyalty: p.loyalty,
      notes: p.notes,
    })),
    services: serviceSummaries(r, tz),
    quotes: showQuotes ? quoteViews(r, tz) : [],
    timeline: timelineItems(r, tz),
    approvals: round.map((a) => ({
      id: a.id,
      stepName: a.stepName || "Aprovação",
      decision: a.decision,
      comment: a.comment,
      decidedAt: a.decidedAt ? formatInZone(a.decidedAt, tz, "datetime") : "",
      approverUserId: a.approverUserId,
    })),
    bookings: r.serviceItems.map((i) => ({
      id: i.id,
      type: i.type,
      label: serviceLabel(i.type),
      title: i.title,
      locator: i.locator,
      notes: i.notes,
      files: i.attachments.map((a) => ({ id: a.fileId, kind: a.kind })),
    })),
  };
}

export type RequestViewData = ReturnType<typeof requestView>;
