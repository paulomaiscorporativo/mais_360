import { describe, expect, it } from "vitest";
import { buildFieldValues, MESSAGE_FIELDS, sampleContext, type MessageContext } from "./fields";
import {
  defaultActions,
  fillFields,
  renderEmail,
  renderWhatsapp,
  safeUrl,
  textOn,
  unknownFields,
} from "./render";
import { normalizePhone } from "./phone";
import { planRecipients, type Candidate } from "./audience";
import { campaignDeliveryKey, transactionalKey } from "./dedupe";

const now = new Date("2026-11-03T15:00:00Z");
const ctx: MessageContext = {
  timeZone: "America/Sao_Paulo",
  tenant: { name: "ABIEC" },
  person: {
    firstName: "José",
    lastName: "Araújo",
    company: "Frigorífico São João",
    email: "jose@x.com.br",
  },
  registration: {
    status: "INVITED",
    checkedIn: false,
    category: "Visitante",
    shortCode: "482913",
    badgeUrl: "https://abiec.mais.tur.br/c/tok",
    confirmUrl: "https://abiec.mais.tur.br/c/tok?confirmar=1",
  },
  project: {
    name: "Jantar ABIEC 2026",
    startsAt: new Date("2026-11-10T22:30:00Z"), // 19:30 BRT
    venueName: "Casa Bizutt",
    venueAddress: "Rua do Ator, 577 - São Paulo/SP",
  },
  invite: { table: 5, seat: 3 },
};

describe("campos", () => {
  it("catálogo sem chaves repetidas", () => {
    const keys = MESSAGE_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("todo campo do catálogo tem valor calculado", () => {
    const values = buildFieldValues(sampleContext("America/Sao_Paulo", now), now);
    for (const f of MESSAGE_FIELDS) expect(Object.hasOwn(values, f.key), f.key).toBe(true);
  });

  it("datas e dias restantes no fuso do evento, com acentos preservados", () => {
    const v = buildFieldValues(ctx, now);
    expect(v.data_inicio).toBe("10/11/2026");
    expect(v.hora_inicio).toBe("19:30");
    expect(v.dias_restantes).toBe("7");
    expect(v.nome).toBe("José Araújo");
    expect(v.mesa).toBe("Mesa 5, cadeira 3");
  });

  it("aponta campos desconhecidos e ignora espaços/maiúsculas", () => {
    expect(unknownFields("Olá {{ Nome }}, {{xyz}}")).toEqual(["xyz"]);
    expect(fillFields("Olá {{ NOME }}!", { nome: "Ana" })).toBe("Olá Ana!");
  });
});

describe("e-mail", () => {
  const tpl = {
    emailSubject: "Faltam {{dias_restantes}} dias — {{projeto}}",
    emailBody:
      "Olá, **{{primeiro_nome}}**!\n\nNos vemos em {{local}}.\n\nDúvidas: https://abiec.org.br/contato.",
    includeActions: true,
  };

  it("monta assunto, botões e versão texto", () => {
    const r = renderEmail(tpl, ctx, { primaryColor: "#6ba63d" }, now);
    expect(r.subject).toBe("Faltam 7 dias — Jantar ABIEC 2026");
    expect(r.html).toContain("<strong>José</strong>");
    expect(r.html).toContain("Confirmar minha presença");
    expect(r.html).toContain('href="https://abiec.org.br/contato"');
    expect(r.text).toContain(
      "Confirmar minha presença: https://abiec.mais.tur.br/c/tok?confirmar=1",
    );
    expect(r.text).not.toContain("**");
  });

  it("escapa HTML vindo dos dados (sem injeção)", () => {
    const evil: MessageContext = {
      ...ctx,
      person: { firstName: '<img src=x onerror="alert(1)">' },
    };
    const r = renderEmail(tpl, evil, { primaryColor: "#000" }, now);
    expect(r.html).not.toContain("<img src=x");
    expect(r.html).toContain("&lt;img src=x");
  });

  it("não oferece confirmar a quem já confirmou ou já fez check-in", () => {
    const done: MessageContext = {
      ...ctx,
      registration: { ...ctx.registration!, status: "CONFIRMED" },
    };
    expect(defaultActions(done).map((a) => a.label)).toEqual(["Abrir meu crachá digital"]);
    const r = renderEmail(tpl, done, { primaryColor: "#123f6d" }, now);
    expect(r.html).toContain("Sua presença está confirmada");
  });

  it("bloqueia URL perigosa em logo/banner", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("");
    const r = renderEmail(
      tpl,
      ctx,
      { primaryColor: "#123f6d", logoUrl: "javascript:alert(1)" },
      now,
    );
    expect(r.html).not.toContain("javascript:");
  });

  it("texto sobre a marca tem contraste: branco no azul, tinta no amarelo", () => {
    expect(textOn("#002042")).toBe("#ffffff");
    expect(textOn("#f7ad40")).toBe("#0b1320");
  });

  it("white-label esconde a marca da plataforma", () => {
    expect(
      renderEmail(tpl, ctx, { primaryColor: "#123f6d", showPlatformBrand: false }, now).html,
    ).not.toContain("Comitiva");
  });
});

describe("WhatsApp", () => {
  it("converte negrito e acrescenta links das ações uma única vez", () => {
    const t = renderWhatsapp(
      {
        whatsappBody: "Olá **{{primeiro_nome}}**! Confirme: {{link_confirmar}}",
        emailBody: "",
        includeActions: true,
      },
      ctx,
      now,
    );
    expect(t.startsWith("Olá *José*!")).toBe(true);
    expect(t.split("https://abiec.mais.tur.br/c/tok?confirmar=1").length - 1).toBe(1);
    expect(t).toContain("*Abrir meu crachá digital:*");
  });

  it("sem texto próprio, usa o corpo do e-mail", () => {
    expect(
      renderWhatsapp(
        { whatsappBody: " ", emailBody: "Oi {{primeiro_nome}}", includeActions: false },
        ctx,
        now,
      ),
    ).toBe("Oi José");
  });
});

describe("telefones", () => {
  it("normaliza formatos brasileiros para E.164", () => {
    expect(normalizePhone("(11) 99999-8888")?.e164).toBe("5511999998888");
    expect(normalizePhone("+55 11 99999-8888")?.e164).toBe("5511999998888");
    expect(normalizePhone("011 99999-8888")?.e164).toBe("5511999998888");
  });

  it("celular com e sem o 9º dígito é o mesmo WhatsApp", () => {
    expect(normalizePhone("11 9999-8888")?.identity).toBe(
      normalizePhone("11 99999-8888")?.identity,
    );
  });

  it("rejeita lixo e DDD inválido", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("(00) 99999-8888")).toBeNull();
    expect(normalizePhone("(11) 89999-8888")).toBeNull();
  });

  it("fixo não é considerado celular", () => {
    expect(normalizePhone("(11) 3333-4444")?.isMobile).toBe(false);
  });
});

describe("público e idempotência", () => {
  const c = (id: string, extra: Partial<Candidate>): Candidate => ({
    recipientId: id,
    personId: id,
    name: id,
    ...extra,
  });

  it("WhatsApp: pula sem telefone, inválido, opt-out e o mesmo aparelho repetido", () => {
    const plan = planRecipients(
      [
        c("a", { phone: "11 99999-8888" }),
        c("b", { phone: "11 9999-8888" }), // mesmo WhatsApp de "a"
        c("c", {}),
        c("d", { phone: "11 3333-4444" }),
        c("e", { phone: "21 98888-7777", whatsappOptOut: true }),
      ],
      "WHATSAPP",
    );
    expect(plan.map((p) => p.skip ?? "OK")).toEqual([
      "OK",
      "DUPLICATE",
      "NO_PHONE",
      "INVALID_PHONE",
      "OPT_OUT",
    ]);
  });

  it("E-mail: normaliza caixa e deduplica", () => {
    const plan = planRecipients(
      [
        c("a", { email: "Ana@X.com" }),
        c("b", { email: "ana@x.com " }),
        c("c", { email: "sem-arroba" }),
      ],
      "EMAIL",
    );
    expect(plan.map((p) => p.skip ?? p.target)).toEqual([
      "ana@x.com",
      "DUPLICATE",
      "INVALID_EMAIL",
    ]);
  });

  it("chaves estáveis por campanha/destinatário/canal", () => {
    expect(campaignDeliveryKey("cmp", "reg", "WHATSAPP")).toBe("c:cmp:reg:WHATSAPP");
    expect(transactionalKey("registration.confirmed", "reg", "EMAIL")).toBe(
      "t:registration.confirmed:reg:EMAIL",
    );
    expect(transactionalKey("invite.resend", "reg", "EMAIL", "2")).not.toBe(
      transactionalKey("invite.resend", "reg", "EMAIL", "3"),
    );
  });
});
