import { MODULES, type ModuleKey, type ProjectFeature } from "./catalog";

/**
 * Resolução de acesso em três níveis:
 *
 *   plano do assinante (+ add-ons)  ⊇  módulos liberados ao cliente  →  recursos do projeto
 *
 * Nenhum nível pode conceder o que o nível acima não tem. Toda checagem de
 * permissão de módulo na aplicação passa por estas funções — nunca por
 * comparação solta em tela.
 */

export type TenantModuleGrant = {
  module: ModuleKey;
  enabled: boolean;
  validFrom?: Date | null;
  validUntil?: Date | null;
};

export type ModuleIssue =
  | { kind: "NOT_IN_PLAN"; module: ModuleKey }
  | { kind: "MISSING_DEPENDENCY"; module: ModuleKey; requires: ModuleKey };

/** Fecho transitivo de dependências: liberar Autoatendimento traz Credenciamento, Comunicação… */
export function withDependencies(modules: Iterable<ModuleKey>): Set<ModuleKey> {
  const out = new Set<ModuleKey>();
  const visit = (m: ModuleKey) => {
    if (out.has(m)) return;
    out.add(m);
    for (const dep of MODULES[m].requires) visit(dep);
  };
  for (const m of modules) visit(m);
  return out;
}

/** Módulos que o assinante pode usar ou revender: plano + add-ons. */
export function workspaceModules(
  planModules: readonly ModuleKey[],
  extraModules: readonly ModuleKey[] = [],
): Set<ModuleKey> {
  return new Set([...planModules, ...extraModules]);
}

function grantIsActive(g: TenantModuleGrant, now: Date): boolean {
  if (!g.enabled) return false;
  if (g.validFrom && g.validFrom > now) return false;
  if (g.validUntil && g.validUntil <= now) return false;
  return true;
}

/**
 * Módulos efetivamente ativos de um cliente agora: concedidos, vigentes,
 * cobertos pelo plano do assinante e com as dependências satisfeitas.
 */
export function activeTenantModules(
  grants: readonly TenantModuleGrant[],
  allowedByWorkspace: ReadonlySet<ModuleKey>,
  now: Date = new Date(),
): Set<ModuleKey> {
  const granted = new Set(
    grants
      .filter((g) => grantIsActive(g, now) && allowedByWorkspace.has(g.module))
      .map((g) => g.module),
  );
  // Remove em cascata o que ficou sem dependência (ex.: Comunicação vencida
  // desliga Convites). Repete até estabilizar.
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of granted) {
      if (MODULES[m].requires.some((dep) => !granted.has(dep))) {
        granted.delete(m);
        changed = true;
      }
    }
  }
  return granted;
}

/**
 * Valida uma concessão de módulos ao cliente antes de gravar. Devolve os
 * problemas para a tela explicar ao usuário, em vez de falhar em silêncio.
 */
export function validateTenantGrant(
  requested: readonly ModuleKey[],
  allowedByWorkspace: ReadonlySet<ModuleKey>,
): ModuleIssue[] {
  const issues: ModuleIssue[] = [];
  const set = new Set(requested);
  for (const m of set) {
    if (!allowedByWorkspace.has(m)) issues.push({ kind: "NOT_IN_PLAN", module: m });
    for (const dep of MODULES[m].requires) {
      if (!set.has(dep)) issues.push({ kind: "MISSING_DEPENDENCY", module: m, requires: dep });
    }
  }
  return issues;
}

/** Recursos que um projeto pode ligar, dados os módulos ativos do cliente. */
export function availableProjectFeatures(active: ReadonlySet<ModuleKey>): Set<ProjectFeature> {
  const out = new Set<ProjectFeature>();
  for (const m of active) for (const f of MODULES[m].features) out.add(f);
  return out;
}

/** Recursos efetivamente ligados num projeto (o toggle do projeto ∩ o disponível). */
export function enabledProjectFeatures(
  toggles: readonly { feature: ProjectFeature; enabled: boolean }[],
  active: ReadonlySet<ModuleKey>,
): Set<ProjectFeature> {
  const available = availableProjectFeatures(active);
  return new Set(toggles.filter((t) => t.enabled && available.has(t.feature)).map((t) => t.feature));
}
