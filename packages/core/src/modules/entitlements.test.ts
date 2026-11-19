import { describe, expect, it } from "vitest";
import {
  activeTenantModules,
  availableProjectFeatures,
  enabledProjectFeatures,
  validateTenantGrant,
  withDependencies,
  workspaceModules,
} from "./entitlements";
import type { ModuleKey } from "./catalog";

const ALL: ModuleKey[] = [
  "COMMUNICATION",
  "DOCUMENTS",
  "EVENTS_INVITES",
  "ACCREDITATION",
  "SELF_SERVICE_KIOSK",
];
const plan = workspaceModules(ALL);
const grant = (module: ModuleKey, extra: Partial<{ enabled: boolean; validUntil: Date }> = {}) => ({
  module,
  enabled: true,
  ...extra,
});

describe("withDependencies", () => {
  it("traz as dependências transitivas", () => {
    expect(withDependencies(["SELF_SERVICE_KIOSK"])).toEqual(
      new Set(["SELF_SERVICE_KIOSK", "ACCREDITATION", "COMMUNICATION", "DOCUMENTS"]),
    );
  });
});

describe("activeTenantModules", () => {
  it("cliente só de convites e credenciamento recebe exatamente isso", () => {
    const active = activeTenantModules(
      ["COMMUNICATION", "DOCUMENTS", "EVENTS_INVITES", "ACCREDITATION"].map((m) =>
        grant(m as ModuleKey),
      ),
      plan,
    );
    expect(active).toEqual(
      new Set(["COMMUNICATION", "DOCUMENTS", "EVENTS_INVITES", "ACCREDITATION"]),
    );
    expect(active.has("CORPORATE_TRAVEL")).toBe(false);
  });

  it("ignora módulo fora do plano do assinante", () => {
    const active = activeTenantModules([grant("COMMUNICATION"), grant("FINANCE")], plan);
    expect(active).toEqual(new Set(["COMMUNICATION"]));
  });

  it("vencimento de uma dependência desliga em cascata", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    const active = activeTenantModules(
      [
        grant("COMMUNICATION", { validUntil: new Date("2026-11-01T00:00:00Z") }),
        grant("DOCUMENTS"),
        grant("ACCREDITATION"),
        grant("SELF_SERVICE_KIOSK"),
      ],
      plan,
      now,
    );
    expect(active).toEqual(new Set(["DOCUMENTS"]));
  });

  it("concessão desligada não conta", () => {
    expect(activeTenantModules([grant("COMMUNICATION", { enabled: false })], plan).size).toBe(0);
  });
});

describe("validateTenantGrant", () => {
  it("aponta dependência ausente e módulo fora do plano", () => {
    expect(validateTenantGrant(["EVENTS_INVITES", "FINANCE"], plan)).toEqual([
      { kind: "MISSING_DEPENDENCY", module: "EVENTS_INVITES", requires: "COMMUNICATION" },
      { kind: "NOT_IN_PLAN", module: "FINANCE" },
    ]);
  });
});

describe("recursos de projeto", () => {
  const active = new Set<ModuleKey>(["COMMUNICATION", "EVENTS_INVITES"]);

  it("libera só os recursos dos módulos ativos", () => {
    const f = availableProjectFeatures(active);
    expect(f.has("INVITES")).toBe(true);
    expect(f.has("FACE_RECOGNITION")).toBe(false);
  });

  it("toggle de recurso não contratado é ignorado", () => {
    const f = enabledProjectFeatures(
      [
        { feature: "INVITES", enabled: true },
        { feature: "FACE_RECOGNITION", enabled: true },
        { feature: "TABLES", enabled: false },
      ],
      active,
    );
    expect(f).toEqual(new Set(["INVITES"]));
  });
});
