import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@mais/db";
import { AUTH_EMAIL_QUEUE } from "@mais/core";
import { authEmailJobHandlers, withDisplayName, type SendEmail } from "./auth-email";
import type { ClaimedJob } from "./runner";

const job: ClaimedJob = {
  id: "j1",
  queue: AUTH_EMAIL_QUEUE,
  payload: {},
  attempts: 1,
  maxAttempts: 5,
};
const silent = { info: () => {}, warn: () => {}, error: () => {} };

function fakeDb(token: unknown) {
  return {
    userAccessToken: { findUnique: vi.fn(async () => token) },
  } as unknown as PrismaClient;
}

const payload = {
  kind: "INVITE",
  to: "outro@exemplo.com",
  recipientName: "Ana Souza",
  link: "http://localhost:3371/entrar/convite/abc",
  tokenId: "t1",
  brand: { name: "Mais 360", color: "#002042" },
};

const validToken = (over: Record<string, unknown> = {}) => ({
  purpose: "INVITE",
  expiresAt: new Date(Date.now() + 60_000),
  usedAt: null,
  revokedAt: null,
  user: { active: true, email: "ana@exemplo.com" },
  ...over,
});

describe("fila auth.email", () => {
  it("envia para o dono do token, com a marca no remetente", async () => {
    const send = vi.fn<SendEmail>(async () => {});
    const handler = authEmailJobHandlers(fakeDb(validToken()), send, silent)[AUTH_EMAIL_QUEUE]!;
    await handler(payload, job);
    expect(send).toHaveBeenCalledOnce();
    const msg = send.mock.calls[0]![0];
    expect(msg.to).toBe("ana@exemplo.com");
    expect(msg.fromName).toBe("Mais 360");
    expect(msg.text).toContain(payload.link);
  });

  it("descarta e-mail de token usado, revogado ou de conta desativada", async () => {
    for (const token of [
      validToken({ usedAt: new Date() }),
      validToken({ revokedAt: new Date() }),
      validToken({ user: { active: false, email: "ana@exemplo.com" } }),
      null,
    ]) {
      const send = vi.fn<SendEmail>(async () => {});
      await authEmailJobHandlers(fakeDb(token), send, silent)[AUTH_EMAIL_QUEUE]!(payload, job);
      expect(send).not.toHaveBeenCalled();
    }
  });

  it("aviso de novo acesso não depende de token", async () => {
    const send = vi.fn<SendEmail>(async () => {});
    const db = fakeDb(null);
    const { tokenId: _ignored, ...grant } = payload;
    await authEmailJobHandlers(db, send, silent)[AUTH_EMAIL_QUEUE]!(
      { ...grant, kind: "ACCESS_GRANTED" },
      job,
    );
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0].to).toBe("outro@exemplo.com");
  });

  it("payload inválido falha (e o runner tenta de novo/encerra)", async () => {
    const handler = authEmailJobHandlers(fakeDb(null), async () => {}, silent)[AUTH_EMAIL_QUEUE]!;
    await expect(handler({ kind: "INVITE" }, job)).rejects.toThrow();
  });
});

describe("withDisplayName", () => {
  it("troca só o nome exibido", () => {
    expect(withDisplayName("Mais Corporativo <nao-responda@mais.tur.br>", "ABIEC")).toBe(
      '"ABIEC" <nao-responda@mais.tur.br>',
    );
    expect(withDisplayName("nao-responda@mais.tur.br", 'A "B" <c>')).toBe(
      '"A B c" <nao-responda@mais.tur.br>',
    );
  });
});
