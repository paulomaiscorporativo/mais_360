import "server-only";
import type { ProjectFeature } from "@mais/core";
import {
  availableSortOptions,
  companyOf,
  describeSortSpec,
  effectiveSortSpec,
  readSortingSettings,
  type SortAvailability,
  type SortRow,
  type SortSpec,
  type SortSource,
  SORT_SOURCE_LABELS,
} from "@mais/core/sorting";
import type { Prisma } from "@mais/db";
import type { TenantDb } from "./tenant-db";

/**
 * ORDENAÇÃO DAS LISTAS EM LOTE (relatórios, CSV, documentos, check-in,
 * vouchers, rooming). A regra é pura (`@mais/core/sorting`); aqui só se lê o
 * que existe no projeto e as configurações em cascata (cliente → projeto).
 */

/** Inclusão mínima para montar a linha de ordenação de uma inscrição. */
export const SORT_ROW_INCLUDE = {
  person: {
    select: {
      firstName: true,
      lastName: true,
      badgeName: true,
      organizations: {
        select: { primary: true, organization: { select: { name: true } } },
      },
    },
  },
  category: { select: { name: true, sortOrder: true } },
  group: { select: { name: true } },
  seat: { select: { seat: true, table: { select: { number: true, name: true } } } },
  invite: { select: { companyQuota: { select: { companyName: true } } } },
} satisfies Prisma.RegistrationInclude;

export type SortableRegistration = Prisma.RegistrationGetPayload<{
  include: typeof SORT_ROW_INCLUDE;
}>;

/** Linha normalizada de uma inscrição (o mesmo formato para todas as saídas). */
export function toSortRow(r: SortableRegistration): SortRow {
  const p = r.person;
  const org = p.organizations.find((o) => o.primary) ?? p.organizations[0];
  return {
    id: r.id,
    fullName: `${p.firstName} ${p.lastName}`.trim(),
    badgeName: p.badgeName,
    lastName: p.lastName,
    company: companyOf(r.displayCompany, org?.organization.name),
    inviter: r.invite?.companyQuota?.companyName ?? "",
    category: r.category?.name ?? "",
    categoryOrder: r.category?.sortOrder ?? null,
    group: r.group?.name ?? "",
    table: r.seat?.table.number ?? null,
    tableLabel: r.seat ? r.seat.table.name || `Mesa ${r.seat.table.number}` : "",
    seat: r.seat?.seat ?? null,
    status: r.status,
    shortCode: r.shortCode,
    createdAt: r.createdAt,
    custom: customFieldsOf(r.customFields),
  };
}

function customFieldsOf(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>))
    if (typeof v === "string" || typeof v === "number") out[k] = String(v);
  return out;
}

/** Linhas de ordenação de várias inscrições do projeto, por id. */
export async function sortRowsOf(db: TenantDb, projectId: string, ids?: string[]) {
  const regs = await db.registration.findMany({
    where: { projectId, ...(ids ? { id: { in: ids } } : {}) },
    include: SORT_ROW_INCLUDE,
  });
  return new Map(regs.map((r) => [r.id, toSortRow(r)]));
}

/** O que existe no projeto para ordenar (recursos, categorias, grupos, campos livres). */
export async function sortAvailability(
  db: TenantDb,
  projectId: string,
  features: Iterable<ProjectFeature>,
): Promise<SortAvailability> {
  const [categories, groups, sample] = await Promise.all([
    db.registrationCategory.count({ where: { projectId } }),
    db.projectGroup.count({ where: { projectId } }),
    db.registration.findMany({
      where: { projectId, NOT: { customFields: { equals: {} } } },
      select: { customFields: true },
      take: 300,
    }),
  ]);
  const customFields: Record<string, string> = {};
  for (const r of sample)
    for (const k of Object.keys(customFieldsOf(r.customFields)))
      if (/^[A-Za-z0-9_.-]{1,60}$/.test(k)) customFields[k] = k;
  return {
    features: [...features],
    hasCategories: categories > 0,
    hasGroups: groups > 0,
    customFields,
  };
}

export type ProjectSorting = {
  spec: SortSpec;
  warnings: string[];
  source: SortSource;
  label: string;
  /** Padrão efetivo sem a escolha na hora (o que a tela pré-preenche). */
  defaultSpec: SortSpec;
  options: ReturnType<typeof availableSortOptions>;
  customLabels: Record<string, string>;
};

/**
 * Ordenação efetiva de um projeto: escolha na hora (`override`, ex. `?ordem=`)
 * → padrão do projeto → padrão do cliente → padrão da plataforma, ajustada
 * aos recursos ligados.
 */
export async function projectSorting(
  p: {
    db: TenantDb;
    projectId: string;
    features: Iterable<ProjectFeature>;
    project: { settings: unknown };
    tenant: { settings: unknown };
  },
  override?: unknown,
): Promise<ProjectSorting> {
  const availability = await sortAvailability(p.db, p.projectId, p.features);
  const inherited = {
    project: readSortingSettings(p.project.settings),
    tenant: readSortingSettings(p.tenant.settings),
    availability,
  };
  const eff = effectiveSortSpec({ ...inherited, override });
  const base = override ? effectiveSortSpec(inherited) : eff;
  const customLabels = availability.customFields ?? {};
  return {
    spec: eff.spec,
    warnings: eff.warnings,
    source: eff.source,
    label: describeSortSpec(eff.spec, customLabels),
    defaultSpec: base.spec,
    options: availableSortOptions(availability),
    customLabels,
  };
}

/** Dados da seção "Ordenação das listas" das configurações do projeto. */
export async function projectSortingSettings(p: Parameters<typeof projectSorting>[0]) {
  const availability = await sortAvailability(p.db, p.projectId, p.features);
  const inherited = effectiveSortSpec({
    tenant: readSortingSettings(p.tenant.settings),
    availability,
  });
  const regs = await p.db.registration.findMany({
    where: { projectId: p.projectId, status: { not: "CANCELED" } },
    include: SORT_ROW_INCLUDE,
    orderBy: { createdAt: "asc" },
    take: 60,
  });
  return {
    own: readSortingSettings(p.project.settings),
    inherited: inherited.spec,
    inheritedFrom: inherited.source === "tenant" ? "Padrão do cliente" : "Padrão da plataforma",
    inheritedWarnings: inherited.warnings,
    options: availableSortOptions(availability),
    customLabels: availability.customFields ?? {},
    sample: regs.map(toSortRow),
  };
}

/** Props da barra de geração em lote (`BatchSortBar`), já com o padrão efetivo. */
export async function batchSortProps(p: Parameters<typeof projectSorting>[0]) {
  const [s, regs] = await Promise.all([
    projectSorting(p),
    p.db.registration.findMany({
      where: { projectId: p.projectId, status: { not: "CANCELED" } },
      include: SORT_ROW_INCLUDE,
      orderBy: { createdAt: "asc" },
      take: 60,
    }),
  ]);
  return {
    defaultSpec: s.spec,
    sourceLabel: SORT_SOURCE_LABELS[s.source],
    warnings: s.warnings,
    options: s.options,
    customLabels: s.customLabels,
    sample: regs.map(toSortRow),
  };
}

/** Ordenação de uma saída em lote a partir do `?ordem=` da URL. */
export function sortParam(url: URL | URLSearchParams): string | undefined {
  const params = url instanceof URL ? url.searchParams : url;
  return params.get("ordem") ?? undefined;
}
