import { describe, expect, it } from "vitest";
import {
  EXTERNALLY_SERVED_QUEUES,
  unservedQueues,
  workerFleet,
  workerState,
  type HeartbeatView,
} from "./health";
import { isJobOverdue, jobActionProblem, queueLabel, staleJobOutcome } from "./jobs";
import { maskEmail, maskPayload, maskPhone, maskText, payloadSummary } from "./mask";
import { assertRateLimitParams, rateLimitDecision, retryAfterMinutes } from "./rate-limit";
import { cleanupConfigFromEnv, cleanupCutoffs } from "./retention";
import { isTaskLate, nextRunAt, taskLeaseMs } from "./schedule";

const now = new Date("2026-11-23T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("saúde do worker", () => {
  const hb = (id: string, ageMs: number, extra: Partial<HeartbeatView> = {}): HeartbeatView => ({
    workerId: id,
    lastSeenAt: ago(ageMs),
    stoppedAt: null,
    queues: ["a", "b"],
    ...extra,
  });

  it("classifica pelo tempo desde o último sinal", () => {
    expect(workerState(hb("x", 10_000), now)).toBe("ALIVE");
    expect(workerState(hb("x", 90_000), now)).toBe("LATE");
    expect(workerState(hb("x", 121_000), now)).toBe("LOST");
    expect(workerState(hb("x", 1_000, { stoppedAt: ago(500) }), now)).toBe("STOPPED");
  });

  it("frota sem instância viva fica em alerta", () => {
    const fleet = workerFleet([hb("a", 200_000), hb("b", 5_000, { stoppedAt: ago(1) })], now);
    expect(fleet.down).toBe(true);
    expect(fleet.alive).toBe(0);
    expect(fleet.lastSeenAt?.getTime()).toBe(ago(5_000).getTime());
  });

  it("aponta filas com trabalho vencido sem nenhum worker vivo atendendo", () => {
    const fleet = workerFleet([hb("a", 1_000, { queues: ["a"] })], now);
    const due = new Map([
      ["a", 3],
      ["c", 2],
      ["d", 0],
      ["vouchers.issue", 4],
    ]);
    expect(unservedQueues(due, fleet)).toEqual(["c"]);
    expect(EXTERNALLY_SERVED_QUEUES.has("vouchers.issue")).toBe(true);
    // Com a frota parada, o alerta principal já cobre: não repete por fila
    expect(unservedQueues(due, workerFleet([], now))).toEqual([]);
  });
});

describe("jobs", () => {
  it("atrasado é PENDING vencido há mais de 5 min", () => {
    expect(isJobOverdue({ status: "PENDING", runAt: ago(6 * 60_000) }, now)).toBe(true);
    expect(isJobOverdue({ status: "PENDING", runAt: ago(60_000) }, now)).toBe(false);
    expect(isJobOverdue({ status: "RUNNING", runAt: ago(3_600_000) }, now)).toBe(false);
  });

  it("job abandonado volta para a fila ou vira falha definitiva", () => {
    expect(staleJobOutcome({ attempts: 1, maxAttempts: 5 })).toBe("PENDING");
    expect(staleJobOutcome({ attempts: 5, maxAttempts: 5 })).toBe("DEAD");
  });

  it("só falhas definitivas podem ser repetidas ou descartadas", () => {
    expect(jobActionProblem("DEAD", "retry")).toBeNull();
    expect(jobActionProblem("FAILED", "discard")).toBeNull();
    expect(jobActionProblem("RUNNING", "retry")).toMatch(/em execução/);
    expect(jobActionProblem("DONE", "discard")).toMatch(/concluído/);
    expect(jobActionProblem("PENDING", "retry")).toMatch(/já está na fila/);
  });

  it("nome legível da fila", () => {
    expect(queueLabel("auth.email")).toBe("E-mails de acesso");
    expect(queueLabel("fila.nova")).toBe("fila.nova");
  });
});

describe("máscara de dados pessoais e segredos", () => {
  it("e-mail e telefone", () => {
    expect(maskEmail("paulo.cardoso@mais.tur.br")).toBe("p•••@mais.tur.br");
    expect(maskPhone("+55 11 91234-5678")).toBe("•••5678");
  });

  it("texto livre com e-mail, telefone e token", () => {
    const token = "a".repeat(20) + "B".repeat(23);
    const out = maskText(
      `Destinatário recusado: ana@cliente.com.br (11) 91234-5678 https://x.com/entrar/convite/${token}`,
    );
    expect(out).not.toContain("ana@");
    expect(out).toContain("a•••@cliente.com.br");
    expect(out).not.toContain("91234-5678");
    expect(out).not.toContain(token);
  });

  it("payload do e-mail de acesso não vaza destinatário nem link", () => {
    const masked = maskPayload({
      kind: "INVITE",
      to: "joao.silva@empresa.com",
      recipientName: "João da Silva",
      link: "https://360.mais.tur.br/entrar/convite/abc",
      tokenId: "cmabc123",
      brand: { name: "ABIEC", color: "#002042" },
    }) as Record<string, unknown>;
    expect(masked.kind).toBe("INVITE");
    expect(masked.to).toBe("j•••@empresa.com");
    expect(masked.recipientName).toBe("J. d. S.");
    expect(masked.link).toBe("•••");
    expect(masked.tokenId).toBe("cmabc123");
  });

  it("corta listas e textos longos", () => {
    const masked = maskPayload({
      registrationIds: Array.from({ length: 40 }, (_, i) => `r${i}`),
      template: { body: "x".repeat(300) },
    }) as Record<string, unknown>;
    expect(masked.registrationIds).toBe("40 itens");
    expect(((masked.template as Record<string, string>).body ?? "").length).toBeLessThanOrEqual(80);
    expect(payloadSummary({ a: "b".repeat(10) }, 10)).toHaveLength(10);
  });
});

describe("limite de tentativas", () => {
  const resetAt = new Date(now.getTime() + 5 * 60_000);
  it("permite até o limite e informa quanto falta", () => {
    expect(rateLimitDecision({ count: 1, limit: 3, resetAt, now })).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterMs: 0,
    });
    expect(rateLimitDecision({ count: 3, limit: 3, resetAt, now }).allowed).toBe(true);
  });

  it("acima do limite recusa até o fim da janela", () => {
    expect(rateLimitDecision({ count: 4, limit: 3, resetAt, now })).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterMs: 5 * 60_000,
    });
  });

  it("valida parâmetros e arredonda minutos para cima", () => {
    expect(() => assertRateLimitParams(0, 60_000)).toThrow();
    expect(() => assertRateLimitParams(3, 10)).toThrow();
    expect(retryAfterMinutes(1)).toBe(1);
    expect(retryAfterMinutes(61_000)).toBe(2);
  });
});

describe("retenção da limpeza", () => {
  it("usa os padrões e aceita ajuste por variável", () => {
    expect(cleanupConfigFromEnv({})).toEqual({
      sessionDays: 30,
      tokenDays: 30,
      jobDoneDays: 14,
      jobFailedDays: 60,
      heartbeatDays: 7,
      batchSize: 1000,
    });
    expect(cleanupConfigFromEnv({ CLEANUP_JOB_DONE_DAYS: "3" }).jobDoneDays).toBe(3);
  });

  it("valor inválido é recusado com o nome do campo", () => {
    expect(() => cleanupConfigFromEnv({ CLEANUP_JOB_FAILED_DAYS: "zero" })).toThrow(
      /jobFailedDays/,
    );
    expect(() => cleanupConfigFromEnv({ CLEANUP_SESSION_DAYS: "0" })).toThrow();
  });

  it("calcula os cortes a partir de agora", () => {
    const c = cleanupCutoffs(cleanupConfigFromEnv({}), now);
    expect(c.jobDone.toISOString()).toBe("2026-11-09T12:00:00.000Z");
    expect(c.session.toISOString()).toBe("2026-10-24T12:00:00.000Z");
  });
});

describe("agendador", () => {
  it("próximo horário e trava", () => {
    expect(nextRunAt(now, 60_000).getTime()).toBe(now.getTime() + 60_000);
    expect(taskLeaseMs(60_000)).toBe(60_000);
    expect(taskLeaseMs(86_400_000)).toBe(30 * 60_000);
    expect(taskLeaseMs(5 * 60_000, 10)).toBe(60_000);
  });

  it("tarefa atrasada", () => {
    expect(isTaskLate({ nextRunAt: ago(3 * 60_000), everyMs: 60_000 }, now)).toBe(true);
    expect(isTaskLate({ nextRunAt: ago(60_000), everyMs: 5 * 60_000 }, now)).toBe(false);
  });
});
