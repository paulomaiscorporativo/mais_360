import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_TEMPLATES,
  SAMPLE_REGISTRATION,
  SAMPLE_TRAVELER,
  parseDefinition,
  type DocumentData,
  type DocumentDefinition,
  type DocumentKind,
} from "@mais/core";
import { CSS_FAMILIES, renderPdf, renderThermalHtml, type AssetLoader } from "@mais/documents";
import type { ActorType, Prisma, RenderPurpose, TenantRole } from "@mais/db";
import { prisma } from "./db";
import { env } from "./env";
import { AppError, notFound } from "./errors";
import { modulesForTenant } from "./modules";
import { requireTenant } from "./auth";

/**
 * Serviço de documentos da aplicação web: modelos, dados de uma inscrição,
 * arquivos (fundo PDF, logos) e geração de PDF / HTML térmico.
 *
 * Contrato público para os outros módulos (balcão, totem, vouchers):
 * `renderForRegistrations` — ver docs/CONTRATO-DOCUMENTOS.md.
 */

// ── Fontes do motor: no Next o código é empacotado, então indicamos a pasta. ──
if (!process.env.DOCUMENTS_FONTS_DIR) {
  const candidates = [
    path.resolve(/*turbopackIgnore: true*/ process.cwd(), "../../packages/documents/fonts"),
    path.resolve(/*turbopackIgnore: true*/ process.cwd(), "packages/documents/fonts"),
  ];
  const dir = candidates.find((d) => existsSync(d));
  if (dir) process.env.DOCUMENTS_FONTS_DIR = dir;
}

export const KIND_LABEL: Record<DocumentKind, string> = {
  BADGE: "Crachá",
  LABEL: "Etiqueta",
  VOUCHER: "Voucher",
  CERTIFICATE: "Certificado",
  CONTRACT: "Contrato",
  ROOMING_LIST: "Rooming list",
  OTHER: "Outro",
};

/** Garante que o módulo de documentos está ativo para o cliente. */
export async function assertDocumentsModule(tenant: { id: string; workspaceId: string }) {
  const active = await modulesForTenant(tenant);
  if (!active.has("DOCUMENTS")) throw notFound("Módulo de documentos não contratado.");
}

/** Modelo inicial de cada tipo (os 3 padrões prontos ou uma página em branco). */
export function starterDefinition(kind: DocumentKind, start: string): DocumentDefinition {
  if (start === "LABEL_80X40") return parseDefinition(DEFAULT_TEMPLATES.LABEL_80X40);
  if (start === "BADGE_A6") return parseDefinition(DEFAULT_TEMPLATES.BADGE_A6);
  if (start === "VOUCHER_A4") return parseDefinition(DEFAULT_TEMPLATES.VOUCHER_A4);
  const size: Record<DocumentKind, [number, number]> = {
    LABEL: [80, 40],
    BADGE: [105, 148],
    VOUCHER: [210, 297],
    CERTIFICATE: [297, 210],
    CONTRACT: [210, 297],
    ROOMING_LIST: [210, 297],
    OTHER: [210, 297],
  };
  const [width, height] = size[kind];
  return parseDefinition({
    kind,
    page: { width, height },
    elements: [],
    output: kind === "LABEL" ? "thermal" : "pdf",
    monochrome: kind === "LABEL",
  });
}

export async function getTemplateForTenant(templateId: string, tenantId: string) {
  const t = await prisma.documentTemplate.findFirst({
    where: { id: templateId, tenantId, archivedAt: null },
  });
  if (!t) throw notFound("Modelo não encontrado.");
  return t;
}

// ── Dados ────────────────────────────────────────────────────────────────────

type TenantBrandInfo = {
  name: string;
  timezone: string;
  branding: {
    logoFileId: string | null;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  } | null;
};

function tenantData(t: TenantBrandInfo): DocumentData["tenant"] {
  return {
    name: t.name,
    logoFileId: t.branding?.logoFileId ?? undefined,
    primaryColor: t.branding?.primaryColor,
    secondaryColor: t.branding?.secondaryColor,
    accentColor: t.branding?.accentColor,
  };
}

/** Dados de exemplo do editor, com a marca do cliente aplicada. */
export function sampleData(kind: DocumentKind, tenant: TenantBrandInfo): DocumentData {
  const base = kind === "VOUCHER" ? SAMPLE_TRAVELER : SAMPLE_REGISTRATION;
  return { ...base, timezone: tenant.timezone, tenant: { ...base.tenant, ...tenantData(tenant) } };
}

/** Monta o DocumentData de inscrições reais (uma consulta para o lote). */
export async function registrationData(
  tenantId: string,
  registrationIds: string[],
): Promise<Map<string, DocumentData>> {
  const regs = await prisma.registration.findMany({
    where: { tenantId, id: { in: registrationIds } },
    include: {
      person: { include: { organizations: { include: { organization: true } } } },
      project: { include: { tenant: { include: { branding: true } } } },
      category: true,
      group: true,
      seat: { include: { table: true } },
      flights: { include: { flight: true, locator: true } },
      rooms: { include: { room: { include: { accommodation: true } } } },
    },
  });
  const projectIds = [...new Set(regs.map((r) => r.projectId))];
  const itinerary = await prisma.itineraryItem.findMany({
    where: { tenantId, projectId: { in: projectIds } },
    orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
  });

  const out = new Map<string, DocumentData>();
  for (const r of regs) {
    const p = r.person;
    const proj = r.project;
    const tenant = proj.tenant;
    const org = p.organizations.find((o) => o.primary) ?? p.organizations[0];
    out.set(r.id, {
      timezone: proj.timezone || tenant.timezone,
      tenant: tenantData({ ...tenant, branding: tenant.branding }),
      project: {
        name: proj.name,
        code: proj.code,
        startsAt: proj.startsAt,
        endsAt: proj.endsAt,
        venueName: proj.venueName,
        venueAddress: proj.venueAddress,
        destination: proj.destination,
        logoFileId: proj.logoFileId ?? undefined,
        primaryColor: proj.primaryColor ?? undefined,
        secondaryColor: proj.secondaryColor ?? undefined,
      },
      person: {
        firstName: p.firstName,
        lastName: p.lastName,
        badgeName: p.badgeName,
        socialName: p.socialName,
        email: p.email,
        phone: p.phone,
        cpf: p.cpf,
        rg: p.rg,
        passportNumber: p.passportNumber,
        passportExpiry: p.passportExpiry,
        birthDate: p.birthDate,
        nationality: p.nationality,
        jobTitle: p.jobTitle,
        city: p.city,
        state: p.state,
        dietary: p.dietary,
        emergencyName: p.emergencyName,
        emergencyPhone: p.emergencyPhone,
        photoFileId: p.photoFileId ?? undefined,
      },
      organization: { name: org?.organization.name },
      registration: {
        role: r.role,
        status: r.status,
        category: r.category?.name,
        categoryColor: r.category?.color,
        group: r.group?.name,
        groupColor: r.group?.color,
        displayCompany: r.displayCompany || org?.organization.name,
        displayJobTitle: r.displayJobTitle || p.jobTitle,
        shortCode: r.shortCode,
        qrValue: `${env.APP_URL.replace(/\/$/, "")}/c/${r.token}`,
        table: r.seat ? r.seat.table.name || String(r.seat.table.number) : undefined,
        seat: r.seat?.seat != null ? String(r.seat.seat) : undefined,
      },
      flights: r.flights.map((fp) => ({
        flightNumber: fp.flight.flightNumber,
        airlineName: fp.flight.airlineName,
        airlineCode: fp.flight.airlineCode,
        operatedBy: fp.flight.operatedBy,
        originIata: fp.flight.originIata,
        originName: fp.flight.originName,
        destIata: fp.flight.destIata,
        destName: fp.flight.destName,
        departure: fp.flight.departureAt,
        arrival: fp.flight.arrivalAt,
        seat: fp.seat,
        locator: fp.locator?.code || fp.flight.defaultLocator,
      })),
      stays: r.rooms.map(({ room }) => ({
        name: room.accommodation.name,
        address: room.accommodation.address,
        city: room.accommodation.city,
        country: room.accommodation.country,
        phone: room.accommodation.phone,
        checkIn: room.checkIn ?? room.accommodation.checkIn,
        checkOut: room.checkOut ?? room.accommodation.checkOut,
        room: room.number,
        roomType: room.typeLabel || room.type,
        confirmation: room.confirmation,
      })),
      itinerary: itinerary
        .filter((i) => i.projectId === r.projectId)
        .map((i) => ({
          date: i.date,
          startTime: i.startTime,
          endTime: i.endTime,
          title: i.title,
          location: i.location,
        })),
      custom: (r.customFields ?? {}) as Record<string, string>,
    });
  }
  return out;
}

/** Inscrições do cliente para escolher como pré-visualização (busca por nome). */
export async function searchRegistrations(tenantId: string, q: string) {
  const term = q.trim();
  const regs = await prisma.registration.findMany({
    where: {
      tenantId,
      status: { not: "CANCELED" },
      ...(term
        ? {
            OR: [
              { person: { firstName: { contains: term, mode: "insensitive" } } },
              { person: { lastName: { contains: term, mode: "insensitive" } } },
              { shortCode: term },
            ],
          }
        : {}),
    },
    include: { person: true, project: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 12,
  });
  return regs.map((r) => ({
    id: r.id,
    name: [r.person.firstName, r.person.lastName].filter(Boolean).join(" "),
    project: r.project.name,
    shortCode: r.shortCode,
  }));
}

// ── Arquivos ─────────────────────────────────────────────────────────────────
// Armazenamento mínimo em disco (STORAGE_DIR). Isolado aqui de propósito:
// quando a camada geral de arquivos da plataforma existir, troque apenas
// `storeFile` e `readStoredFile` — o restante usa só o id de StoredFile.

const ACCEPTED = new Map([
  ["application/pdf", ".pdf"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
]);
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function storageRoot() {
  const dir = process.env.STORAGE_DIR || "./storage";
  return path.isAbsolute(dir)
    ? dir
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), "../..", dir);
}

export async function storeFile(opts: {
  tenantId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  uploadedBy: string;
}) {
  const ext = ACCEPTED.get(opts.mimeType);
  if (!ext) throw new AppError("Envie um PDF, PNG ou JPG.");
  if (opts.bytes.byteLength > MAX_UPLOAD_BYTES)
    throw new AppError("O arquivo passa de 15 MB. Reduza e envie de novo.");
  const storageKey = `${opts.tenantId}/documents/${randomUUID()}${ext}`;
  const full = path.join(storageRoot(), storageKey);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, opts.bytes);
  return prisma.storedFile.create({
    data: {
      tenantId: opts.tenantId,
      storageKey,
      fileName: opts.fileName.slice(0, 200),
      mimeType: opts.mimeType,
      size: opts.bytes.byteLength,
      sha256: createHash("sha256").update(opts.bytes).digest("hex"),
      visibility: "PRIVATE",
      uploadedBy: opts.uploadedBy,
    },
  });
}

export async function readStoredFile(fileId: string, tenantId: string) {
  const f = await prisma.storedFile.findFirst({ where: { id: fileId, tenantId } });
  if (!f) return null;
  try {
    const bytes = new Uint8Array(await readFile(path.join(storageRoot(), f.storageKey)));
    return { file: f, bytes };
  } catch {
    return null;
  }
}

function assetLoader(tenantId: string): AssetLoader {
  return async (fileId) => {
    const hit = await readStoredFile(fileId, tenantId);
    return hit ? { bytes: hit.bytes, mimeType: hit.file.mimeType } : null;
  };
}

export const assetUrl = (fileId: string) => `/api/documents/assets/${fileId}`;

/** Quantas páginas tem o PDF de fundo (para multipágina). */
async function backgroundPages(def: DocumentDefinition, tenantId: string) {
  const bg = def.page.background;
  if (!bg || bg.kind !== "pdf") return 0;
  const hit = await readStoredFile(bg.fileId, tenantId);
  if (!hit) return 0;
  const { PDFDocument } = await import("pdf-lib");
  try {
    return (await PDFDocument.load(hit.bytes, { ignoreEncryption: true })).getPageCount();
  } catch {
    return 0;
  }
}

// ── Geração ──────────────────────────────────────────────────────────────────

/** @font-face apontando para a rota de fontes (HTML de pré-visualização leve). */
export function fontFaceCss(): string {
  return Object.entries(CSS_FAMILIES)
    .map(
      ([file, { family, weight }]) =>
        `@font-face{font-family:"${family}";font-weight:${weight};src:url(/api/documents/fonts/${file}) format("truetype");font-display:block}`,
    )
    .join("\n");
}

/**
 * HTML de UMA página para o canvas do editor: sem rotação/ajuste da impressora,
 * sem sangria e com fundo transparente (a arte de fundo é desenhada por baixo).
 */
export function editorPageHtml(def: DocumentDefinition, data: DocumentData, pageIndex: number) {
  const flat = parseDefinition({
    ...def,
    page: { ...def.page, rotate: 0, offsetX: 0, offsetY: 0, bleed: 0, background: undefined },
  });
  const { html, pageCount } = renderThermalHtml(flat, [data], {
    embedFonts: false,
    assetUrl,
    title: "Pré-visualização",
  });
  const css = `<style>${fontFaceCss()}
html,body{background:transparent!important;overflow:hidden}
@media screen{body{padding:0!important;display:block!important;min-height:0!important;background:transparent!important}.page{box-shadow:none!important;background:transparent!important;margin:0}}
.page{display:none}.page:nth-of-type(${pageIndex + 1}){display:block}
</style>`;
  return { html: html.replace("</head>", `${css}</head>`), pageCount };
}

export type RenderFormat = "pdf" | "thermal";

export type RenderResult =
  | { format: "pdf"; bytes: Uint8Array; fileName: string; pageCount: number; warnings: string[] }
  | { format: "thermal"; html: string; fileName: string; pageCount: number; warnings: string[] };

/** Gera e registra (DocumentRender) um documento para dados já montados. */
async function renderAndLog(opts: {
  tenantId: string;
  projectId?: string | null;
  template: { id: string; version: number; name: string } | null;
  def: DocumentDefinition;
  records: DocumentData[];
  registrationIds: string[];
  format: RenderFormat;
  purpose: RenderPurpose;
  actor: { type: ActorType; label: string; userId?: string | null; kioskId?: string | null };
  guides?: boolean;
  autoPrint?: boolean;
}): Promise<RenderResult> {
  const fileBase = opts.template?.name || "documento";
  let result: RenderResult;
  if (opts.format === "pdf") {
    const r = await renderPdf(opts.def, opts.records, {
      loadAsset: assetLoader(opts.tenantId),
      guides: opts.guides,
      title: fileBase,
      author: "Mais 360",
    });
    result = {
      format: "pdf",
      bytes: r.bytes,
      fileName: r.fileName || fileBase,
      pageCount: r.pageCount,
      warnings: r.warnings,
    };
  } else {
    // HTML térmico: imagens embutidas como data URL, a impressão não depende da rede.
    const urls = new Map<string, string>();
    const ids = new Set<string>();
    for (const el of opts.def.elements)
      if (el.type === "image" && el.source.kind === "file") ids.add(el.source.fileId);
    for (const rec of opts.records) {
      for (const id of [rec.tenant?.logoFileId, rec.project?.logoFileId, rec.person?.photoFileId])
        if (id) ids.add(id);
    }
    for (const id of ids) {
      const hit = await readStoredFile(id, opts.tenantId);
      if (hit && hit.file.mimeType.startsWith("image/"))
        urls.set(
          id,
          `data:${hit.file.mimeType};base64,${Buffer.from(hit.bytes).toString("base64")}`,
        );
    }
    const r = renderThermalHtml(opts.def, opts.records, {
      assetUrl: (id) => urls.get(id) ?? null,
      autoPrint: opts.autoPrint,
      title: fileBase,
    });
    result = {
      format: "thermal",
      html: r.html,
      fileName: fileBase,
      pageCount: r.pageCount,
      warnings: [],
    };
  }

  await prisma.documentRender.create({
    data: {
      tenantId: opts.tenantId,
      projectId: opts.projectId ?? null,
      templateId: opts.template?.id ?? null,
      templateVersion: opts.template?.version ?? 1,
      purpose: opts.purpose,
      format: opts.format === "pdf" ? "PDF" : "THERMAL_HTML",
      pages: result.pageCount,
      recordCount: opts.records.length,
      registrationIds: opts.registrationIds,
      actorType: opts.actor.type,
      actorLabel: opts.actor.label,
      userId: opts.actor.userId ?? null,
      kioskId: opts.actor.kioskId ?? null,
      warnings: result.warnings.slice(0, 50),
    },
  });
  return result;
}

/**
 * CONTRATO para balcão, totem e vouchers (Onda 2): gera o documento de um
 * modelo para uma ou mais inscrições do MESMO cliente, num único arquivo,
 * e registra a emissão. Não altera printCount — quem imprime decide isso.
 */
export async function renderForRegistrations(
  templateId: string,
  registrationIds: string[],
  opts: {
    tenantId: string;
    format?: RenderFormat;
    purpose?: RenderPurpose;
    actor: { type: ActorType; label: string; userId?: string | null; kioskId?: string | null };
    autoPrint?: boolean;
  },
): Promise<RenderResult> {
  if (!registrationIds.length) throw new AppError("Escolha ao menos uma inscrição.");
  if (registrationIds.length > 1000) throw new AppError("Gere no máximo 1.000 documentos por vez.");
  const template = await getTemplateForTenant(templateId, opts.tenantId);
  const def = parseDefinition(template.definition);
  const data = await registrationData(opts.tenantId, registrationIds);
  const missing = registrationIds.filter((id) => !data.has(id));
  if (missing.length) throw notFound("Alguma inscrição não pertence a este cliente.");
  const records = registrationIds.map((id) => data.get(id)!);
  const projectIds = new Set(records.map(() => template.projectId).filter(Boolean));
  return renderAndLog({
    tenantId: opts.tenantId,
    projectId: projectIds.size === 1 ? [...projectIds][0] : template.projectId,
    template,
    def,
    records,
    registrationIds,
    format: opts.format ?? (def.output === "thermal" ? "thermal" : "pdf"),
    purpose: opts.purpose ?? "PRINT",
    actor: opts.actor,
    autoPrint: opts.autoPrint,
  });
}

/** Geração a partir do editor: modelo salvo + dados de exemplo ou de uma inscrição. */
export async function renderTemplatePreview(opts: {
  tenant: TenantBrandInfo & { id: string };
  templateId: string;
  registrationId?: string | null;
  format: RenderFormat;
  guides?: boolean;
  actor: { type: ActorType; label: string; userId?: string | null };
}) {
  const template = await getTemplateForTenant(opts.templateId, opts.tenant.id);
  const def = parseDefinition(template.definition);
  let record = sampleData(def.kind, opts.tenant);
  const ids: string[] = [];
  if (opts.registrationId) {
    const hit = (await registrationData(opts.tenant.id, [opts.registrationId])).get(
      opts.registrationId,
    );
    if (hit) {
      record = hit;
      ids.push(opts.registrationId);
    }
  }
  return renderAndLog({
    tenantId: opts.tenant.id,
    projectId: template.projectId,
    template,
    def,
    records: [record],
    registrationIds: ids,
    format: opts.format,
    purpose: "PREVIEW",
    actor: { ...opts.actor, type: opts.actor.type },
    guides: opts.guides,
  });
}

export async function countBackgroundPages(def: DocumentDefinition, tenantId: string) {
  return backgroundPages(def, tenantId);
}

export type TemplateJson = Prisma.InputJsonValue;

// ── Autorização ──────────────────────────────────────────────────────────────

/** Cliente pelo slug + módulo ativo. Use em páginas, actions e rotas. */
export async function requireDocumentsTenant(slug: string, minRole: TenantRole = "VIEWER") {
  const ctx = await requireTenant(slug, minRole);
  await assertDocumentsModule(ctx.tenant);
  return ctx;
}

/** Modelo pelo id, checando que o usuário enxerga o cliente dono dele. */
export async function requireTemplateAccess(templateId: string, minRole: TenantRole = "VIEWER") {
  const t = await prisma.documentTemplate.findFirst({
    where: { id: templateId, archivedAt: null },
    select: { tenantId: true },
  });
  if (!t) throw notFound("Modelo não encontrado.");
  const tenant = await prisma.tenant.findUnique({
    where: { id: t.tenantId },
    select: { slug: true },
  });
  if (!tenant) throw notFound("Modelo não encontrado.");
  const ctx = await requireDocumentsTenant(tenant.slug, minRole);
  const template = await getTemplateForTenant(templateId, ctx.tenantId);
  return { ctx, template };
}

/** Converte erros de autorização/negócio em resposta HTTP (rotas de API). */
export function apiError(err: unknown): Response {
  if (err instanceof AppError) {
    const status =
      err.code === "NOT_FOUND" || err.code === "FORBIDDEN"
        ? 404
        : err.code === "UNAUTHENTICATED"
          ? 401
          : 400;
    return Response.json({ error: err.message }, { status });
  }
  throw err;
}
