import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  classifyTlsHost,
  customDomainTarget,
  DOMAIN_STATUSES,
  expectedRecords,
  interpretLookup,
  isApexDomain,
  isDueForCheck,
  isPlatformHost,
  nextDomainState,
  normalizeHostname,
  validateCustomHostname,
  type DnsLookup,
} from "./index";

function prismaEnum(name: string): string[] {
  const file = fileURLToPath(new URL("../../../db/prisma/schema/core.prisma", import.meta.url));
  const body = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(readFileSync(file, "utf8"))?.[1] ?? "";
  return body
    .split("\n")
    .map((l) => l.replace(/\/\/.*/, "").trim())
    .filter(Boolean);
}

const now = new Date("2026-11-23T12:00:00Z");
const DAY = 86_400_000;
const platform = { platformDomains: ["mais.tur.br"], reservedHosts: ["360.mais.tur.br"] };

describe("hostname", () => {
  it("espelha o enum DomainStatus do banco", () => {
    expect([...DOMAIN_STATUSES].sort()).toEqual(prismaEnum("DomainStatus").sort());
  });

  it("normaliza o que a pessoa cola", () => {
    expect(normalizeHostname("  https://Eventos.Cliente.com.br/inscricao?x=1 ")).toBe(
      "eventos.cliente.com.br",
    );
    expect(normalizeHostname("eventos.cliente.com.br.")).toBe("eventos.cliente.com.br");
    expect(normalizeHostname("eventos.cliente.com.br:8443")).toBe("eventos.cliente.com.br");
    expect(normalizeHostname("eventos.ação.com.br")).toMatch(/^eventos.xn--ao-[a-z0-9]+.com.br$/);
    expect(normalizeHostname("")).toBe("");
  });

  it("aceita domínio próprio válido", () => {
    expect(validateCustomHostname("eventos.cliente.com.br", platform)).toEqual({
      ok: true,
      hostname: "eventos.cliente.com.br",
    });
    expect(validateCustomHostname("https://cliente.com/", platform)).toEqual({
      ok: true,
      hostname: "cliente.com",
    });
  });

  it("recusa endereços inválidos ou reservados", () => {
    const bad = [
      "",
      "localhost",
      "cliente",
      "192.168.0.10",
      "*.cliente.com.br",
      "eventos_cliente.com.br",
      "-eventos.cliente.com.br",
      "eventos.cliente.local",
      "app.empresa.test",
      "eventos.cliente.c0m",
      `${"a".repeat(64)}.com.br`,
    ];
    for (const h of bad) expect(validateCustomHostname(h, platform).ok, h).toBe(false);
  });

  it("proíbe endereços da plataforma, inclusive o de outros clientes", () => {
    const r = validateCustomHostname("abiec.mais.tur.br", platform);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("mais.tur.br") });
    expect(validateCustomHostname("mais.tur.br", platform).ok).toBe(false);
    expect(validateCustomHostname("360.mais.tur.br", platform).ok).toBe(false);
    expect(validateCustomHostname("x.y.mais.tur.br", platform).ok).toBe(false);
    // parecido, mas não é subdomínio
    expect(validateCustomHostname("eventosmais.tur.br", platform).ok).toBe(true);
    expect(isPlatformHost("abiec.mais.tur.br", ["mais.tur.br"])).toBe(true);
    expect(isPlatformHost("eventos.abiec.com.br", ["mais.tur.br"])).toBe(false);
  });

  it("identifica domínio raiz para orientar sobre CNAME", () => {
    expect(isApexDomain("cliente.com")).toBe(true);
    expect(isApexDomain("cliente.com.br")).toBe(true);
    expect(isApexDomain("eventos.cliente.com.br")).toBe(false);
    expect(isApexDomain("eventos.cliente.com")).toBe(false);
  });

  it("monta o alvo do CNAME", () => {
    expect(customDomainTarget("mais.tur.br")).toBe("clientes.mais.tur.br");
    expect(customDomainTarget("mais.tur.br", "edge.mais.tur.br.")).toBe("edge.mais.tur.br");
    expect(customDomainTarget("mais.tur.br", "")).toBe("clientes.mais.tur.br");
  });

  it("monta os registros esperados", () => {
    expect(expectedRecords("Eventos.Cliente.com.br", "tok123", "clientes.mais.tur.br")).toEqual({
      cname: expect.objectContaining({
        type: "CNAME",
        name: "eventos.cliente.com.br",
        value: "clientes.mais.tur.br",
      }),
      txt: expect.objectContaining({
        type: "TXT",
        name: "_mais360.eventos.cliente.com.br",
        value: "mais360-verificacao=tok123",
      }),
    });
  });
});

describe("interpretação do DNS", () => {
  const expected = { token: "tok123", target: "clientes.mais.tur.br" };
  const ok = <T>(value: T) => ({ ok: true as const, value });
  const err = (code: string) => ({ ok: false as const, code });
  const base: DnsLookup = {
    txt: ok([["mais360-verificacao=", "tok123"]]),
    cname: ok(["Clientes.Mais.Tur.Br."]),
    hostAddresses: ok(["203.0.113.10"]),
    targetAddresses: ok(["203.0.113.10"]),
  };

  it("tudo certo com CNAME e TXT (TXT em pedaços)", () => {
    expect(interpretLookup(base, expected)).toEqual({ ownership: "ok", routing: "ok" });
  });

  it("aceita domínio raiz com os mesmos endereços do alvo (ALIAS)", () => {
    const r = interpretLookup({ ...base, cname: err("ENODATA") }, expected);
    expect(r.routing).toBe("ok");
  });

  it("detecta registros ausentes, errados e falha temporária", () => {
    expect(
      interpretLookup(
        {
          txt: err("ENOTFOUND"),
          cname: err("ENOTFOUND"),
          hostAddresses: err("ENOTFOUND"),
          targetAddresses: ok(["203.0.113.10"]),
        },
        expected,
      ),
    ).toEqual({ ownership: "missing", routing: "missing" });
    expect(
      interpretLookup(
        {
          ...base,
          txt: ok([["mais360-verificacao=outro"]]),
          cname: ok(["outro.host.com"]),
          hostAddresses: ok(["198.51.100.1"]),
        },
        expected,
      ),
    ).toEqual({ ownership: "mismatch", routing: "elsewhere" });
    expect(
      interpretLookup(
        { ...base, txt: err("ETIMEOUT"), cname: err("ENODATA"), hostAddresses: err("ESERVFAIL") },
        expected,
      ),
    ).toEqual({ ownership: "unknown", routing: "unknown" });
  });
});

describe("transições do domínio", () => {
  const pending = {
    status: "PENDING" as const,
    createdAt: new Date(now.getTime() - DAY),
    verifiedAt: null,
  };
  const verified = {
    status: "VERIFIED" as const,
    createdAt: new Date(now.getTime() - 30 * DAY),
    verifiedAt: new Date(now.getTime() - 29 * DAY),
  };

  it("verifica quando os dois registros conferem", () => {
    expect(nextDomainState(pending, { ownership: "ok", routing: "ok" }, now)).toEqual({
      status: "VERIFIED",
      verifiedAt: now,
      lastError: "",
      lost: false,
      gained: true,
    });
  });

  it("continua pendente com explicação dentro de 7 dias", () => {
    const r = nextDomainState(pending, { ownership: "missing", routing: "ok" }, now);
    expect(r.status).toBe("PENDING");
    expect(r.lastError).toContain("TXT");
  });

  it("falha depois de 7 dias sem os registros", () => {
    const old = { ...pending, createdAt: new Date(now.getTime() - 8 * DAY) };
    const r = nextDomainState(old, { ownership: "missing", routing: "missing" }, now);
    expect(r.status).toBe("FAILED");
    expect(r.lastError).toContain("7 dias");
  });

  it("domínio que falhou volta a verificar pelo botão", () => {
    const failed = { ...pending, status: "FAILED" as const };
    expect(nextDomainState(failed, { ownership: "ok", routing: "ok" }, now).status).toBe(
      "VERIFIED",
    );
  });

  it("verificado só reconfere o apontamento (TXT pode ter sido apagado)", () => {
    const r = nextDomainState(verified, { ownership: "missing", routing: "ok" }, now);
    expect(r).toMatchObject({ status: "VERIFIED", lastError: "", lost: false });
    expect(r.verifiedAt).toEqual(verified.verifiedAt);
  });

  it("verificado sem apontamento vira FALHOU e avisa a perda", () => {
    expect(nextDomainState(verified, { ownership: "ok", routing: "missing" }, now)).toMatchObject({
      status: "FAILED",
      lost: true,
    });
    expect(nextDomainState(verified, { ownership: "ok", routing: "elsewhere" }, now)).toMatchObject(
      { status: "FAILED", lost: true },
    );
  });

  it("falha temporária do DNS não derruba domínio verificado", () => {
    const r = nextDomainState(verified, { ownership: "unknown", routing: "unknown" }, now);
    expect(r.status).toBe("VERIFIED");
    expect(r.lost).toBe(false);
    expect(r.lastError).not.toBe("");
  });

  it("agenda a varredura por situação", () => {
    const min = 60_000;
    expect(isDueForCheck({ status: "PENDING", lastCheckedAt: null }, now)).toBe(true);
    expect(
      isDueForCheck({ status: "PENDING", lastCheckedAt: new Date(now.getTime() - 2 * min) }, now),
    ).toBe(false);
    expect(
      isDueForCheck({ status: "PENDING", lastCheckedAt: new Date(now.getTime() - 6 * min) }, now),
    ).toBe(true);
    expect(
      isDueForCheck({ status: "VERIFIED", lastCheckedAt: new Date(now.getTime() - 60 * min) }, now),
    ).toBe(false);
    expect(
      isDueForCheck(
        { status: "VERIFIED", lastCheckedAt: new Date(now.getTime() - 25 * 60 * min) },
        now,
      ),
    ).toBe(true);
    expect(isDueForCheck({ status: "FAILED", lastCheckedAt: null }, now)).toBe(false);
  });
});

describe("pedido de certificado", () => {
  const opts = {
    rootDomain: "mais.tur.br",
    platformHosts: ["360.mais.tur.br"],
    reservedSubdomains: new Set(["www", "api"]),
  };

  it("classifica os hosts", () => {
    expect(classifyTlsHost("360.mais.tur.br", opts)).toEqual({ kind: "platform" });
    expect(classifyTlsHost("mais.tur.br", opts)).toEqual({ kind: "platform" });
    expect(classifyTlsHost("ABIEC.mais.tur.br", opts)).toEqual({
      kind: "tenant-subdomain",
      slug: "abiec",
    });
    expect(classifyTlsHost("eventos.abiec.com.br", opts)).toEqual({
      kind: "custom",
      hostname: "eventos.abiec.com.br",
    });
  });

  it("recusa hosts inválidos, reservados ou aninhados", () => {
    expect(classifyTlsHost("", opts).kind).toBe("invalid");
    expect(classifyTlsHost("www.mais.tur.br", opts).kind).toBe("invalid");
    expect(classifyTlsHost("a.b.mais.tur.br", opts).kind).toBe("invalid");
    expect(classifyTlsHost("bad_host.com", opts).kind).toBe("invalid");
  });
});
