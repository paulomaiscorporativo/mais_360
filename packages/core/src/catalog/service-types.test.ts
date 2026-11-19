import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SERVICE_CATEGORIES,
  SERVICE_TYPE_KEYS,
  SERVICE_TYPES,
  parseServiceDetails,
  serviceTypesByCategory,
} from "./service-types";
import { deriveTravelRequestKind, parseTravelRequestServices } from "./travel-request-services";

function prismaEnum(file: string, name: string): string[] {
  const path = fileURLToPath(new URL(`../../../db/prisma/schema/${file}`, import.meta.url));
  const body = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(readFileSync(path, "utf8"))?.[1] ?? "";
  return body
    .split("\n")
    .map((l) => l.replace(/\/\/.*/, "").trim())
    .filter(Boolean);
}

describe("catálogo de tipos de serviço", () => {
  it("espelha o enum ServiceType do banco", () => {
    expect([...SERVICE_TYPE_KEYS].sort()).toEqual(prismaEnum("catalog.prisma", "ServiceType").sort());
  });

  it("espelha o enum ServiceCategory do banco", () => {
    expect([...SERVICE_CATEGORIES].sort()).toEqual(prismaEnum("catalog.prisma", "ServiceCategory").sort());
  });

  it("todo tipo tem rótulo e pertence a uma categoria", () => {
    const grouped = serviceTypesByCategory();
    expect(Object.values(grouped).flat().sort()).toEqual([...SERVICE_TYPE_KEYS].sort());
    for (const key of SERVICE_TYPE_KEYS) expect(SERVICE_TYPES[key].label.length).toBeGreaterThan(2);
  });
});

describe("parseServiceDetails", () => {
  it("aceita um aéreo válido e normaliza IATA", () => {
    const r = parseServiceDetails("AIR", {
      legs: [{ airlineCode: "la", flightNumber: "8065", origin: "gru", destination: "mad" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const legs = r.data.legs as { origin: string; cabin: string }[];
      expect(legs[0]?.origin).toBe("GRU");
      expect(legs[0]?.cabin).toBe("ECONOMY");
    }
  });

  it("recusa aéreo sem trecho com mensagem em português", () => {
    const r = parseServiceDetails("AIR", { legs: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Informe ao menos um trecho");
  });

  it("exige datas de hospedagem", () => {
    expect(parseServiceDetails("HOTEL", { city: "Madri" }).ok).toBe(false);
    expect(parseServiceDetails("HOTEL", { checkIn: "2026-12-01", checkOut: "2026-12-04" }).ok).toBe(true);
  });

  it("item livre aceita qualquer objeto", () => {
    expect(parseServiceDetails("CUSTOM", { qualquer: 1 }).ok).toBe(true);
  });
});

describe("serviços da solicitação de viagem", () => {
  it("guarda só os blocos ativados", () => {
    const r = parseTravelRequestServices(["AIR"], { AIR: { cabin: "BUSINESS" }, HOTEL: { rooms: 3 } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.details.AIR?.cabin).toBe("BUSINESS");
      expect(r.details.HOTEL).toBeUndefined();
    }
  });

  it("recusa saída do hotel antes da entrada", () => {
    const r = parseTravelRequestServices(["HOTEL"], {
      HOTEL: { checkIn: "2026-12-05", checkOut: "2026-12-01" },
    });
    expect(r.ok).toBe(false);
  });

  it("recusa serviço desconhecido e lista vazia", () => {
    expect(parseTravelRequestServices(["TELEPORTE"], {}).ok).toBe(false);
    expect(parseTravelRequestServices([], {}).ok).toBe(false);
  });

  it("deduz o tipo da solicitação", () => {
    expect(deriveTravelRequestKind(["AIR", "HOTEL"])).toBe("PACKAGE");
    expect(deriveTravelRequestKind(["HOTEL"])).toBe("HOTEL");
    expect(deriveTravelRequestKind(["AIR", "EVENT_TICKET"])).toBe("EVENT");
    expect(deriveTravelRequestKind(["TRANSFER"])).toBe("OTHER");
  });
});
