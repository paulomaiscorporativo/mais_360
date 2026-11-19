import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileVisibility, Prisma } from "@mais/db";
import { deterministicId, legacyKey } from "./rules";
import type { Report } from "./report";
import type { LegacySource } from "./source";

export const STEPS = [
  "nucleo",
  "projetos",
  "inscricoes",
  "voos",
  "hospedagem",
  "roteiro",
  "mural",
  "suporte",
  "documentos",
  "convites",
  "linha-direta",
  "auditoria",
] as const;

export type Step = (typeof STEPS)[number];

export type TenantInfo = {
  id: string;
  slug: string;
  name: string;
  workspaceId: string;
  timezone: string;
  primaryColor: string;
  secondaryColor: string;
};

export type ProjectInfo = { id: string; tz: string; isEvent: boolean; name: string };

export type Ctx = {
  tx: Prisma.TransactionClient;
  src: LegacySource;
  report: Report;
  tenant: TenantInfo;
  /** Prefixo das chaves de origem: "abiec" → "abiec:Passenger:<id>" */
  prefix: string;
  dryRun: boolean;
  steps: ReadonlySet<Step>;
  /** Pasta de uploads do legado (STORAGE_DIR antigo) */
  filesDir: string;
  /** Pasta de arquivos da plataforma (STORAGE_DIR novo) */
  storageDir: string;
  encryptionKey: Buffer | null;
  maps: {
    users: Map<string, string>;
    people: Map<string, string>;
    /** Organização principal de cada pessoa (id novo da pessoa → id da organização) */
    personOrg: Map<string, string>;
    /** Chave normalizada da empresa (CNPJ ou nome) → id da organização */
    orgs: Map<string, string>;
    projects: Map<string, ProjectInfo>;
    groups: Map<string, string>;
    /** "<tripId>:<nome do grupo sem acento>" → id do grupo */
    groupsByName: Map<string, string>;
    categories: Map<string, string>;
    /** "Passenger:<id>" / "Invite:<id>" → id da inscrição */
    registrations: Map<string, string>;
    tables: Map<string, string>;
    quotas: Map<string, string>;
  };
};

export function on(ctx: Ctx, step: Step): boolean {
  return ctx.steps.has(step);
}

export function keyOf(ctx: Ctx, model: string, id: string | number): string {
  return legacyKey(ctx.prefix, model, id);
}

export function idOf(ctx: Ctx, model: string, id: string | number): string {
  return deterministicId(ctx.tenant.id, keyOf(ctx, model, id));
}

/** `{ legado: "abiec:Modelo:<id>" }` — rastreabilidade nos campos Json. */
export function legacyJson(ctx: Ctx, model: string, id: string | number) {
  return { legado: keyOf(ctx, model, id) };
}

/** Ids que já existem no destino, para contar criados × atualizados. */
export async function existingIds(
  ids: readonly string[],
  find: (ids: string[]) => Promise<{ id: string }[]>,
): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 1000) {
    for (const r of await find(ids.slice(i, i + 1000))) out.add(r.id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Arquivos: legado (disco) → STORAGE_DIR + StoredFile
// ---------------------------------------------------------------------------

const EXT_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".svg": "image/svg+xml",
};

const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/svg+xml": "svg",
};

function sniff(buf: Buffer): string | null {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  return null;
}

export type ImportFileInput = {
  entity: string;
  legacyId: string;
  relPath: string;
  fileName?: string;
  mimeType?: string;
  visibility: FileVisibility;
  uploadedBy?: string;
  createdAt?: Date | null;
  /** Arquivo global (logo de companhia aérea): sem cliente */
  global?: boolean;
};

/**
 * Copia o arquivo do legado para o storage da plataforma e cria o StoredFile.
 * Idempotente: o conteúdo (sha256) define a chave e o id — reexecutar não
 * duplica, e o mesmo arquivo usado em dois lugares vira um StoredFile só.
 * Arquivo ausente no disco: registra no relatório e devolve null.
 */
export async function importFile(ctx: Ctx, input: ImportFileInput): Promise<string | null> {
  const rel = input.relPath.trim();
  if (!rel) return null;
  const root = path.resolve(ctx.filesDir);
  const full = path.resolve(root, rel.replace(/^[/\\]+/, ""));
  if (!full.startsWith(root + path.sep) || !existsSync(full)) {
    ctx.report.missingFile(input.entity, input.legacyId, rel);
    return null;
  }
  const buf = await readFile(full);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const ext = path.extname(rel).toLowerCase();
  const declared =
    input.mimeType && input.mimeType !== "application/octet-stream" ? input.mimeType : "";
  const mime = sniff(buf) ?? (declared || EXT_MIME[ext] || "application/octet-stream");
  const owner = input.global ? null : ctx.tenant.id;
  const storageKey = `${owner ?? "plataforma"}/legado/${sha256}.${MIME_EXT[mime] ?? "bin"}`;
  const id = deterministicId(owner ?? "plataforma", `file:${sha256}`);

  const existing = await ctx.tx.storedFile.findUnique({ where: { id }, select: { id: true } });
  const fileName = (input.fileName || path.basename(rel)).slice(0, 200);
  await ctx.tx.storedFile.upsert({
    where: { id },
    create: {
      id,
      tenantId: owner,
      storageKey,
      fileName,
      mimeType: mime,
      size: buf.byteLength,
      sha256,
      visibility: input.visibility,
      uploadedBy: input.uploadedBy ?? "migração",
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
    update: { fileName, visibility: input.visibility },
  });
  ctx.report.saved("StoredFile", !!existing);

  if (!ctx.dryRun) {
    const target = path.resolve(ctx.storageDir, storageKey);
    if (!existsSync(target)) {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buf);
    }
  }
  return id;
}
