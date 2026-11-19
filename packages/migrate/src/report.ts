/**
 * Relatório de execução: contagens por entidade, duplicatas fundidas, avisos
 * e arquivos ausentes. Sai em JSON (arquivo) e em resumo legível (console).
 */

export type EntityCounts = { read: number; created: number; updated: number; skipped: number };

export type WarningKind =
  | "INVALID_DATA"
  | "LOSSY_CONVERSION"
  | "MISSING_FILE"
  | "MISSING_REFERENCE"
  | "CONFLICT"
  | "NOT_MIGRATED"
  | "REVIEW";

export type Warning = {
  kind: WarningKind;
  entity: string;
  legacyId: string;
  message: string;
};

export type Merge = { entity: string; key: string; intoId: string; reason: string };

export type ReportJson = {
  source: string;
  tenant: string;
  target: string;
  dryRun: boolean;
  steps: string[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  ok: boolean;
  error: string | null;
  legacyCounts: Record<string, number>;
  entities: Record<string, EntityCounts>;
  merges: Merge[];
  warnings: Warning[];
  warningsByKind: Record<string, number>;
  missingFiles: { entity: string; legacyId: string; path: string }[];
  notes: string[];
};

export class Report {
  readonly entities = new Map<string, EntityCounts>();
  readonly merges: Merge[] = [];
  readonly warnings: Warning[] = [];
  readonly missingFiles: { entity: string; legacyId: string; path: string }[] = [];
  readonly notes: string[] = [];
  legacyCounts: Record<string, number> = {};
  private readonly started = new Date();

  constructor(
    readonly meta: {
      source: string;
      tenant: string;
      target: string;
      dryRun: boolean;
      steps: string[];
    },
  ) {}

  private bucket(entity: string): EntityCounts {
    let b = this.entities.get(entity);
    if (!b) {
      b = { read: 0, created: 0, updated: 0, skipped: 0 };
      this.entities.set(entity, b);
    }
    return b;
  }

  read(entity: string, n = 1) {
    this.bucket(entity).read += n;
  }
  created(entity: string, n = 1) {
    this.bucket(entity).created += n;
  }
  updated(entity: string, n = 1) {
    this.bucket(entity).updated += n;
  }
  skipped(entity: string, n = 1) {
    this.bucket(entity).skipped += n;
  }
  /** Gravou: conta como criado ou atualizado conforme já existia. */
  saved(entity: string, existed: boolean) {
    if (existed) this.updated(entity);
    else this.created(entity);
  }

  warn(kind: WarningKind, entity: string, legacyId: string, message: string) {
    this.warnings.push({ kind, entity, legacyId, message });
  }

  merge(entity: string, key: string, intoId: string, reason: string) {
    this.merges.push({ entity, key, intoId, reason });
  }

  missingFile(entity: string, legacyId: string, path: string) {
    this.missingFiles.push({ entity, legacyId, path });
    this.warn("MISSING_FILE", entity, legacyId, `Arquivo não encontrado no legado: ${path}`);
  }

  note(text: string) {
    this.notes.push(text);
  }

  toJson(result: { ok: boolean; error: string | null }): ReportJson {
    const finished = new Date();
    const warningsByKind: Record<string, number> = {};
    for (const w of this.warnings) warningsByKind[w.kind] = (warningsByKind[w.kind] ?? 0) + 1;
    return {
      ...this.meta,
      startedAt: this.started.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs: finished.getTime() - this.started.getTime(),
      ok: result.ok,
      error: result.error,
      legacyCounts: this.legacyCounts,
      entities: Object.fromEntries(this.entities),
      merges: this.merges,
      warnings: this.warnings,
      warningsByKind,
      missingFiles: this.missingFiles,
      notes: this.notes,
    };
  }
}

const KIND_LABEL: Record<WarningKind, string> = {
  INVALID_DATA: "dados inválidos",
  LOSSY_CONVERSION: "conversão com perda",
  MISSING_FILE: "arquivo ausente",
  MISSING_REFERENCE: "referência ausente",
  CONFLICT: "conflito",
  NOT_MIGRATED: "não migrado (por regra)",
  REVIEW: "revisar",
};

/** Resumo legível para o console. */
export function formatReport(r: ReportJson, maxWarnings = 40): string {
  const lines: string[] = [];
  const pad = (s: string | number, n: number) => String(s).padStart(n);
  lines.push("");
  lines.push(
    `Migração ${r.dryRun ? "(SIMULAÇÃO — nada foi gravado)" : "(gravada)"} · ${r.tenant} · ${r.source}`,
  );
  lines.push(`Destino: ${r.target} · etapas: ${r.steps.join(", ")}`);
  lines.push(
    `${r.ok ? "Concluída" : "FALHOU"} em ${(r.durationMs / 1000).toFixed(1)} s${r.error ? ` — ${r.error}` : ""}`,
  );
  lines.push("");
  lines.push(
    `${"Entidade".padEnd(28)}${pad("lidos", 8)}${pad("criados", 9)}${pad("atualiz.", 10)}${pad("ignorados", 11)}`,
  );
  for (const [name, c] of Object.entries(r.entities).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(
      `${name.padEnd(28)}${pad(c.read, 8)}${pad(c.created, 9)}${pad(c.updated, 10)}${pad(c.skipped, 11)}`,
    );
  }
  lines.push("");
  lines.push(`Duplicatas fundidas: ${r.merges.length}`);
  for (const m of r.merges.slice(0, 20))
    lines.push(`  · ${m.key} → ${m.entity} ${m.intoId} (${m.reason})`);
  if (r.merges.length > 20) lines.push(`  … mais ${r.merges.length - 20} (ver JSON)`);
  lines.push("");
  const byKind = Object.entries(r.warningsByKind)
    .map(([k, n]) => `${KIND_LABEL[k as WarningKind] ?? k}: ${n}`)
    .join(" · ");
  lines.push(`Avisos: ${r.warnings.length}${byKind ? ` (${byKind})` : ""}`);
  for (const w of r.warnings.slice(0, maxWarnings))
    lines.push(`  · [${KIND_LABEL[w.kind]}] ${w.entity} ${w.legacyId}: ${w.message}`);
  if (r.warnings.length > maxWarnings)
    lines.push(`  … mais ${r.warnings.length - maxWarnings} (ver JSON)`);
  if (r.notes.length) {
    lines.push("");
    lines.push("Observações:");
    for (const n of r.notes) lines.push(`  · ${n}`);
  }
  lines.push("");
  return lines.join("\n");
}
