import { describe, expect, it } from "vitest";
import { buildInviteReport, canCompanyChangeGuest, rsvpState } from "./index";

const now = new Date("2026-11-20T12:00:00Z");
const before = new Date("2026-11-10T12:00:00Z");
const after = new Date("2026-11-30T12:00:00Z");

describe("rsvpState", () => {
  it("abre a resposta dentro do prazo e informa até quando", () => {
    expect(rsvpState({ status: "INVITED" }, { deadline: after }, now)).toEqual({
      open: true,
      until: after,
    });
    expect(rsvpState({ status: "CONFIRMED" }, {}, now)).toEqual({ open: true, until: null });
  });

  it("fecha depois da data-limite e depois do fim do evento", () => {
    expect(rsvpState({ status: "INVITED" }, { deadline: before }, now)).toMatchObject({
      open: false,
      reason: "DEADLINE",
    });
    expect(rsvpState({ status: "INVITED" }, { eventEnd: before }, now)).toMatchObject({
      open: false,
      reason: "EVENT_OVER",
    });
  });

  it("cancelado e credenciado não respondem", () => {
    expect(rsvpState({ status: "CANCELED" }, {}, now)).toMatchObject({ reason: "CANCELED" });
    expect(rsvpState({ status: "CONFIRMED", checkedInAt: now }, {}, now)).toMatchObject({
      reason: "CHECKED_IN",
    });
  });
});

describe("canCompanyChangeGuest", () => {
  const company = { id: "c1", lockedAt: null };
  const guest = {
    companyQuotaId: "c1",
    kind: "COMPANY_GUEST" as const,
    status: "INVITED",
    checkedInAt: null,
  };

  it("permite alterar convidado da própria empresa dentro do prazo", () => {
    expect(canCompanyChangeGuest(company, guest, after, now)).toEqual({ ok: true });
  });

  it("bloqueia convidado de outra empresa, prazo vencido e empresa travada", () => {
    expect(canCompanyChangeGuest(company, { ...guest, companyQuotaId: "c2" }, null, now).ok).toBe(
      false,
    );
    expect(canCompanyChangeGuest(company, guest, before, now).ok).toBe(false);
    expect(canCompanyChangeGuest({ id: "c1", lockedAt: before }, guest, null, now).ok).toBe(false);
  });

  it("não troca o responsável nem quem já foi credenciado ou cancelado", () => {
    expect(canCompanyChangeGuest(company, { ...guest, kind: "RESPONSIBLE" }, null, now).ok).toBe(
      false,
    );
    expect(canCompanyChangeGuest(company, { ...guest, checkedInAt: now }, null, now).ok).toBe(
      false,
    );
    expect(canCompanyChangeGuest(company, { ...guest, status: "CANCELED" }, null, now).ok).toBe(
      false,
    );
  });
});

describe("buildInviteReport", () => {
  const companies = [
    { id: "a", name: "Alfa", quota: 4, returnedToPool: 0 },
    { id: "b", name: "Beta", quota: 2, returnedToPool: 1 },
  ];

  it("soma por status, por empresa e separa os convites individuais", () => {
    const r = buildInviteReport(
      [
        { status: "CONFIRMED", companyQuotaId: "a" },
        { status: "CHECKED_IN", companyQuotaId: "a" },
        { status: "CANCELED", companyQuotaId: "a" },
        { status: "DECLINED", companyQuotaId: "b" },
        { status: "SENT", companyQuotaId: null },
      ],
      companies,
    );
    expect(r.totals).toMatchObject({ active: 4, CONFIRMED: 1, CHECKED_IN: 1, CANCELED: 1 });
    const [alfa, beta, individual] = r.companies;
    expect(alfa).toMatchObject({ name: "Alfa", active: 2, usage: 0.5, attendance: 0.5 });
    expect(beta).toMatchObject({ active: 1, DECLINED: 1, returnedToPool: 1, attendance: 0 });
    expect(individual).toMatchObject({ id: null, quota: null, usage: null, SENT: 1 });
  });

  it("empresa sem convites aparece zerada e sem linha individual vazia", () => {
    const r = buildInviteReport([], companies);
    expect(r.companies).toHaveLength(2);
    expect(r.companies[0]).toMatchObject({ active: 0, usage: 0, attendance: null });
  });
});
