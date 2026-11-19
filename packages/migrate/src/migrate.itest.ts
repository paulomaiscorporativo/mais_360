import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@mais/db";
import { runMigration } from "./migrate";
import type { ReportJson } from "./report";

/**
 * Migração ponta a ponta contra o dev.db da ABIEC: simulação não grava,
 * a primeira execução cria, a segunda só atualiza (idempotência), tokens e
 * códigos dos convites são preservados e nenhum envio fica pendente.
 */

const LEGACY = process.env.LEGACY_ABIEC_DB ?? "";
const SLUG = "abiec-migracao-teste";
const PDF = Buffer.from("%PDF-1.4\n% teste de migração\n%%EOF\n");

const prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
let work = "";
let source = "";
let storageDir = "";

const totals = (r: ReportJson) =>
  Object.values(r.entities).reduce(
    (acc, c) => ({ created: acc.created + c.created, updated: acc.updated + c.updated }),
    { created: 0, updated: 0 },
  );

async function counts(tenantId: string) {
  const where = { tenantId };
  return {
    people: await prisma.person.count({ where }),
    projects: await prisma.project.count({ where }),
    registrations: await prisma.registration.count({ where }),
    flights: await prisma.flight.count({ where }),
    requests: await prisma.travelRequest.count({ where }),
    deliveries: await prisma.messageDelivery.count({ where }),
    files: await prisma.storedFile.count({ where }),
    audit: await prisma.auditLog.count({ where }),
  };
}

describe.skipIf(!LEGACY || !existsSync(LEGACY))("migração ABIEC (dev.db)", () => {
  let tenantId = "";
  let legacyInvite: { token: string; code: string } | null = null;

  beforeAll(async () => {
    // Cópia do legado numa pasta temporária: a original nunca é aberta para escrita
    work = mkdtempSync(path.join(tmpdir(), "mais-migracao-"));
    source = path.join(work, "prisma", "dev.db");
    mkdirSync(path.dirname(source), { recursive: true });
    copyFileSync(LEGACY, source);
    storageDir = path.join(work, "storage-novo");

    // Um documento com arquivo no disco e outro sem, para exercitar a cópia
    const db = new DatabaseSync(source);
    const trip = db.prepare(`SELECT id FROM "Trip" ORDER BY "createdAt" LIMIT 1`).get() as {
      id: string;
    };
    const ins = db.prepare(
      `INSERT INTO "TripDocument" (id, "tripId", title, category, "fileName", "filePath", "mimeType", size, "visibleToPassenger", "createdAt")
       VALUES (?, ?, ?, 'SEGURO', ?, ?, 'application/pdf', ?, 1, ?)`,
    );
    ins.run(
      "doc-ok",
      trip.id,
      "Apólice",
      "apolice.pdf",
      "trips/apolice.pdf",
      PDF.length,
      Date.now(),
    );
    ins.run("doc-sumido", trip.id, "Sumido", "sumido.pdf", "trips/sumido.pdf", 10, Date.now());
    legacyInvite =
      (db.prepare(`SELECT token, code FROM "Invite" LIMIT 1`).get() as
        { token: string; code: string } | undefined) ?? null;
    db.close();
    mkdirSync(path.join(work, "storage", "trips"), { recursive: true });
    writeFileSync(path.join(work, "storage", "trips", "apolice.pdf"), PDF);

    // Cliente de teste limpo (banco descartável)
    await prisma.messageDelivery.deleteMany({
      where: { dedupeKey: { startsWith: `legado:${SLUG}:` } },
    });
    await prisma.tenant.deleteMany({ where: { slug: SLUG } });
    if (legacyInvite)
      await prisma.registration.deleteMany({ where: { token: legacyInvite.token } });
    const ws = await prisma.workspace.upsert({
      where: { slug: "migracao-teste" },
      create: { slug: "migracao-teste", name: "Migração (teste)" },
      update: {},
    });
    const tenant = await prisma.tenant.create({
      data: { slug: SLUG, name: "ABIEC (teste)", workspaceId: ws.id },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    // Libera os tokens preservados para a migração "de verdade" no mesmo banco
    await prisma.messageDelivery.deleteMany({
      where: { dedupeKey: { startsWith: `legado:${SLUG}:` } },
    });
    await prisma.tenant.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
    if (work) rmSync(work, { recursive: true, force: true });
  });

  const run = (dryRun: boolean) =>
    runMigration({
      prisma,
      source,
      tenant: SLUG,
      dryRun,
      storageDir,
      encryptionKey: process.env.ENCRYPTION_KEY,
      target: "teste",
    });

  it("simulação não grava nada", async () => {
    const r = await run(true);
    expect(r.ok, r.error ?? "").toBe(true);
    expect(totals(r).created).toBeGreaterThan(0);
    expect(await counts(tenantId)).toMatchObject({ people: 0, projects: 0, registrations: 0 });
    expect(existsSync(storageDir)).toBe(false);
  });

  it("primeira execução cria e preserva tokens, códigos e arquivos", async () => {
    const r = await run(false);
    expect(r.ok, r.error ?? "").toBe(true);
    expect(r.entities.Project).toMatchObject({ read: 2, created: 2 });
    expect(r.entities.Flight).toMatchObject({ created: 1 });
    expect(r.entities.TravelRequest).toMatchObject({ created: 2 });
    expect(r.missingFiles.map((f) => f.path)).toEqual(["trips/sumido.pdf"]);

    const c = await counts(tenantId);
    expect(c).toMatchObject({
      projects: 2,
      registrations: 4,
      flights: 1,
      requests: 2,
      deliveries: 5,
      files: 1,
    });
    expect(c.people).toBeGreaterThanOrEqual(4);

    if (legacyInvite) {
      const reg = await prisma.registration.findUnique({ where: { token: legacyInvite.token } });
      expect(reg).toMatchObject({ tenantId, shortCode: legacyInvite.code, role: "GUEST" });
    }
    const file = await prisma.storedFile.findFirstOrThrow({ where: { tenantId } });
    expect(file).toMatchObject({ mimeType: "application/pdf", size: PDF.length });
    expect(existsSync(path.join(storageDir, file.storageKey))).toBe(true);
    const doc = await prisma.projectDocument.findFirstOrThrow({ where: { tenantId } });
    expect(doc).toMatchObject({ category: "INSURANCE", fileId: file.id });

    // Voo MAD→GRU digitado 22:45 (Madri) → 21:45 UTC
    const flight = await prisma.flight.findFirstOrThrow({ where: { tenantId } });
    expect(flight.departureAt?.toISOString()).toBe("2026-11-18T21:45:00.000Z");

    // PIN = CPF nunca vira senha; associado mantém o hash bcrypt
    const travelers = await prisma.person.findMany({ where: { tenantId, isMember: false } });
    expect(travelers.every((p) => p.passwordHash === null)).toBe(true);
    const member = await prisma.person.findFirstOrThrow({ where: { tenantId, isMember: true } });
    expect(member.passwordHash).toMatch(/^\$2[aby]\$/);

    // Nada para enviar
    expect(
      await prisma.messageDelivery.count({
        where: { tenantId, status: { in: ["QUEUED", "SENDING"] } },
      }),
    ).toBe(0);
    const quota = await prisma.companyQuota.findFirstOrThrow({ where: { tenantId } });
    expect(quota.provisionalPasswordEnc).toMatch(/^v1:/);
  });

  it("segunda execução é idempotente", async () => {
    const before = await counts(tenantId);
    const quota = await prisma.companyQuota.findFirstOrThrow({ where: { tenantId } });
    const r = await run(false);
    expect(r.ok, r.error ?? "").toBe(true);
    const created = Object.entries(r.entities).filter(([, c]) => c.created > 0);
    expect(created).toEqual([]);
    expect(totals(r).updated).toBeGreaterThan(0);
    expect(await counts(tenantId)).toEqual(before);
    const again = await prisma.companyQuota.findFirstOrThrow({ where: { tenantId } });
    expect(again.provisionalPasswordEnc).toBe(quota.provisionalPasswordEnc);
  });
});
