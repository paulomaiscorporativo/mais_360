import type { MessagingChannel } from "@mais/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { channelFromRecord, globalChannel } from "./channels";
import { globalSmtp } from "./env";

function emailChannel(over: Partial<MessagingChannel> = {}): MessagingChannel {
  return {
    id: "ch1",
    tenantId: "t1",
    projectId: null,
    kind: "EMAIL",
    name: "E-mail",
    fromName: "ABIEC Eventos",
    fromEmail: "",
    replyTo: "",
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "",
    smtpPassEnc: "",
    waProvider: null,
    waInstance: "",
    waConfigEnc: "",
    waNumber: "",
    active: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  };
}

describe("Reply-To padrão da plataforma (SMTP_REPLY_TO)", () => {
  beforeEach(() => {
    vi.stubEnv("SMTP_HOST", "smtp-relay.exemplo.com");
    vi.stubEnv("SMTP_PORT", "2525");
    vi.stubEnv("SMTP_FROM", "Mais 360 <nao-responda@mais.tur.br>");
    vi.stubEnv("SMTP_REPLY_TO", "contato@maiscorporativo.tur.br");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("lê o padrão do ambiente", () => {
    expect(globalSmtp()?.replyTo).toBe("contato@maiscorporativo.tur.br");
  });

  it("vazio quando não configurado", () => {
    vi.stubEnv("SMTP_REPLY_TO", "");
    expect(globalSmtp()?.replyTo).toBe("");
  });

  it("canal global usa o padrão", () => {
    const ch = globalChannel("EMAIL");
    expect(ch?.kind === "EMAIL" && ch.replyTo).toBe("contato@maiscorporativo.tur.br");
  });

  it("cliente no servidor global sem Reply-To próprio herda o padrão", () => {
    const ch = channelFromRecord(emailChannel(), "TENANT");
    expect(ch?.kind === "EMAIL" && ch.replyTo).toBe("contato@maiscorporativo.tur.br");
  });

  it("Reply-To do cliente vence o padrão", () => {
    const ch = channelFromRecord(emailChannel({ replyTo: "eventos@abiec.com.br" }), "TENANT");
    expect(ch?.kind === "EMAIL" && ch.replyTo).toBe("eventos@abiec.com.br");
  });

  it("cliente com SMTP próprio não herda o padrão da plataforma", () => {
    const ch = channelFromRecord(
      emailChannel({ smtpHost: "smtp.abiec.com.br", smtpUser: "eventos@abiec.com.br" }),
      "TENANT",
    );
    expect(ch?.kind === "EMAIL" && ch.replyTo).toBe("");
  });
});
