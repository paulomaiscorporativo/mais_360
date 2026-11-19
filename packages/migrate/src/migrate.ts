import path from "node:path";
import { parseKey } from "@mais/core/crypto";
import type { PrismaClient } from "@mais/db";
import { STEPS, type Ctx, type Step } from "./context";
import { Report, type ReportJson } from "./report";
import { LegacySource } from "./source";
import { migrateOrganizations, migratePeople, migrateUsers } from "./steps/core";
import { migrateAudit, migrateCorporate } from "./steps/corporate";
import { migrateEvents } from "./steps/events";
import { migrateProjects } from "./steps/projects";
import { migrateRegistrations } from "./steps/registrations";
import {
  migrateAccommodation,
  migrateDocuments,
  migrateFlights,
  migrateItinerary,
  migrateMural,
  migrateSupport,
} from "./steps/travel";

export type MigrationOptions = {
  prisma: PrismaClient;
  /** Arquivo SQLite do legado (somente leitura) */
  source: string;
  /** Slug do cliente de destino (precisa existir) */
  tenant: string;
  /** Prefixo das chaves de origem; padrão = slug do cliente */
  prefix?: string;
  dryRun: boolean;
  only?: readonly Step[];
  /** Uploads do legado; padrão: <app do legado>/storage */
  filesDir?: string;
  /** STORAGE_DIR da plataforma */
  storageDir: string;
  encryptionKey?: string;
  /** Descrição do destino para o relatório (sem senha) */
  target: string;
};

class DryRunRollback extends Error {
  constructor() {
    super("simulação: transação revertida");
  }
}

/** Banco do legado em <app>/prisma/dev.db → uploads em <app>/storage (padrão do legado). */
export function defaultFilesDir(source: string): string {
  return path.resolve(path.dirname(path.resolve(source)), "..", "storage");
}

/** "postgresql://u:senha@host:5433/banco?…" → "host:5433/banco" */
export function describeDatabaseUrl(url: string | undefined): string {
  if (!url) return "(DATABASE_URL vazio)";
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(DATABASE_URL inválido)";
  }
}

export async function runMigration(opts: MigrationOptions): Promise<ReportJson> {
  const steps = new Set<Step>(opts.only?.length ? opts.only : STEPS);
  const report = new Report({
    source: path.resolve(opts.source),
    tenant: opts.tenant,
    target: opts.target,
    dryRun: opts.dryRun,
    steps: STEPS.filter((s) => steps.has(s)),
  });

  let src: LegacySource | null = null;
  try {
    src = new LegacySource(opts.source);
    report.legacyCounts = src.counts();

    const tenant = await opts.prisma.tenant.findUnique({
      where: { slug: opts.tenant },
      include: { branding: true },
    });
    if (!tenant)
      throw new Error(
        `Cliente "${opts.tenant}" não encontrado no destino. Crie-o pelo console antes de migrar.`,
      );

    let encryptionKey: Buffer | null = null;
    try {
      encryptionKey = opts.encryptionKey ? parseKey(opts.encryptionKey) : null;
    } catch {
      encryptionKey = null;
    }
    if (!encryptionKey)
      report.note(
        "ENCRYPTION_KEY ausente ou inválida: senhas provisórias das empresas não serão migradas.",
      );

    const source = src;
    await opts.prisma.$transaction(
      async (tx) => {
        const ctx: Ctx = {
          tx,
          src: source,
          report,
          tenant: {
            id: tenant.id,
            slug: tenant.slug,
            name: tenant.name,
            workspaceId: tenant.workspaceId,
            timezone: tenant.timezone || "America/Sao_Paulo",
            primaryColor: tenant.branding?.primaryColor ?? "",
            secondaryColor: tenant.branding?.secondaryColor ?? "",
          },
          prefix: opts.prefix || tenant.slug,
          dryRun: opts.dryRun,
          steps,
          filesDir: opts.filesDir ?? defaultFilesDir(opts.source),
          storageDir: opts.storageDir,
          encryptionKey,
          maps: {
            users: new Map(),
            people: new Map(),
            personOrg: new Map(),
            orgs: new Map(),
            projects: new Map(),
            groups: new Map(),
            groupsByName: new Map(),
            categories: new Map(),
            registrations: new Map(),
            tables: new Map(),
            quotas: new Map(),
          },
        };

        // Ordem fixa: cada etapa usa os mapas das anteriores. Etapas fora de
        // --only calculam os mapas (ids determinísticos) mas não gravam.
        await migrateUsers(ctx);
        await migrateOrganizations(ctx);
        await migratePeople(ctx);
        await migrateProjects(ctx);
        await migrateRegistrations(ctx);
        await migrateFlights(ctx);
        await migrateAccommodation(ctx);
        await migrateItinerary(ctx);
        await migrateMural(ctx);
        await migrateSupport(ctx);
        await migrateDocuments(ctx);
        await migrateEvents(ctx);
        await migrateCorporate(ctx);
        await migrateAudit(ctx);

        // Segurança: a migração nunca deixa mensagem ou job para disparar
        const queued = await tx.messageDelivery.count({
          where: {
            tenantId: tenant.id,
            status: { in: ["QUEUED", "SENDING"] },
            dedupeKey: { startsWith: "legado:" },
          },
        });
        if (queued)
          throw new Error(`${queued} mensagem(ns) migrada(s) ficaram na fila — abortado.`);

        if (opts.dryRun) throw new DryRunRollback();
      },
      { timeout: 60 * 60_000, maxWait: 60_000 },
    );
    report.note(
      "Nenhuma mensagem ou job foi criado para envio: o histórico de convites entrou como enviado/falhou/ignorado.",
    );
    return report.toJson({ ok: true, error: null });
  } catch (err) {
    if (err instanceof DryRunRollback) {
      report.note("Simulação: todas as gravações foram revertidas e nenhum arquivo foi copiado.");
      return report.toJson({ ok: true, error: null });
    }
    return report.toJson({ ok: false, error: err instanceof Error ? err.message : String(err) });
  } finally {
    src?.close();
  }
}
