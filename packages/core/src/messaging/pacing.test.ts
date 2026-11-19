import { describe, expect, it } from "vitest";
import {
  decideSend,
  estimateDuration,
  isWithinWindow,
  nextSendAfter,
  nextWindowOpening,
  pacingSchema,
  PACING_PRESETS,
} from "./pacing";
import { calendarDaysUntil, startOfZonedDay, zonedParts } from "./timezone";

const BRT = "America/Sao_Paulo";
const cauteloso = pacingSchema.parse({ preset: "cauteloso" });

describe("incidente de 17/11/2026 — janela avaliada em UTC", () => {
  // O primeiro envio saiu às 08:00:08 UTC = 05:00:08 em Brasília
  const incidente = new Date("2026-11-17T08:00:08Z");

  it("05:00 em Brasília está FORA da janela 08:00–20:00, mesmo sendo 08:00 em UTC", () => {
    expect(zonedParts(incidente, BRT).hour).toBe(5);
    expect(isWithinWindow(incidente, cauteloso, BRT)).toBe(false);
  });

  it("adia para 08:00 de Brasília (11:00 UTC) do mesmo dia", () => {
    const d = decideSend({ now: incidente, pacing: cauteloso, timeZone: BRT, sentToday: 0 });
    expect(d.action).toBe("wait");
    if (d.action !== "wait") return;
    expect(d.until.toISOString()).toBe("2026-11-17T11:00:00.000Z");
    expect(d.reason).toContain("hoje às 08:00");
  });

  it("às 20:00 de Brasília (23:00 UTC) a janela já fechou e retoma amanhã", () => {
    const noite = new Date("2026-11-17T23:00:00Z");
    expect(isWithinWindow(noite, cauteloso, BRT)).toBe(false);
    expect(nextWindowOpening(noite, cauteloso, BRT).toISOString()).toBe("2026-11-18T11:00:00.000Z");
  });

  it("às 19:59 de Brasília ainda envia, embora já seja 22:59 em UTC", () => {
    expect(isWithinWindow(new Date("2026-11-17T22:59:00Z"), cauteloso, BRT)).toBe(true);
  });

  it("o mesmo instante em outro fuso dá outra decisão (fuso é do evento, não do servidor)", () => {
    // 08:00:08 UTC = 09:00 em Lisboa? Não: em novembro Lisboa = UTC. 08:00 → dentro.
    expect(isWithinWindow(incidente, cauteloso, "Europe/Lisbon")).toBe(true);
  });
});

describe("limite diário", () => {
  it("atingido, adia para a abertura do dia seguinte no fuso", () => {
    const now = new Date("2026-11-17T15:00:00Z"); // 12:00 BRT
    const d = decideSend({ now, pacing: cauteloso, timeZone: BRT, sentToday: 100 });
    expect(d.action).toBe("wait");
    if (d.action === "wait") {
      expect(d.until.toISOString()).toBe("2026-11-18T11:00:00.000Z");
      expect(d.reason).toContain("Limite de 100");
    }
  });

  it("meia-noite do dia é a de Brasília, não a de UTC", () => {
    const now = new Date("2026-11-18T01:30:00Z"); // 22:30 do dia 17 em BRT
    expect(startOfZonedDay(now, BRT).toISOString()).toBe("2026-11-17T03:00:00.000Z");
  });

  it("abaixo do limite e dentro da janela, envia", () => {
    expect(
      decideSend({
        now: new Date("2026-11-17T15:00:00Z"),
        pacing: cauteloso,
        timeZone: BRT,
        sentToday: 99,
      }),
    ).toEqual({
      action: "send",
    });
  });
});

describe("intervalos e lotes", () => {
  const now = new Date("2026-11-17T15:00:00Z");

  it("intervalo aleatório entre o mínimo e o máximo", () => {
    expect(
      nextSendAfter({
        now,
        pacing: cauteloso,
        timeZone: BRT,
        sentInCampaign: 3,
        lastSucceeded: true,
        random: () => 0,
      }).at.getTime() - now.getTime(),
    ).toBe(30_000);
    expect(
      nextSendAfter({
        now,
        pacing: cauteloso,
        timeZone: BRT,
        sentInCampaign: 3,
        lastSucceeded: true,
        random: () => 0.999999,
      }).at.getTime() - now.getTime(),
    ).toBe(60_000);
  });

  it("pausa longa ao completar um lote", () => {
    const r = nextSendAfter({
      now,
      pacing: cauteloso,
      timeZone: BRT,
      sentInCampaign: 15,
      lastSucceeded: true,
      random: () => 0,
    });
    expect(r.at.getTime() - now.getTime()).toBe(15 * 60_000);
    expect(r.reason).toContain("Lote 1 concluído");
  });

  it("falha não conta como fim de lote", () => {
    const r = nextSendAfter({
      now,
      pacing: cauteloso,
      timeZone: BRT,
      sentInCampaign: 15,
      lastSucceeded: false,
      random: () => 0,
    });
    expect(r.at.getTime() - now.getTime()).toBe(30_000);
  });
});

describe("schema do ritmo", () => {
  it("preset ignora valores avulsos", () => {
    expect(pacingSchema.parse({ preset: "moderado", dailyLimit: 999 }).dailyLimit).toBe(
      PACING_PRESETS.moderado.dailyLimit,
    );
  });

  it("personalizado respeita os pisos de segurança", () => {
    const p = pacingSchema.parse({
      preset: "personalizado",
      intervalMinS: 1,
      intervalMaxS: 5,
      dailyLimit: 5000,
      batchSize: 0,
    });
    expect(p.intervalMinS).toBe(10);
    expect(p.intervalMaxS).toBe(10);
    expect(p.dailyLimit).toBe(1000);
    expect(p.batchSize).toBe(1);
  });

  it("rejeita janela invertida", () => {
    expect(
      pacingSchema.safeParse({ preset: "personalizado", windowStart: "20:00", windowEnd: "08:00" })
        .success,
    ).toBe(false);
  });

  it("estima a duração em dias pelo limite diário", () => {
    expect(estimateDuration(250, cauteloso).days).toBeGreaterThanOrEqual(3);
    expect(estimateDuration(0, cauteloso)).toEqual({ days: 0, activeMinutes: 0 });
  });
});

describe("dias até o evento no fuso", () => {
  it("conta dias de calendário de Brasília (23h de 17/11 BRT → evento 18/11 = 1 dia)", () => {
    const now = new Date("2026-11-18T02:00:00Z"); // 23:00 de 17/11 em BRT
    const evento = new Date("2026-11-18T22:00:00Z"); // 19:00 de 18/11 em BRT
    expect(calendarDaysUntil(evento, now, BRT)).toBe(1);
  });
});
