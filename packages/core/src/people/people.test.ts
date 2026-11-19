import { describe, expect, it } from "vitest";
import {
  defaultBadgeName,
  findDuplicate,
  foldText,
  isValidCpf,
  normalizeCpf,
  normalizeEmail,
  parseYes,
  personSearchText,
  splitFullName,
} from "./index";
import { applyMapping, guessColumnMapping, makeShortCode, makeToken } from "../registrations";
import { PROJECT_TEMPLATES, projectTemplate } from "../projects";
import { PROJECT_FEATURES } from "../modules/catalog";

describe("normalização", () => {
  it("dobra acentos e caixa", () => {
    expect(foldText("  João  da CONCEIÇÃO ")).toBe("joao da conceicao");
  });
  it("e-mail extrai e minúscula", () => {
    expect(normalizeEmail("Maria <MARIA@Exemplo.com.BR>")).toBe("maria@exemplo.com.br");
    expect(normalizeEmail("não tem")).toBe("");
  });
  it("CPF recupera zeros apagados pelo Excel e valida dígitos", () => {
    expect(normalizeCpf(1234567890)).toBe("01234567890");
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("529.982.247-24")).toBe(false);
  });
  it("nome completo e nome de crachá", () => {
    expect(splitFullName("Maria da Silva Souza")).toEqual({
      firstName: "Maria",
      lastName: "da Silva Souza",
    });
    expect(defaultBadgeName("ANA", "DE SOUZA")).toBe("Ana Souza");
    expect(defaultBadgeName("José", "Pereira Filho")).toBe("José Pereira Filho");
  });
  it("busca sem acento inclui empresa", () => {
    expect(personSearchText({ firstName: "Inês", organizations: ["Frigorífico Sul"] })).toContain(
      "frigorifico sul",
    );
  });
  it("consentimento", () => {
    expect(parseYes("Sim")).toBe(true);
    expect(parseYes("Não")).toBe(false);
  });
});

describe("findDuplicate", () => {
  const base = [
    { id: "a", cpf: "52998224725", email: "maria@ex.com", phone: "" },
    { id: "b", cpf: "", email: "familia@ex.com", phone: "5511988887777" },
  ];
  it("CPF tem prioridade", () => {
    expect(findDuplicate({ cpf: "529.982.247-25", email: "outra@ex.com" }, base)).toEqual({
      person: base[0],
      reason: "CPF",
    });
  });
  it("e-mail normalizado", () => {
    expect(findDuplicate({ email: "MARIA@ex.com" }, base)?.reason).toBe("EMAIL");
  });
  it("telefone com e sem o 9º dígito é o mesmo", () => {
    expect(findDuplicate({ phone: "(11) 8888-7777" }, base)?.person.id).toBe("b");
  });
  it("mesmo e-mail com CPF diferente é outra pessoa", () => {
    expect(findDuplicate({ email: "maria@ex.com", cpf: "11144477735" }, base)).toBeNull();
  });
});

describe("códigos de inscrição", () => {
  it("shortCode evita códigos já usados", () => {
    const seq = [123, 123, 456];
    let i = 0;
    const taken = new Set(["000123"]);
    expect(
      makeShortCode(
        () => seq[i++]!,
        (c) => taken.has(c),
      ),
    ).toBe("000456");
  });
  it("token tem 22 caracteres do alfabeto sem ambíguos", () => {
    const t = makeToken((n) => n - 1);
    expect(t).toHaveLength(22);
    expect(t).not.toMatch(/[0O1lI]/);
  });
});

describe("importação", () => {
  it("mapeia cabeçalhos comuns sem confundir nome e sobrenome", () => {
    const m = guessColumnMapping([
      "Nome",
      "Sobrenome",
      "E-mail",
      "Celular",
      "CPF",
      "Empresa",
      "Nome no crachá",
    ]);
    expect(m).toMatchObject({
      firstName: 0,
      lastName: 1,
      email: 2,
      phone: 3,
      cpf: 4,
      organization: 5,
      badgeName: 6,
    });
  });
  it("coluna única de nome vira nome completo", () => {
    expect(guessColumnMapping(["Nome", "Email"])).toMatchObject({ fullName: 0, email: 1 });
  });
  it("aplica o mapeamento e limpa espaços", () => {
    expect(
      applyMapping(["  Ana ", null, "a@x.com"], { firstName: 0, lastName: 1, email: 2 }),
    ).toEqual({
      firstName: "Ana",
      email: "a@x.com",
    });
  });
});

describe("modelos de projeto", () => {
  it("só usam recursos existentes", () => {
    for (const t of PROJECT_TEMPLATES)
      for (const f of t.features) expect(PROJECT_FEATURES).toContain(f);
  });
  it("feira pré-liga stands e credenciamento", () => {
    expect(projectTemplate("TRADE_SHOW").features).toEqual(
      expect.arrayContaining(["STANDS", "ACCREDITATION"]),
    );
  });
});
