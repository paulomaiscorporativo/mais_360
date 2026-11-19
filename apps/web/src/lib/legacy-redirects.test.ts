import { describe, expect, it } from "vitest";
import { legacyRedirect } from "./legacy-redirects";

describe("redirecionamento dos endereços antigos", () => {
  it("convite e formulário mantêm o token", () => {
    expect(legacyRedirect("/convite/eeed34391c2248b3ceb88e44df2a7c3f")).toBe(
      "/c/eeed34391c2248b3ceb88e44df2a7c3f",
    );
    expect(legacyRedirect("/f/demo-formulario-mallorca/")).toBe("/i/demo-formulario-mallorca");
  });

  it("portal do passageiro e login da empresa", () => {
    expect(legacyRedirect("/portal")).toBe("/v");
    expect(legacyRedirect("/portal/voos")).toBe("/v");
    expect(legacyRedirect("/empresa/login")).toBe("/empresa");
  });

  it("não mexe nas rotas novas nem em caminhos estranhos", () => {
    expect(legacyRedirect("/c/abc")).toBeNull();
    expect(legacyRedirect("/empresa")).toBeNull();
    expect(legacyRedirect("/portalx")).toBeNull();
    expect(legacyRedirect("/convite/../../etc")).toBeNull();
  });
});
