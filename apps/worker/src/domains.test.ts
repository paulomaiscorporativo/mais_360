import { describe, expect, it } from "vitest";
import { interpretLookup } from "@mais/core/domains";
import { domainConfigFromEnv, lookupDomain, type DnsResolver } from "./domains";

const dnsError = (code: string) => Object.assign(new Error(code), { code });

/** Resolvedor falso: tabela por tipo/host; ausente = ENOTFOUND. */
function fakeResolver(zone: {
  txt?: Record<string, string[][]>;
  cname?: Record<string, string[]>;
  a?: Record<string, string[]>;
  aaaa?: Record<string, string[]>;
  fail?: string;
}): DnsResolver {
  const get = <T>(table: Record<string, T> | undefined, host: string) =>
    zone.fail
      ? Promise.reject(dnsError(zone.fail))
      : table?.[host] !== undefined
        ? Promise.resolve(table[host] as T)
        : Promise.reject(dnsError("ENOTFOUND"));
  return {
    resolveTxt: (h) => get(zone.txt, h),
    resolveCname: (h) => get(zone.cname, h),
    resolve4: (h) => get(zone.a, h),
    resolve6: (h) => get(zone.aaaa, h),
  };
}

const target = "clientes.mais.tur.br";
const expected = { token: "tok", target };

describe("consulta de DNS do domínio", () => {
  it("monta a consulta e confere CNAME + TXT", async () => {
    const r = fakeResolver({
      txt: { "_mais360.eventos.cliente.com.br": [["mais360-verificacao=tok"]] },
      cname: { "eventos.cliente.com.br": ["clientes.mais.tur.br"] },
      a: { "eventos.cliente.com.br": ["203.0.113.5"], [target]: ["203.0.113.5"] },
    });
    const lookup = await lookupDomain(r, "eventos.cliente.com.br", target);
    expect(lookup.hostAddresses).toEqual({ ok: true, value: ["203.0.113.5"] });
    expect(interpretLookup(lookup, expected)).toEqual({ ownership: "ok", routing: "ok" });
  });

  it("junta IPv4 e IPv6 e aceita domínio raiz com ALIAS", async () => {
    const r = fakeResolver({
      txt: { "_mais360.cliente.com": [["mais360-verificacao=tok"]] },
      a: { "cliente.com": ["203.0.113.5"], [target]: ["203.0.113.5"] },
      aaaa: { [target]: ["2001:db8::1"] },
    });
    const lookup = await lookupDomain(r, "cliente.com", target);
    expect(lookup.targetAddresses).toEqual({ ok: true, value: ["203.0.113.5", "2001:db8::1"] });
    expect(interpretLookup(lookup, expected).routing).toBe("ok");
  });

  it("propaga o código de erro do resolvedor (falha temporária)", async () => {
    const lookup = await lookupDomain(fakeResolver({ fail: "ETIMEOUT" }), "x.cliente.com", target);
    expect(lookup.txt).toEqual({ ok: false, code: "ETIMEOUT" });
    expect(interpretLookup(lookup, expected)).toEqual({ ownership: "unknown", routing: "unknown" });
  });

  it("lê a configuração do ambiente", () => {
    expect(domainConfigFromEnv({ ROOT_DOMAIN: "mais.tur.br" })).toEqual({
      target: "clientes.mais.tur.br",
      platformDomains: ["mais.tur.br"],
    });
    expect(
      domainConfigFromEnv({ ROOT_DOMAIN: "localhost", CUSTOM_DOMAIN_TARGET: "edge.exemplo.com" }),
    ).toEqual({ target: "edge.exemplo.com", platformDomains: ["localhost", "mais.tur.br"] });
  });
});
