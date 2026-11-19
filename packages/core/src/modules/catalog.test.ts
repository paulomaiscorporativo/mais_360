import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MODULE_KEYS, MODULES, PROJECT_FEATURES } from "./catalog";

// O core não importa o Prisma; este teste garante que os enums não divergem.
function prismaEnum(name: string): string[] {
  const file = fileURLToPath(new URL("../../../db/prisma/schema/core.prisma", import.meta.url));
  const src = readFileSync(file, "utf8");
  const body = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(src)?.[1] ?? "";
  return body
    .split("\n")
    .map((l) => l.replace(/\/\/.*/, "").trim())
    .filter(Boolean);
}

describe("catálogo de módulos", () => {
  it("espelha o enum ModuleKey do banco", () => {
    expect([...MODULE_KEYS].sort()).toEqual(prismaEnum("ModuleKey").sort());
  });

  it("espelha o enum ProjectFeature do banco", () => {
    expect([...PROJECT_FEATURES].sort()).toEqual(prismaEnum("ProjectFeature").sort());
  });

  it("não tem dependência circular nem para módulo inexistente", () => {
    const visiting = new Set<string>();
    const walk = (k: (typeof MODULE_KEYS)[number]) => {
      expect(visiting.has(k), `ciclo em ${k}`).toBe(false);
      visiting.add(k);
      for (const d of MODULES[k].requires) walk(d);
      visiting.delete(k);
    };
    MODULE_KEYS.forEach(walk);
  });
});
