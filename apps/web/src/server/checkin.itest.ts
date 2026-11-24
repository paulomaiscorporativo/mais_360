import { randomBytes } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@mais/db";
import { checkInRegistration, undoCheckInRegistration } from "./checkin-core";

/**
 * Check-in do evento contra PostgreSQL real: vários leitores ao mesmo tempo,
 * isolamento entre clientes e convites cancelados.
 */

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL não definida.");
const db = new PrismaClient({ datasourceUrl: url });
afterAll(() => db.$disconnect());
beforeEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE TABLE "Workspace", "User", "Job" CASCADE`);
});

const rid = () => randomBytes(4).toString("hex");

async function seed(n = 1) {
  const ws = await db.workspace.create({
    data: { slug: `ws-${rid()}`, name: "Mais Corporativo", status: "ACTIVE" },
  });
  const tenant = await db.tenant.create({
    data: { workspaceId: ws.id, slug: `t-${rid()}`, name: "ABIEC" },
  });
  const project = await db.project.create({
    data: {
      tenantId: tenant.id,
      type: "CORPORATE_EVENT",
      name: "Jantar ABIEC 2026",
      slug: `p-${rid()}`,
    },
  });
  const regs = [];
  for (let i = 0; i < n; i++) {
    const person = await db.person.create({
      data: { tenantId: tenant.id, firstName: `Convidado${i}`, lastName: "Teste" },
    });
    regs.push(
      await db.registration.create({
        data: {
          tenantId: tenant.id,
          projectId: project.id,
          personId: person.id,
          role: "GUEST",
          status: "INVITED",
          token: `tok${rid()}${rid()}${i}`,
          shortCode: String(200_000 + i),
        },
      }),
    );
  }
  return { scope: { tenantId: tenant.id, projectId: project.id }, regs };
}

describe("check-in", () => {
  it("vinte leituras simultâneas do mesmo QR credenciam uma vez só", async () => {
    const { scope, regs } = await seed();
    const reg = regs[0]!;
    const qr = `https://abiec.mais.tur.br/c/${reg.token}`;
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, k) => checkInRegistration(db, scope, qr, `Leitor ${k}`)),
    );
    const fresh = results.filter((r) => r.ok && !r.already);
    const already = results.filter((r) => r.ok && r.already);
    expect(fresh).toHaveLength(1);
    expect(already).toHaveLength(19);
    const row = await db.registration.findUniqueOrThrow({ where: { id: reg.id } });
    expect(row.checkedInAt).not.toBeNull();
    expect(row.status).toBe("CONFIRMED");
    const winner = fresh[0];
    expect(winner?.ok && row.checkedInBy).toBeTruthy();
  });

  it("aceita o código curto e repete como já credenciado", async () => {
    const { scope, regs } = await seed();
    const first = await checkInRegistration(db, scope, regs[0]!.shortCode, "Recepção");
    expect(first).toMatchObject({ ok: true, already: false });
    const again = await checkInRegistration(db, scope, regs[0]!.shortCode, "Recepção");
    expect(again).toMatchObject({ ok: true, already: true });
  });

  it("não credencia convite de outro cliente nem cancelado", async () => {
    const a = await seed();
    const b = await seed();
    const cross = await checkInRegistration(db, a.scope, b.regs[0]!.token, "Recepção");
    expect(cross).toMatchObject({ ok: false });
    const untouched = await db.registration.findUniqueOrThrow({ where: { id: b.regs[0]!.id } });
    expect(untouched.checkedInAt).toBeNull();

    await db.registration.update({ where: { id: a.regs[0]!.id }, data: { status: "CANCELED" } });
    const canceled = await checkInRegistration(db, a.scope, a.regs[0]!.token, "Recepção");
    expect(canceled).toMatchObject({ ok: false, error: expect.stringContaining("cancelado") });
  });

  it("desfazer libera para credenciar de novo e é restrito ao cliente", async () => {
    const a = await seed();
    const b = await seed();
    const reg = a.regs[0]!;
    await checkInRegistration(db, a.scope, reg.token, "Recepção");
    expect(await undoCheckInRegistration(db, b.scope, reg.id)).toBe(false);
    expect(await undoCheckInRegistration(db, a.scope, reg.id)).toBe(true);
    expect(await undoCheckInRegistration(db, a.scope, reg.id)).toBe(false);
    const again = await checkInRegistration(db, a.scope, reg.token, "Recepção");
    expect(again).toMatchObject({ ok: true, already: false });
  });

  it("leitura inválida não consulta nada útil", async () => {
    const { scope } = await seed();
    expect(await checkInRegistration(db, scope, "   ", "Recepção")).toMatchObject({ ok: false });
    expect(await checkInRegistration(db, scope, "abc", "Recepção")).toMatchObject({ ok: false });
  });

  it("com régua de check-in ativa, enfileira um acontecimento por credenciamento", async () => {
    const { scope, regs } = await seed();
    const qr = `https://abiec.mais.tur.br/c/${regs[0]!.token}`;
    const tpl = await db.messageTemplate.create({
      data: { tenantId: scope.tenantId, name: "Boas-vindas", emailSubject: "Oi", emailBody: "Oi" },
    });
    await db.messageAutomation.create({
      data: { ...scope, templateId: tpl.id, trigger: "CHECKED_IN", channels: ["EMAIL"] },
    });
    await Promise.all(
      Array.from({ length: 10 }, (_, k) => checkInRegistration(db, scope, qr, `Leitor ${k}`)),
    );
    const jobs = await db.job.findMany({ where: { queue: "automations.event" } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.uniqueKey).toBe(`automation-event:CHECKED_IN:${regs[0]!.id}`);
  });
});
