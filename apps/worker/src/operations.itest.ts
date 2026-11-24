import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cleanupConfigFromEnv } from "@mais/core/ops";
import { enqueueJob } from "../../../packages/messaging/src/jobs";
import { resetDb, testDb } from "../../../packages/messaging/src/testing/fixtures";
import { runCleanup } from "./cleanup";
import { Heartbeat } from "./heartbeat";
import { JobRunner } from "./runner";
import { Scheduler } from "./schedule";

/**
 * Operação do worker contra PostgreSQL real: tarefa periódica com vários
 * workers, recuperação por sinal de vida, desligamento com prazo e limpeza.
 */

const db = testDb();
afterAll(() => db.$disconnect());
beforeEach(async () => {
  await resetDb(db);
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE "WorkerHeartbeat", "ScheduledTask", "RateLimitBucket", "Session", "UserAccessToken", "AuditLog" CASCADE`,
  );
});

const quiet = { info: () => {}, warn: () => {}, error: () => {} };
const DAY = 86_400_000;

describe("agendador", () => {
  it("dois workers ao mesmo tempo: cada janela roda uma vez só", async () => {
    let runs = 0;
    const task = {
      name: "test.task",
      everyMs: 60_000,
      run: async () => {
        runs++;
        await new Promise((r) => setTimeout(r, 30));
        return { ok: true };
      },
    };
    const a = new Scheduler({ db, workerId: "A", tasks: [task], logger: quiet });
    const b = new Scheduler({ db, workerId: "B", tasks: [task], logger: quiet });
    const ran = await Promise.all([a.tick(), b.tick(), a.tick(), b.tick()]);
    expect(runs).toBe(1);
    expect(ran.flat()).toEqual(["test.task"]);
    // Ainda dentro da janela: ninguém roda de novo
    expect([...(await a.tick()), ...(await b.tick())]).toEqual([]);
    const row = await db.scheduledTask.findUniqueOrThrow({ where: { name: "test.task" } });
    expect(row.status).toBe("OK");
    expect(row.lockedBy).toBe("");
    expect(row.lastResult).toEqual({ ok: true });
    // Janela vencida: roda de novo (em um dos dois)
    await db.scheduledTask.update({
      where: { name: "test.task" },
      data: { nextRunAt: new Date(Date.now() - 1000) },
    });
    await Promise.all([a.tick(), b.tick()]);
    expect(runs).toBe(2);
  });

  it("trava ativa de um worker que morreu impede outro até vencer", async () => {
    let runs = 0;
    const task = { name: "test.lease", everyMs: 60_000, run: async () => void runs++ };
    await db.scheduledTask.create({
      data: {
        name: "test.lease",
        everyMs: 60_000,
        nextRunAt: new Date(Date.now() - 1000),
        lockedBy: "morto",
        lockedUntil: new Date(Date.now() + 60_000),
        status: "RUNNING",
      },
    });
    const s = new Scheduler({ db, workerId: "C", tasks: [task], logger: quiet });
    expect(await s.tick()).toEqual([]);
    await db.scheduledTask.update({
      where: { name: "test.lease" },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    expect(await s.tick()).toEqual(["test.lease"]);
    expect(runs).toBe(1);
  });

  it("erro da tarefa fica registrado e libera a trava", async () => {
    const s = new Scheduler({
      db,
      workerId: "D",
      tasks: [
        {
          name: "test.err",
          everyMs: 60_000,
          run: async () => {
            throw new Error("quebrou");
          },
        },
      ],
      logger: quiet,
    });
    await s.tick();
    const row = await db.scheduledTask.findUniqueOrThrow({ where: { name: "test.err" } });
    expect([row.status, row.lastError, row.lockedBy]).toEqual(["ERROR", "quebrou", ""]);
  });
});

describe("recuperação de jobs", () => {
  it("job de worker sem sinal de vida volta para a fila; sem tentativas, vira DEAD", async () => {
    await enqueueJob(db, { queue: "test.r", uniqueKey: "vivo" });
    await enqueueJob(db, { queue: "test.r", uniqueKey: "ok" });
    await enqueueJob(db, { queue: "test.r", uniqueKey: "ultima", maxAttempts: 2 });
    const recent = new Date();
    await db.job.update({
      where: { uniqueKey: "vivo" },
      data: { status: "RUNNING", lockedBy: "w-vivo", lockedAt: recent, attempts: 1 },
    });
    await db.job.update({
      where: { uniqueKey: "ok" },
      data: { status: "RUNNING", lockedBy: "w-morto", lockedAt: recent, attempts: 1 },
    });
    await db.job.update({
      where: { uniqueKey: "ultima" },
      data: { status: "RUNNING", lockedBy: "w-morto", lockedAt: recent, attempts: 2 },
    });
    const hb = (workerId: string, ageMs: number) => ({
      workerId,
      hostname: "h",
      pid: 1,
      queues: ["test.r"],
      startedAt: new Date(Date.now() - DAY),
      lastSeenAt: new Date(Date.now() - ageMs),
    });
    await db.workerHeartbeat.createMany({ data: [hb("w-vivo", 5_000), hb("w-morto", 5 * 60_000)] });

    const r = new JobRunner({ db, handlers: { "test.r": async () => {} }, logger: quiet });
    expect(await r.reclaimStale()).toBe(2);
    const by = async (k: string) =>
      (await db.job.findUniqueOrThrow({ where: { uniqueKey: k } })).status;
    expect(await by("vivo")).toBe("RUNNING");
    expect(await by("ok")).toBe("PENDING");
    expect(await by("ultima")).toBe("DEAD");
  });

  it("sinal de vida grava a instância, renova a trava e marca o encerramento", async () => {
    await enqueueJob(db, { queue: "test.hb", uniqueKey: "h1" });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const r = new JobRunner({
      db,
      workerId: "W1",
      pollIntervalMs: 20,
      handlers: { "test.hb": () => gate },
      logger: quiet,
    });
    r.start();
    await new Promise((res) => setTimeout(res, 150));
    const old = new Date(Date.now() - 3_600_000);
    await db.job.update({ where: { uniqueKey: "h1" }, data: { lockedAt: old } });
    const hb = new Heartbeat({
      db,
      workerId: "W1",
      queues: () => r.queues,
      renewLeases: () => r.renewLeases(),
      healthFile: null,
      version: "teste",
      logger: quiet,
    });
    expect(await hb.beat()).toBe(true);
    const job = await db.job.findUniqueOrThrow({ where: { uniqueKey: "h1" } });
    expect(job.lockedAt!.getTime()).toBeGreaterThan(old.getTime());
    const row = await db.workerHeartbeat.findUniqueOrThrow({ where: { workerId: "W1" } });
    expect([row.version, row.queues, row.stoppedAt]).toEqual(["teste", ["test.hb"], null]);
    release();
    await r.stop();
    await hb.stop();
    expect(
      (await db.workerHeartbeat.findUniqueOrThrow({ where: { workerId: "W1" } })).stoppedAt,
    ).not.toBeNull();
  });

  it("desligamento com prazo esgotado devolve o job à fila sem gastar tentativa", async () => {
    await enqueueJob(db, { queue: "test.slow", uniqueKey: "s1" });
    const r = new JobRunner({
      db,
      workerId: "W2",
      pollIntervalMs: 20,
      handlers: { "test.slow": () => new Promise(() => {}) },
      logger: quiet,
    });
    r.start();
    await new Promise((res) => setTimeout(res, 150));
    expect(await r.stop({ timeoutMs: 100 })).toEqual({ released: 1 });
    const j = await db.job.findUniqueOrThrow({ where: { uniqueKey: "s1" } });
    expect([j.status, j.attempts, j.lockedBy]).toEqual(["PENDING", 0, ""]);
  });
});

describe("limpeza", () => {
  it("apaga só o que venceu e nunca toca auditoria nem entregas", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 90 * DAY);
    const user = await db.user.create({
      data: { email: "limpeza@teste.dev", name: "Limpeza", passwordHash: "x" },
    });
    await db.session.createMany({
      data: [
        { kind: "USER", userId: user.id, expiresAt: old },
        { kind: "USER", userId: user.id, expiresAt: new Date(now.getTime() + DAY) },
        { kind: "USER", userId: user.id, expiresAt: new Date(now.getTime() + DAY), revokedAt: old },
        // Revogada há pouco: ainda fica
        { kind: "USER", userId: user.id, expiresAt: new Date(now.getTime() + DAY), revokedAt: now },
      ],
    });
    await db.userAccessToken.createMany({
      data: [
        { userId: user.id, purpose: "INVITE", tokenHash: "a", expiresAt: old },
        {
          userId: user.id,
          purpose: "INVITE",
          tokenHash: "b",
          expiresAt: new Date(now.getTime() + DAY),
        },
      ],
    });
    for (let i = 0; i < 25; i++) await enqueueJob(db, { queue: "test.c", uniqueKey: `d${i}` });
    await db.job.updateMany({ data: { status: "DONE" } });
    await db.$executeRaw`UPDATE "Job" SET "updatedAt" = ${old}`;
    await enqueueJob(db, { queue: "test.c", uniqueKey: "recente" });
    await enqueueJob(db, { queue: "test.c", uniqueKey: "morto" });
    await db.$executeRaw`UPDATE "Job" SET status = 'DEAD', "updatedAt" = ${new Date(now.getTime() - 30 * DAY)} WHERE "uniqueKey" = 'morto'`;
    await db.rateLimitBucket.createMany({
      data: [
        { key: "velho", count: 3, windowStart: old, resetAt: old },
        { key: "atual", count: 1, windowStart: now, resetAt: new Date(now.getTime() + 60_000) },
      ],
    });
    await db.auditLog.create({ data: { action: "teste.antigo", createdAt: old } });

    const counts = await runCleanup(
      db,
      cleanupConfigFromEnv({ CLEANUP_BATCH_SIZE: "10" }),
      now,
      quiet,
    );
    expect(counts).toMatchObject({
      sessions: 2,
      userAccessTokens: 1,
      jobsDone: 25,
      jobsFailed: 0,
      rateLimitBuckets: 1,
    });
    expect(await db.session.count()).toBe(2);
    expect(await db.job.count()).toBe(2); // recente + DEAD de 30 dias (prazo de 60)
    expect(await db.rateLimitBucket.findUnique({ where: { key: "atual" } })).not.toBeNull();
    expect(await db.auditLog.count()).toBe(1);
  });
});
