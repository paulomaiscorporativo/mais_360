import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  availableStatusActions,
  canWrite,
  consoleAccess,
  extendTrial,
  planStatusTransition,
  statusBanner,
  subscriptionStatusFor,
  WORKSPACE_STATUSES,
  type WorkspaceStatus,
} from "./status";

function prismaEnum(name: string): string[] {
  const file = fileURLToPath(new URL("../../../db/prisma/schema/core.prisma", import.meta.url));
  const body = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(readFileSync(file, "utf8"))?.[1] ?? "";
  return body
    .split("\n")
    .map((l) => l.replace(/\/\/.*/, "").trim())
    .filter(Boolean);
}

const now = new Date("2026-11-23T12:00:00Z");
const DAY = 86_400_000;

describe("situação do assinante", () => {
  it("espelha o enum WorkspaceStatus do banco", () => {
    expect([...WORKSPACE_STATUSES].sort()).toEqual(prismaEnum("WorkspaceStatus").sort());
  });

  it("lista as ações possíveis por situação", () => {
    expect(availableStatusActions("TRIAL")).toEqual([
      "ACTIVATE",
      "MARK_PAST_DUE",
      "SUSPEND",
      "CANCEL",
    ]);
    expect(availableStatusActions("ACTIVE")).toEqual(["MARK_PAST_DUE", "SUSPEND", "CANCEL"]);
    expect(availableStatusActions("PAST_DUE")).toEqual(["ACTIVATE", "SUSPEND", "CANCEL"]);
    expect(availableStatusActions("SUSPENDED")).toEqual(["REACTIVATE", "CANCEL"]);
    expect(availableStatusActions("CANCELED")).toEqual(["REACTIVATE"]);
  });

  it("toda situação tem saída, e nenhuma ação leva à própria situação de origem", () => {
    for (const s of WORKSPACE_STATUSES) {
      const actions = availableStatusActions(s);
      expect(actions.length).toBeGreaterThan(0);
      for (const a of actions) {
        const r = planStatusTransition(s, a, "motivo de teste");
        expect(r.ok && r.to).not.toBe(s);
      }
    }
  });

  it("exige motivo", () => {
    expect(planStatusTransition("ACTIVE", "SUSPEND", "   ")).toEqual({
      ok: false,
      error: expect.stringContaining("motivo"),
    });
    expect(planStatusTransition("ACTIVE", "SUSPEND", "abc")).toMatchObject({ ok: false });
    expect(planStatusTransition("ACTIVE", "SUSPEND", "x".repeat(501))).toMatchObject({
      ok: false,
    });
  });

  it("normaliza o motivo e devolve a transição", () => {
    expect(planStatusTransition("ACTIVE", "SUSPEND", "  Boleto   vencido  há 30 dias ")).toEqual({
      ok: true,
      from: "ACTIVE",
      to: "SUSPENDED",
      reason: "Boleto vencido há 30 dias",
    });
  });

  it("recusa transição inválida com mensagem clara", () => {
    const r = planStatusTransition("CANCELED", "SUSPEND", "tentativa inválida");
    expect(r).toEqual({ ok: false, error: 'Não é possível "suspender" um assinante cancelado.' });
    expect(planStatusTransition("ACTIVE", "ACTIVATE", "já está ativo")).toMatchObject({
      ok: false,
    });
  });

  it("acompanha a situação da assinatura", () => {
    expect(subscriptionStatusFor("TRIAL")).toBe("TRIALING");
    expect(subscriptionStatusFor("ACTIVE")).toBe("ACTIVE");
    expect(subscriptionStatusFor("PAST_DUE")).toBe("PAST_DUE");
    expect(subscriptionStatusFor("CANCELED")).toBe("CANCELED");
    expect(subscriptionStatusFor("SUSPENDED")).toBeNull();
  });
});

describe("efeito no console", () => {
  it("define o acesso por situação", () => {
    const access = Object.fromEntries(WORKSPACE_STATUSES.map((s) => [s, consoleAccess(s)]));
    expect(access).toEqual({
      TRIAL: "full",
      ACTIVE: "full",
      PAST_DUE: "full",
      SUSPENDED: "readonly",
      CANCELED: "blocked",
    });
    expect(canWrite("PAST_DUE")).toBe(true);
    expect(canWrite("SUSPENDED")).toBe(false);
    expect(canWrite("CANCELED")).toBe(false);
  });

  const ws = (status: WorkspaceStatus, trialEndsAt: Date | null = null) => ({
    name: "Agência X",
    status,
    trialEndsAt,
  });

  it("mostra faixa em pagamento pendente e suspensão", () => {
    expect(statusBanner(ws("PAST_DUE"), now)).toMatchObject({ tone: "warning" });
    expect(statusBanner(ws("SUSPENDED"), now)).toMatchObject({
      tone: "danger",
      title: expect.stringContaining("somente leitura"),
    });
    expect(statusBanner(ws("ACTIVE"), now)).toBeNull();
  });

  it("avisa o fim do teste só na última semana", () => {
    expect(statusBanner(ws("TRIAL", new Date(now.getTime() + 10 * DAY)), now)).toBeNull();
    expect(statusBanner(ws("TRIAL", new Date(now.getTime() + 3 * DAY)), now)?.message).toContain(
      "Faltam 3 dias",
    );
    expect(statusBanner(ws("TRIAL", new Date(now.getTime() + DAY)), now)?.message).toContain(
      "Falta",
    );
    expect(statusBanner(ws("TRIAL", new Date(now.getTime() - DAY)), now)?.title).toBe(
      "O período de teste terminou",
    );
    expect(statusBanner(ws("TRIAL"), now)).toBeNull();
  });
});

describe("extensão do teste", () => {
  it("soma ao fim atual quando ainda não venceu", () => {
    const end = new Date(now.getTime() + 5 * DAY);
    expect(extendTrial({ status: "TRIAL", trialEndsAt: end }, 10, now)).toEqual({
      ok: true,
      trialEndsAt: new Date(end.getTime() + 10 * DAY),
    });
  });

  it("conta a partir de hoje quando o teste já venceu ou não tinha fim", () => {
    const past = new Date(now.getTime() - 5 * DAY);
    expect(extendTrial({ status: "TRIAL", trialEndsAt: past }, 7, now)).toEqual({
      ok: true,
      trialEndsAt: new Date(now.getTime() + 7 * DAY),
    });
    expect(extendTrial({ status: "TRIAL", trialEndsAt: null }, 7, now)).toMatchObject({ ok: true });
  });

  it("só vale em teste e com dias válidos", () => {
    expect(extendTrial({ status: "ACTIVE", trialEndsAt: null }, 7, now)).toMatchObject({
      ok: false,
    });
    expect(extendTrial({ status: "TRIAL", trialEndsAt: null }, 0, now)).toMatchObject({
      ok: false,
    });
    expect(extendTrial({ status: "TRIAL", trialEndsAt: null }, 91, now)).toMatchObject({
      ok: false,
    });
    expect(extendTrial({ status: "TRIAL", trialEndsAt: null }, 1.5, now)).toMatchObject({
      ok: false,
    });
  });
});
