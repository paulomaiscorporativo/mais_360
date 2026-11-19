import { describe, expect, it } from "vitest";
import {
  buildIcs,
  canCompanyRegister,
  companyLogin,
  eventStartAt,
  firstFreeSeat,
  inviteStatus,
  parseScan,
  planQuotaExpiration,
  provisionalPassword,
  readHotels,
  seatPositions,
} from "./index";

const now = new Date("2026-11-20T12:00:00Z");
const deadline = new Date("2026-11-30T23:59:00Z");

describe("inviteStatus", () => {
  it("segue a precedência cancelado > credenciado > resposta > envio", () => {
    expect(inviteStatus({ status: "CANCELED", checkedInAt: now })).toBe("CANCELED");
    expect(inviteStatus({ status: "CONFIRMED", checkedInAt: now })).toBe("CHECKED_IN");
    expect(inviteStatus({ status: "CONFIRMED" })).toBe("CONFIRMED");
    expect(inviteStatus({ status: "DECLINED", sentAt: now })).toBe("DECLINED");
    expect(inviteStatus({ status: "PENDING", sentAt: now })).toBe("SENT");
    expect(inviteStatus({ status: "PENDING" })).toBe("PENDING");
  });
});

describe("cotas", () => {
  it("permite dentro da cota e informa o que sobra", () => {
    expect(canCompanyRegister({ quota: 4, used: 1 }, deadline, now)).toEqual({
      ok: true,
      remaining: 2,
    });
  });
  it("bloqueia cota cheia, prazo vencido e empresa travada", () => {
    expect(canCompanyRegister({ quota: 4, used: 4 }, deadline, now)).toMatchObject({
      ok: false,
      reason: "FULL",
    });
    expect(canCompanyRegister({ quota: 4, used: 3 }, deadline, now, 2)).toMatchObject({
      ok: false,
      reason: "FULL",
    });
    expect(canCompanyRegister({ quota: 4, used: 0 }, new Date("2026-11-01"), now)).toMatchObject({
      ok: false,
      reason: "DEADLINE",
    });
    expect(canCompanyRegister({ quota: 4, used: 0, lockedAt: now }, deadline, now)).toMatchObject({
      ok: false,
      reason: "LOCKED",
    });
  });
});

describe("planQuotaExpiration", () => {
  const companies = [
    { id: "a", quota: 4, used: 1 },
    { id: "b", quota: 4, used: 4 },
    { id: "c", quota: 6, used: 2, lockedAt: new Date("2026-11-10") },
  ];
  it("antes da data-limite não processa (sem antecipação)", () => {
    expect(planQuotaExpiration(companies, deadline, now)).toEqual({
      allowed: false,
      companies: [],
      totalReturned: 0,
    });
  });
  it("depois da data-limite devolve as sobras e ignora quem já foi travado", () => {
    const plan = planQuotaExpiration(companies, deadline, new Date("2026-12-01"));
    expect(plan.allowed).toBe(true);
    expect(plan.companies).toEqual([
      { id: "a", returned: 3 },
      { id: "b", returned: 0 },
    ]);
    expect(plan.totalReturned).toBe(3);
  });
  it("antecipação explícita processa mesmo antes do prazo", () => {
    expect(planQuotaExpiration(companies, deadline, now, true).totalReturned).toBe(3);
  });
});

describe("credenciais da empresa", () => {
  it("gera login legível, sem acento nem sufixo societário, e único", () => {
    const taken = new Set(["frigorificohorizonte"]);
    expect(companyLogin("Frigorífico Horizonte S/A", () => false)).toBe("frigorificohorizonte");
    expect(companyLogin("Frigorífico Horizonte Ltda", (l) => taken.has(l))).toBe(
      "frigorificohorizonte2",
    );
  });
  it("senha provisória atende a política (letra e número, 10 caracteres)", () => {
    let i = 0;
    const seq = (max: number) => i++ % max;
    const pwd = provisionalPassword(seq);
    expect(pwd).toHaveLength(10);
    expect(pwd).toMatch(/[A-Za-z]/);
    expect(pwd).toMatch(/\d/);
    expect(pwd).not.toMatch(/[0O1lI]/);
  });
});

describe("parseScan", () => {
  it("lê a URL da credencial, o token e o código curto", () => {
    expect(parseScan("https://abiec.mais.tur.br/c/AbC123xyz456def")).toEqual({
      kind: "token",
      token: "AbC123xyz456def",
    });
    expect(parseScan("http://localhost:3360/t/abiec/c/AbC123xyz456def?confirmar=1")).toEqual({
      kind: "token",
      token: "AbC123xyz456def",
    });
    expect(parseScan(" 482 913 ")).toEqual({ kind: "code", code: "482913" });
    expect(parseScan("AbC123xyz456def")).toEqual({ kind: "token", token: "AbC123xyz456def" });
    expect(parseScan("olá")).toBeNull();
    expect(parseScan("")).toBeNull();
  });
});

describe("mesas", () => {
  it("encontra a primeira cadeira livre", () => {
    expect(firstFreeSeat(4, [1, 2, null, 4])).toBe(3);
    expect(firstFreeSeat(2, [1, 2])).toBeNull();
  });
  it("distribui as cadeiras em volta da mesa", () => {
    expect(seatPositions("ROUND", 8, { radius: 40, width: 0, height: 0 })).toHaveLength(8);
    const rect = seatPositions("RECTANGULAR", 5, { radius: 0, width: 120, height: 50 });
    expect(rect.filter((s) => s.y < 0)).toHaveLength(3);
    expect(rect.filter((s) => s.y > 0)).toHaveLength(2);
  });
});

describe("agenda", () => {
  it("monta o horário do evento no fuso do projeto", () => {
    // 12/12/2026 20:00 em São Paulo (UTC−3) = 23:00 UTC
    const start = eventStartAt(new Date("2026-12-12T03:00:00Z"), "20:00", "America/Sao_Paulo");
    expect(start.toISOString()).toBe("2026-12-12T23:00:00.000Z");
  });
  it("gera .ics válido com escape e duração padrão", () => {
    const ics = buildIcs({
      uid: "r1@mais360",
      title: "Jantar ABIEC, 2026",
      start: new Date("2026-12-12T23:00:00Z"),
      location: "Casa Bizutt; São Paulo",
      now: new Date("2026-11-20T00:00:00Z"),
    });
    expect(ics).toContain("DTSTART:20261212T230000Z");
    expect(ics).toContain("DTEND:20261213T030000Z");
    expect(ics).toContain("SUMMARY:Jantar ABIEC\\, 2026");
    expect(ics).toContain("LOCATION:Casa Bizutt\\; São Paulo");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("readHotels", () => {
  it("tolera Json legado e descarta itens sem nome", () => {
    expect(
      readHotels([{ nome: " Hotel A ", distancia: "300 m" }, { endereco: "x" }, null, "x"]),
    ).toEqual([{ nome: "Hotel A", endereco: "", telefone: "", distancia: "300 m", link: "" }]);
    expect(readHotels("lixo")).toEqual([]);
  });
});
