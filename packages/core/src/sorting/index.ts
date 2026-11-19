import { z } from "zod";
import type { ProjectFeature } from "../modules/catalog";

/**
 * ORDENAÇÃO CONFIGURÁVEL DAS LISTAS DE INSCRIÇÕES.
 *
 * Cada cliente pode querer outra ordem nos relatórios, etiquetas, credenciais e
 * listas de check-in. A ordem é DADO (um `SortSpec` guardado nas configurações),
 * nunca código por cliente. Cascata: padrão da plataforma → padrão do cliente →
 * padrão do projeto → escolha na hora de gerar.
 *
 * Tudo aqui é puro: recebe linhas já normalizadas (`SortRow`) e devolve a ordem.
 */

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

export const SORT_FIELDS = [
  "company",
  "inviter",
  "fullName",
  "badgeName",
  "lastName",
  "category",
  "group",
  "seat",
  "status",
  "shortCode",
  "createdAt",
] as const;

export type BuiltinSortField = (typeof SORT_FIELDS)[number];
/** Campo personalizado do cliente (`Registration.customFields`), por chave. */
export type CustomSortField = `custom:${string}`;
export type SortField = BuiltinSortField | CustomSortField;

export const SORT_FIELD_LABELS: Record<BuiltinSortField, string> = {
  company: "Empresa",
  inviter: "Empresa da cota",
  fullName: "Nome completo",
  badgeName: "Nome do crachá",
  lastName: "Sobrenome",
  category: "Categoria",
  group: "Grupo",
  seat: "Mesa e cadeira",
  status: "Status",
  shortCode: "Código curto",
  createdAt: "Data da inscrição",
};

/** Recurso de projeto que o campo exige (sem ele o nível é descartado). */
const FIELD_FEATURE: Partial<Record<BuiltinSortField, ProjectFeature>> = {
  seat: "TABLES",
  inviter: "INVITES",
};

const CUSTOM_PREFIX = "custom:";
const CUSTOM_KEY_RE = /^[A-Za-z0-9_.-]{1,60}$/;

export const isCustomField = (f: string): f is CustomSortField =>
  f.startsWith(CUSTOM_PREFIX) && CUSTOM_KEY_RE.test(f.slice(CUSTOM_PREFIX.length));

export const customFieldKey = (f: CustomSortField) => f.slice(CUSTOM_PREFIX.length);
export const customSortField = (key: string): CustomSortField => `custom:${key}`;

/** Rótulo em português de um campo (campos personalizados pelo rótulo do cliente, se houver). */
export function sortFieldLabel(field: SortField, customLabels?: Record<string, string>): string {
  if (isCustomField(field)) {
    const key = customFieldKey(field);
    return customLabels?.[key] || key;
  }
  return SORT_FIELD_LABELS[field];
}

// ---------------------------------------------------------------------------
// Esquema
// ---------------------------------------------------------------------------

export const sortFieldSchema = z.custom<SortField>(
  (v) =>
    typeof v === "string" && ((SORT_FIELDS as readonly string[]).includes(v) || isCustomField(v)),
  { message: "Campo de ordenação desconhecido." },
);

export const sortLevelSchema = z.object({
  field: sortFieldSchema,
  direction: z.enum(["asc", "desc"]).default("asc"),
});

export const MAX_SORT_LEVELS = 3;

export const sortSpecSchema = z.object({
  levels: z
    .array(sortLevelSchema)
    .min(1, "Escolha ao menos um critério.")
    .max(MAX_SORT_LEVELS, `Use no máximo ${MAX_SORT_LEVELS} critérios.`),
  groupBy: sortFieldSchema.nullable().default(null),
  pageBreakPerGroup: z.boolean().default(false),
});

export type SortLevel = z.infer<typeof sortLevelSchema>;
export type SortSpec = z.infer<typeof sortSpecSchema>;
export type SortDirection = SortLevel["direction"];

/** Lê um SortSpec tolerando lixo: inválido → null. */
export function parseSortSpec(raw: unknown): SortSpec | null {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const r = sortSpecSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Forma compacta para levar na URL (`?ordem=`). */
export const encodeSortSpec = (spec: SortSpec) => JSON.stringify(spec);

/** Lê `settings.sorting` (Tenant ou Project). Ausente ou inválido → null (herda). */
export function readSortingSettings(settings: unknown): SortSpec | null {
  if (!settings || typeof settings !== "object") return null;
  return parseSortSpec((settings as Record<string, unknown>).sorting ?? null);
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const SORT_PRESET_IDS = [
  "company_name",
  "name",
  "seat",
  "category_company_name",
  "created",
] as const;

export type SortPresetId = (typeof SORT_PRESET_IDS)[number];

export type SortPreset = { id: SortPresetId; label: string; spec: SortSpec };

export const SORT_PRESETS: readonly SortPreset[] = [
  {
    id: "company_name",
    label: "Empresa › nome",
    spec: {
      levels: [
        { field: "company", direction: "asc" },
        { field: "fullName", direction: "asc" },
      ],
      groupBy: null,
      pageBreakPerGroup: false,
    },
  },
  {
    id: "name",
    label: "Nome",
    spec: {
      levels: [{ field: "fullName", direction: "asc" }],
      groupBy: null,
      pageBreakPerGroup: false,
    },
  },
  {
    id: "seat",
    label: "Mesa › cadeira",
    spec: {
      levels: [{ field: "seat", direction: "asc" }],
      groupBy: null,
      pageBreakPerGroup: false,
    },
  },
  {
    id: "category_company_name",
    label: "Categoria › empresa › nome",
    spec: {
      levels: [
        { field: "category", direction: "asc" },
        { field: "company", direction: "asc" },
        { field: "fullName", direction: "asc" },
      ],
      groupBy: null,
      pageBreakPerGroup: false,
    },
  },
  {
    id: "created",
    label: "Ordem de inscrição",
    spec: {
      levels: [{ field: "createdAt", direction: "asc" }],
      groupBy: null,
      pageBreakPerGroup: false,
    },
  },
];

const clone = (s: SortSpec): SortSpec => ({
  levels: s.levels.map((l) => ({ ...l })),
  groupBy: s.groupBy,
  pageBreakPerGroup: s.pageBreakPerGroup,
});

/** Padrão da plataforma: empresa e, dentro dela, nome (como no sistema de convites). */
export const PLATFORM_DEFAULT_SORT: SortSpec = clone(SORT_PRESETS[0]!.spec);

export function presetSpec(id: SortPresetId): SortSpec {
  return clone((SORT_PRESETS.find((p) => p.id === id) ?? SORT_PRESETS[0]!).spec);
}

const sameSpec = (a: SortSpec, b: SortSpec) =>
  a.groupBy === b.groupBy &&
  a.pageBreakPerGroup === b.pageBreakPerGroup &&
  a.levels.length === b.levels.length &&
  a.levels.every(
    (l, i) => l.field === b.levels[i]?.field && l.direction === b.levels[i]?.direction,
  );

/** Preset idêntico ao spec (para a tela marcar a opção), ou null = personalizado. */
export function matchPreset(spec: SortSpec): SortPresetId | null {
  return SORT_PRESETS.find((p) => sameSpec(p.spec, spec))?.id ?? null;
}

/** "Empresa › Nome completo (Z→A)" — para avisos, cabeçalhos e auditoria. */
export function describeSortSpec(spec: SortSpec, customLabels?: Record<string, string>): string {
  const preset = matchPreset(spec);
  if (preset) return SORT_PRESETS.find((p) => p.id === preset)!.label;
  const levels = spec.levels
    .map(
      (l) =>
        `${sortFieldLabel(l.field, customLabels)}${l.direction === "desc" ? " (decrescente)" : ""}`,
    )
    .join(" › ");
  return spec.groupBy
    ? `${levels}, agrupado por ${sortFieldLabel(spec.groupBy, customLabels).toLowerCase()}`
    : levels;
}

// ---------------------------------------------------------------------------
// Recursos do projeto
// ---------------------------------------------------------------------------

/** O que existe no projeto para ordenar. */
export type SortAvailability = {
  features: Iterable<ProjectFeature>;
  /** O projeto tem categorias cadastradas. */
  hasCategories: boolean;
  /** O projeto tem grupos cadastrados. */
  hasGroups: boolean;
  /** Chaves de campos personalizados conhecidos (rótulo opcional). */
  customFields?: Record<string, string>;
};

/** Por que um campo não está disponível (null = disponível). */
export function unavailableReason(field: SortField, a: SortAvailability): string | null {
  if (isCustomField(field)) {
    if (!a.customFields) return null;
    return customFieldKey(field) in a.customFields
      ? null
      : "este campo personalizado não existe neste projeto";
  }
  const feature = FIELD_FEATURE[field];
  if (feature && !new Set(a.features).has(feature))
    return feature === "TABLES"
      ? "este projeto não usa mapa de mesas"
      : "este projeto não usa convites com cota";
  if (field === "category" && !a.hasCategories) return "este projeto não tem categorias";
  if (field === "group" && !a.hasGroups) return "este projeto não tem grupos";
  return null;
}

export type ResolvedSort = {
  spec: SortSpec;
  /** Avisos em português para mostrar na tela de geração. */
  warnings: string[];
  /** Campos descartados por indisponibilidade. */
  dropped: SortField[];
};

/**
 * Ajusta o spec aos recursos do projeto: níveis com campo indisponível são
 * descartados e o restante vale ("Mesa › empresa › nome" sem mapa de mesas vira
 * "Empresa › nome"). Sem nenhum nível sobrando, usa o padrão da plataforma.
 */
export function resolveSortSpec(spec: SortSpec, a: SortAvailability): ResolvedSort {
  const warnings: string[] = [];
  const dropped: SortField[] = [];
  const labels = a.customFields;
  const seen = new Set<SortField>();
  const levels: SortLevel[] = [];
  for (const l of spec.levels) {
    if (seen.has(l.field)) continue;
    seen.add(l.field);
    const why = unavailableReason(l.field, a);
    if (why) {
      dropped.push(l.field);
      warnings.push(`“${sortFieldLabel(l.field, labels)}” foi ignorado: ${why}.`);
    } else levels.push({ ...l });
  }

  let groupBy = spec.groupBy;
  if (groupBy) {
    const why = unavailableReason(groupBy, a);
    if (why) {
      if (!dropped.includes(groupBy)) dropped.push(groupBy);
      warnings.push(`O agrupamento por “${sortFieldLabel(groupBy, labels)}” foi ignorado: ${why}.`);
      groupBy = null;
    }
  }

  if (!levels.length) {
    const fallback = resolveSortSpec(PLATFORM_DEFAULT_SORT, a).spec;
    levels.push(...fallback.levels);
    warnings.push(
      `Nenhum critério da ordenação vale para este projeto; usamos “${describeSortSpec(fallback)}”.`,
    );
  }

  return {
    spec: { levels, groupBy, pageBreakPerGroup: groupBy ? spec.pageBreakPerGroup : false },
    warnings,
    dropped,
  };
}

/** Campos e presets que fazem sentido no projeto (presets com recurso ausente nem aparecem). */
export function availableSortOptions(a: SortAvailability) {
  const builtin = SORT_FIELDS.filter((f) => !unavailableReason(f, a));
  const custom = Object.keys(a.customFields ?? {}).map(customSortField);
  const fields = [...builtin, ...custom].map((value) => ({
    value,
    label: sortFieldLabel(value, a.customFields),
  }));
  const presets = SORT_PRESETS.filter((p) =>
    p.spec.levels.every((l) => !unavailableReason(l.field, a)),
  ).map((p) => ({ id: p.id, label: p.label, spec: clone(p.spec) }));
  return { fields, presets };
}

export type SortSource = "override" | "project" | "tenant" | "platform";

export const SORT_SOURCE_LABELS: Record<SortSource, string> = {
  override: "escolhida agora",
  project: "padrão do projeto",
  tenant: "padrão do cliente",
  platform: "padrão da plataforma",
};

/**
 * Cascata: escolha na hora → projeto → cliente → plataforma. Cada nível pode
 * vir cru (Json/URL); o primeiro válido vence. Depois ajusta aos recursos.
 */
export function effectiveSortSpec(opts: {
  override?: unknown;
  project?: unknown;
  tenant?: unknown;
  availability: SortAvailability;
}): ResolvedSort & { source: SortSource } {
  const candidates: [SortSource, unknown][] = [
    ["override", opts.override],
    ["project", opts.project],
    ["tenant", opts.tenant],
  ];
  for (const [source, raw] of candidates) {
    if (raw === undefined || raw === null || raw === "") continue;
    const spec = parseSortSpec(raw);
    if (spec) return { ...resolveSortSpec(spec, opts.availability), source };
  }
  return { ...resolveSortSpec(PLATFORM_DEFAULT_SORT, opts.availability), source: "platform" };
}

// ---------------------------------------------------------------------------
// Linha normalizada e comparação
// ---------------------------------------------------------------------------

/** Inscrição pronta para ordenar — o servidor monta a partir do banco. */
export type SortRow = {
  id: string;
  fullName: string;
  badgeName?: string;
  lastName?: string;
  /** Empresa exibida (displayCompany, com volta para a empresa do cadastro — ver `companyOf`). */
  company?: string;
  /** Empresa da cota que convidou (convites). */
  inviter?: string;
  category?: string;
  /** Posição da categoria definida pelo cliente (vence o nome). */
  categoryOrder?: number | null;
  group?: string;
  table?: number | null;
  /** Nome da mesa, quando houver (só para o rótulo do grupo). */
  tableLabel?: string;
  seat?: number | null;
  status?: string;
  shortCode?: string;
  createdAt?: Date | string | null;
  custom?: Record<string, unknown>;
};

/** Empresa exibida no crachá, com volta para a empresa do cadastro. */
export function companyOf(displayCompany: string | null | undefined, organization?: string | null) {
  return (displayCompany ?? "").trim() || (organization ?? "").trim();
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Ordem natural dos status (o ciclo da inscrição). */
const STATUS_ORDER = ["PENDING", "INVITED", "CONFIRMED", "WAITLIST", "DECLINED", "CANCELED"];

type Key = { kind: "text"; v: string } | { kind: "num"; v: number[] } | null;

const text = (s: unknown): Key => {
  const v = s === null || s === undefined ? "" : String(s).trim();
  return v ? { kind: "text", v } : null;
};

function keyOf(row: SortRow, field: SortField): Key {
  if (isCustomField(field)) return text(row.custom?.[customFieldKey(field)]);
  switch (field) {
    case "company":
      return text(row.company);
    case "inviter":
      return text(row.inviter);
    case "fullName":
      return text(row.fullName);
    case "badgeName":
      return text(row.badgeName || row.fullName);
    case "lastName":
      return text(row.lastName);
    case "category":
      if (!text(row.category)) return null;
      return row.categoryOrder != null
        ? { kind: "num", v: [row.categoryOrder] }
        : text(row.category);
    case "group":
      return text(row.group);
    case "seat":
      // Mesa, depois cadeira (cadeira vazia fica no fim da mesa)
      return row.table != null
        ? { kind: "num", v: [row.table, row.seat ?? Number.MAX_SAFE_INTEGER] }
        : null;
    case "status": {
      if (!row.status) return null;
      const i = STATUS_ORDER.indexOf(row.status);
      return i >= 0 ? { kind: "num", v: [i] } : text(row.status);
    }
    case "shortCode":
      return text(row.shortCode);
    case "createdAt": {
      if (!row.createdAt) return null;
      const t = new Date(row.createdAt).getTime();
      return Number.isNaN(t) ? null : { kind: "num", v: [t] };
    }
  }
}

function compareKeys(a: Key, b: Key, direction: SortDirection): number {
  // Vazios sempre no fim, em qualquer direção
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  let c = 0;
  if (a.kind === "num" && b.kind === "num") {
    for (let i = 0; i < Math.max(a.v.length, b.v.length) && c === 0; i++)
      c = (a.v[i] ?? 0) - (b.v[i] ?? 0);
  } else c = collator.compare(String(a.v), String(b.v));
  return direction === "desc" ? -c : c;
}

/** Níveis efetivos: o campo de agrupamento vem primeiro. */
function effectiveLevels(spec: SortSpec): SortLevel[] {
  if (!spec.groupBy) return spec.levels;
  const own = spec.levels.find((l) => l.field === spec.groupBy);
  return [
    { field: spec.groupBy, direction: own?.direction ?? "asc" },
    ...spec.levels.filter((l) => l.field !== spec.groupBy),
  ];
}

/** Comparador do spec, com desempate estável final por nome e depois id. */
export function sortComparator(spec: SortSpec) {
  const levels = effectiveLevels(spec);
  return (a: SortRow, b: SortRow): number => {
    for (const l of levels) {
      const c = compareKeys(keyOf(a, l.field), keyOf(b, l.field), l.direction);
      if (c) return c;
    }
    const n = compareKeys(text(a.fullName), text(b.fullName), "asc");
    if (n) return n;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/** Ordena (sem alterar a entrada) linhas que estendem SortRow. */
export function sortRegistrations<T extends SortRow>(rows: readonly T[], spec: SortSpec): T[] {
  return [...rows].sort(sortComparator(spec));
}

/** Ordena itens quaisquer pela linha normalizada de cada um. */
export function sortBy<T>(items: readonly T[], toRow: (item: T) => SortRow, spec: SortSpec): T[] {
  const cmp = sortComparator(spec);
  return items
    .map((item) => ({ item, row: toRow(item) }))
    .sort((a, b) => cmp(a.row, b.row))
    .map((x) => x.item);
}

const EMPTY_GROUP_LABEL: Record<BuiltinSortField, string> = {
  company: "Sem empresa",
  inviter: "Sem empresa da cota",
  fullName: "Sem nome",
  badgeName: "Sem nome",
  lastName: "Sem sobrenome",
  category: "Sem categoria",
  group: "Sem grupo",
  seat: "Sem mesa",
  status: "Sem status",
  shortCode: "Sem código",
  createdAt: "Sem data",
};

/** Rótulo do grupo de uma linha (vazio vira "Sem …"). */
export function groupLabel(
  row: SortRow,
  field: SortField,
  opts?: { statusLabels?: Record<string, string>; timeZone?: string },
): string {
  if (isCustomField(field)) {
    const v = text(row.custom?.[customFieldKey(field)]);
    return v ? String(v.v) : "Sem valor";
  }
  switch (field) {
    case "seat":
      return row.table != null ? row.tableLabel || `Mesa ${row.table}` : EMPTY_GROUP_LABEL.seat;
    case "status":
      return row.status ? (opts?.statusLabels?.[row.status] ?? row.status) : "Sem status";
    case "createdAt":
      return row.createdAt
        ? new Intl.DateTimeFormat("pt-BR", { timeZone: opts?.timeZone ?? "UTC" }).format(
            new Date(row.createdAt),
          )
        : EMPTY_GROUP_LABEL.createdAt;
    case "badgeName":
      return (row.badgeName || row.fullName || "").trim() || EMPTY_GROUP_LABEL.badgeName;
    default: {
      const v = row[field];
      return (typeof v === "string" && v.trim()) || EMPTY_GROUP_LABEL[field];
    }
  }
}

export type SortGroup<T> = { key: string; label: string; rows: T[] };

/**
 * Ordena e agrupa. Sem `groupBy`, devolve um grupo só (rótulo vazio) — quem
 * desenha a lista trata os dois casos do mesmo jeito.
 */
export function groupRegistrations<T extends SortRow>(
  rows: readonly T[],
  spec: SortSpec,
  opts?: { statusLabels?: Record<string, string>; timeZone?: string },
): SortGroup<T>[] {
  const sorted = sortRegistrations(rows, spec);
  if (!spec.groupBy) return [{ key: "", label: "", rows: sorted }];
  const field = spec.groupBy;
  const out: SortGroup<T>[] = [];
  for (const r of sorted) {
    const label = groupLabel(r, field, opts);
    const key = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const last = out[out.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else out.push({ key, label, rows: [r] });
  }
  return out;
}

/** Nomes fictícios para a pré-visualização quando ainda não há inscritos. */
export const SAMPLE_SORT_ROWS: readonly SortRow[] = [
  {
    id: "s1",
    fullName: "Rafael Moreira",
    lastName: "Moreira",
    company: "Frigorífico Serra Azul",
    category: "Convidado",
    categoryOrder: 1,
    group: "Ônibus 2",
    table: 10,
    seat: 2,
    status: "CONFIRMED",
    shortCode: "418230",
    createdAt: "2026-08-03T12:00:00Z",
  },
  {
    id: "s2",
    fullName: "Ana Beatriz Lopes",
    lastName: "Lopes",
    company: "Agropecuária Ébano",
    category: "VIP",
    categoryOrder: 0,
    group: "Ônibus 1",
    table: 2,
    seat: 1,
    status: "CONFIRMED",
    shortCode: "102938",
    createdAt: "2026-08-05T12:00:00Z",
  },
  {
    id: "s3",
    fullName: "Carlos Éden Prado",
    lastName: "Prado",
    company: "Frigorífico Serra Azul",
    category: "Convidado",
    categoryOrder: 1,
    group: "Ônibus 1",
    table: 2,
    seat: 4,
    status: "INVITED",
    shortCode: "771204",
    createdAt: "2026-08-01T12:00:00Z",
  },
  {
    id: "s4",
    fullName: "Juliana Tavares",
    lastName: "Tavares",
    company: "",
    category: "Imprensa",
    categoryOrder: 2,
    group: "",
    table: null,
    seat: null,
    status: "PENDING",
    shortCode: "330915",
    createdAt: "2026-08-09T12:00:00Z",
  },
  {
    id: "s5",
    fullName: "Bruno Almeida",
    lastName: "Almeida",
    company: "agropecuária ébano",
    category: "Convidado",
    categoryOrder: 1,
    group: "Ônibus 2",
    table: 10,
    seat: 1,
    status: "CONFIRMED",
    shortCode: "559102",
    createdAt: "2026-08-02T12:00:00Z",
  },
  {
    id: "s6",
    fullName: "Marina Quintela",
    lastName: "Quintela",
    company: "Cooperativa Vale Verde",
    category: "VIP",
    categoryOrder: 0,
    group: "Ônibus 1",
    table: 1,
    seat: 3,
    status: "DECLINED",
    shortCode: "640017",
    createdAt: "2026-08-07T12:00:00Z",
  },
];
