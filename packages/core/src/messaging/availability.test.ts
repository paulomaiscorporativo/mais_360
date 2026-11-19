import { describe, expect, it } from "vitest";
import {
  MESSAGE_FIELDS,
  availableMessageFields,
  fieldUnavailableReason,
  unavailableFieldsIn,
} from "./fields";
import { extractFields } from "./render";

const keys = (scope: Parameters<typeof availableMessageFields>[0]) =>
  availableMessageFields(scope).map((f) => f.key);

describe("variáveis condicionadas a recursos", () => {
  it("projeto sem mapa de mesas não oferece {{mesa}}", () => {
    const k = keys({ modules: ["EVENTS_INVITES"], projectFeatures: ["INVITES"] });
    expect(k).not.toContain("mesa");
    expect(k).toContain("empresa_convidante");
    expect(k).toContain("nome");
  });

  it("projeto com mesas oferece {{mesa}}; sem convites esconde cota, login e data-limite", () => {
    const k = keys({ modules: ["EVENTS_INVITES"], projectFeatures: ["TABLES"] });
    expect(k).toContain("mesa");
    for (const f of ["empresa_convidante", "data_limite", "login", "link_plataforma"])
      expect(k).not.toContain(f);
  });

  it("modelo do cliente (sem projeto) vale pelos módulos contratados", () => {
    expect(keys({ modules: ["EVENTS_INVITES"] })).toContain("mesa");
    expect(keys({ modules: ["GROUP_TRAVEL"] })).not.toContain("mesa");
    expect(keys({ modules: ["CORPORATE_TRAVEL", "COMMUNICATION"] })).toContain("protocolo");
    expect(keys({ modules: [] })).not.toContain("protocolo");
  });

  it("campos sem exigência estão sempre disponíveis", () => {
    const always = MESSAGE_FIELDS.filter((f) => !f.requires).map((f) => f.key);
    expect(keys({ modules: [], projectFeatures: [] })).toEqual(always);
  });

  it("avisa quando o modelo usa variável indisponível, com o motivo", () => {
    const used = extractFields("Olá {{nome}}, sua {{mesa}} · {{login}} · {{inexistente}}");
    const out = unavailableFieldsIn(used, {
      modules: ["EVENTS_INVITES"],
      projectFeatures: ["INVITES"],
    });
    expect(out).toEqual([
      { key: "mesa", label: "Mesa e cadeira", reason: "o projeto não usa mapa de mesas" },
    ]);
    const mesa = MESSAGE_FIELDS.find((f) => f.key === "mesa")!;
    expect(fieldUnavailableReason(mesa, { modules: ["GROUP_TRAVEL"] })).toBe(
      "o cliente não contratou mapa de mesas",
    );
  });
});
