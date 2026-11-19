import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { enqueueJob } from "../../../packages/messaging/src/jobs";
import { resetDb, testDb } from "../../../packages/messaging/src/testing/fixtures";
import { backoffMs, JobRunner } from "./runner";

const db = testDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const quiet = { info: () => {}, warn: () => {}, error: () => {} };

describe("JobRunner", () => {
  it("dois workers concorrentes executam cada job exatamente uma vez", async () => {
    for (let i = 0; i < 60; i++) await enqueueJob(db, { queue: "test.count", payload: { i } });
    const executed: number[] = [];
    const handler = async (p: unknown) => {
      await new Promise((r) => setTimeout(r, 5));
      executed.push((p as { i: number }).i);
    };
    const a = new JobRunner({
      db,
      workerId: "A",
      concurrency: 5,
      handlers: { "test.count": handler },
      logger: quiet,
    });
    const b = new JobRunner({
      db,
      workerId: "B",
      concurrency: 5,
      handlers: { "test.count": handler },
      logger: quiet,
    });
    const drain = async (r: JobRunner) => {
      while ((await r.runOnce()) > 0);
    };
    await Promise.all([drain(a), drain(b), drain(a)]);

    expect(executed).toHaveLength(60);
    expect(new Set(executed).size).toBe(60);
    expect(await db.job.count({ where: { status: "DONE" } })).toBe(60);
  });

  it("reagenda quando o handler pede e só pega jobs das filas que conhece", async () => {
    const later = new Date(Date.now() + 3_600_000);
    await enqueueJob(db, { queue: "test.resched", uniqueKey: "r1" });
    await enqueueJob(db, { queue: "outra.fila" });
    const r = new JobRunner({
      db,
      handlers: { "test.resched": async () => ({ reschedule: later }) },
      logger: quiet,
    });
    expect(await r.runOnce()).toBe(1);
    const j = await db.job.findUniqueOrThrow({ where: { uniqueKey: "r1" } });
    expect([j.status, j.runAt.toISOString(), j.attempts]).toEqual([
      "PENDING",
      later.toISOString(),
      0,
    ]);
    expect(await r.runOnce()).toBe(0); // ainda não chegou a hora; a outra fila não é dele
  });

  it("falha → nova tentativa com backoff; esgotou → DEAD", async () => {
    await enqueueJob(db, { queue: "test.fail", uniqueKey: "f1", maxAttempts: 2 });
    const r = new JobRunner({
      db,
      handlers: {
        "test.fail": async () => {
          throw new Error("quebrou");
        },
      },
      logger: quiet,
    });
    await r.runOnce();
    let j = await db.job.findUniqueOrThrow({ where: { uniqueKey: "f1" } });
    expect(j.status).toBe("PENDING");
    expect(j.lastError).toBe("quebrou");
    expect(j.runAt.getTime()).toBeGreaterThan(Date.now());
    await db.job.update({ where: { id: j.id }, data: { runAt: new Date(Date.now() - 1000) } });
    await r.runOnce();
    j = await db.job.findUniqueOrThrow({ where: { uniqueKey: "f1" } });
    expect(j.status).toBe("DEAD");
  });

  it("devolve à fila jobs com trava vencida", async () => {
    await enqueueJob(db, { queue: "test.stale", uniqueKey: "s1" });
    await db.job.update({
      where: { uniqueKey: "s1" },
      data: { status: "RUNNING", lockedBy: "morto", lockedAt: new Date(Date.now() - 3_600_000) },
    });
    const r = new JobRunner({
      db,
      handlers: { "test.stale": async () => {} },
      lockTimeoutMs: 60_000,
      logger: quiet,
    });
    expect(await r.reclaimStale()).toBe(1);
    expect(await r.runOnce()).toBe(1);
  });

  it("stop() espera o job em andamento terminar", async () => {
    await enqueueJob(db, { queue: "test.slow" });
    let finished = false;
    const r = new JobRunner({
      db,
      pollIntervalMs: 20,
      handlers: {
        "test.slow": async () => {
          await new Promise((res) => setTimeout(res, 300));
          finished = true;
        },
      },
      logger: quiet,
    });
    r.start();
    await new Promise((res) => setTimeout(res, 100));
    await r.stop();
    expect(finished).toBe(true);
    expect(await db.job.count({ where: { status: "DONE" } })).toBe(1);
  });

  it("backoff cresce e tem teto", () => {
    expect(backoffMs(1, () => 0.5)).toBe(5_000);
    expect(backoffMs(3, () => 0.5)).toBe(20_000);
    expect(backoffMs(20, () => 0.5)).toBe(900_000);
  });
});
