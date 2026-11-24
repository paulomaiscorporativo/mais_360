import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@mais/db";
import { clearRateLimit, hitRateLimit, rateLimitKeyHash } from "./rate-limit-store";

/**
 * Limite de tentativas no Postgres: atômico com requisições simultâneas,
 * compartilhado entre "nós" (clientes de banco diferentes) e sem dado pessoal
 * em claro.
 */

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL não definida.");
const db = new PrismaClient({ datasourceUrl: url });
const otherNode = new PrismaClient({ datasourceUrl: url });
afterAll(async () => {
  await db.$disconnect();
  await otherNode.$disconnect();
});
beforeEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE TABLE "RateLimitBucket"`);
});

describe("limite de tentativas no banco", () => {
  it("50 tentativas simultâneas: exatamente o limite passa", async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        hitRateLimit(i % 2 ? db : otherNode, "login:ana@cliente.com:1.2.3.4", 6, 60_000),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(6);
    const denied = results.find((r) => !r.allowed)!;
    expect(denied.retryAfterMs).toBeGreaterThan(50_000);
    expect(denied.remaining).toBe(0);
  });

  it("guarda só o hash da chave", async () => {
    await hitRateLimit(db, "forgot:email:ana@cliente.com", 3, 60_000);
    const rows = await db.rateLimitBucket.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBe(rateLimitKeyHash("forgot:email:ana@cliente.com"));
    expect(rows[0]!.key).not.toContain("ana");
  });

  it("janela vencida recomeça; zerar libera na hora", async () => {
    for (let i = 0; i < 3; i++) await hitRateLimit(db, "k", 2, 60_000);
    expect((await hitRateLimit(db, "k", 2, 60_000)).allowed).toBe(false);
    await db.rateLimitBucket.updateMany({ data: { resetAt: new Date(Date.now() - 1000) } });
    const fresh = await hitRateLimit(db, "k", 2, 60_000);
    expect([fresh.allowed, fresh.remaining]).toEqual([true, 1]);
    await hitRateLimit(db, "k", 2, 60_000);
    expect((await hitRateLimit(db, "k", 2, 60_000)).allowed).toBe(false);
    await clearRateLimit(db, "k");
    expect((await hitRateLimit(db, "k", 2, 60_000)).allowed).toBe(true);
  });

  it("chaves diferentes não se misturam", async () => {
    for (let i = 0; i < 2; i++) await hitRateLimit(db, "a", 2, 60_000);
    expect((await hitRateLimit(db, "a", 2, 60_000)).allowed).toBe(false);
    expect((await hitRateLimit(db, "b", 2, 60_000)).allowed).toBe(true);
  });
});
