import { randomBytes } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, testDb } from "../../../packages/messaging/src/testing/fixtures";
import { checkDomain, sweepDomains, type DnsResolver, type DomainConfig } from "./domains";

const db = testDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const config: DomainConfig = {
  target: "clientes.mais.tur.br",
  platformDomains: ["mais.tur.br"],
};
const DAY = 86_400_000;
const now = new Date("2026-11-23T12:00:00Z");
const rid = () => randomBytes(4).toString("hex");

function resolver(records: { token?: string; routed: boolean }): DnsResolver {
  const notFound = () => Promise.reject(Object.assign(new Error("x"), { code: "ENOTFOUND" }));
  return {
    resolveTxt: () =>
      records.token ? Promise.resolve([[`mais360-verificacao=${records.token}`]]) : notFound(),
    resolveCname: () => (records.routed ? Promise.resolve([config.target]) : notFound()),
    resolve4: (h) =>
      h === config.target || records.routed ? Promise.resolve(["203.0.113.7"]) : notFound(),
    resolve6: () => notFound(),
  };
}

async function tenantWithDomain(domain: {
  hostname?: string;
  status?: "PENDING" | "VERIFIED" | "FAILED";
  primary?: boolean;
  createdAt?: Date;
  lastCheckedAt?: Date | null;
}) {
  const ws = await db.workspace.create({ data: { slug: `ws-${rid()}`, name: "Agência" } });
  const tenant = await db.tenant.create({
    data: { workspaceId: ws.id, slug: `t-${rid()}`, name: "Cliente" },
  });
  const d = await db.tenantDomain.create({
    data: {
      tenantId: tenant.id,
      hostname: domain.hostname ?? `eventos-${rid()}.cliente.com.br`,
      status: domain.status ?? "PENDING",
      primary: domain.primary ?? false,
      verificationToken: "tok-123",
      verifiedAt: domain.status === "VERIFIED" ? new Date(now.getTime() - 10 * DAY) : null,
      createdAt: domain.createdAt ?? new Date(now.getTime() - DAY),
      lastCheckedAt: domain.lastCheckedAt ?? null,
    },
  });
  return { tenant, domain: d };
}

describe("verificação de domínios (worker)", () => {
  it("pendente com TXT e CNAME vira verificado e registra auditoria", async () => {
    const { domain } = await tenantWithDomain({});
    const r = await checkDomain(
      db,
      resolver({ token: "tok-123", routed: true }),
      domain.id,
      config,
      now,
    );
    expect(r).toMatchObject({ checked: true, status: "VERIFIED", gained: true });
    const saved = await db.tenantDomain.findUniqueOrThrow({ where: { id: domain.id } });
    expect(saved).toMatchObject({ status: "VERIFIED", lastError: "", lastCheckedAt: now });
    expect(saved.verifiedAt).toEqual(now);
    const logs = await db.auditLog.findMany({ where: { entityId: domain.id } });
    expect(logs.map((l) => l.action)).toEqual(["tenant.domain.verified"]);
  });

  it("pendente sem registros continua pendente com explicação", async () => {
    const { domain } = await tenantWithDomain({});
    const r = await checkDomain(db, resolver({ routed: false }), domain.id, config, now);
    expect(r).toMatchObject({ status: "PENDING" });
    const saved = await db.tenantDomain.findUniqueOrThrow({ where: { id: domain.id } });
    expect(saved.lastError).toContain("CNAME");
    expect(await db.auditLog.count()).toBe(0);
  });

  it("verificado principal que perde o apontamento vira FAILED e deixa de ser principal", async () => {
    const { domain } = await tenantWithDomain({ status: "VERIFIED", primary: true });
    const r = await checkDomain(db, resolver({ routed: false }), domain.id, config, now);
    expect(r).toMatchObject({ status: "FAILED", lost: true });
    const saved = await db.tenantDomain.findUniqueOrThrow({ where: { id: domain.id } });
    expect(saved).toMatchObject({ status: "FAILED", primary: false });
    const log = await db.auditLog.findFirstOrThrow({ where: { entityId: domain.id } });
    expect(log).toMatchObject({ action: "tenant.domain.lost", actorType: "SYSTEM" });
  });

  it("endereço da plataforma não é consultado", async () => {
    const { domain } = await tenantWithDomain({
      hostname: `x${rid()}.mais.tur.br`,
      status: "VERIFIED",
    });
    const r = await checkDomain(db, resolver({ routed: false }), domain.id, config, now);
    expect(r).toEqual({ checked: false, reason: "platform" });
  });

  it("a varredura enfileira só o que está na hora, sem duplicar", async () => {
    const due = await tenantWithDomain({});
    await tenantWithDomain({ lastCheckedAt: new Date(now.getTime() - 60_000) }); // consultado agora há pouco
    const daily = await tenantWithDomain({
      status: "VERIFIED",
      lastCheckedAt: new Date(now.getTime() - 2 * DAY),
    });
    await tenantWithDomain({
      status: "VERIFIED",
      lastCheckedAt: new Date(now.getTime() - 3_600_000),
    });
    await tenantWithDomain({ status: "FAILED" });
    await tenantWithDomain({ hostname: `y${rid()}.mais.tur.br`, status: "VERIFIED" });

    expect(await sweepDomains(db, config, now)).toBe(2);
    expect(await sweepDomains(db, config, now)).toBe(2); // de novo: mesmo uniqueKey
    const jobs = await db.job.findMany({ where: { queue: "domains.verify" } });
    expect(jobs.map((j) => (j.payload as { domainId: string }).domainId).sort()).toEqual(
      [due.domain.id, daily.domain.id].sort(),
    );
  });
});
