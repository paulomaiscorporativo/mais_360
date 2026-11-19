import { z } from "zod";
import {
  addCalendarDays,
  describeWhenBR,
  formatTimeBR,
  zonedParts,
  zonedTimeToUtc,
} from "./timezone";

/**
 * Ritmo de envio do WhatsApp.
 *
 * Mandar muitas mensagens iguais em sequência faz o WhatsApp bloquear o
 * número. O envio imita o ritmo de uma pessoa: intervalo aleatório, pausa a
 * cada lote, limite diário por número e janela de horário — tudo avaliado no
 * FUSO DA CAMPANHA, nunca no relógio do servidor.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const PACING_PRESETS = {
  cauteloso: {
    intervalMinS: 30,
    intervalMaxS: 60,
    batchSize: 15,
    batchPauseMinM: 15,
    batchPauseMaxM: 25,
    dailyLimit: 100,
    windowStart: "08:00",
    windowEnd: "20:00",
  },
  moderado: {
    intervalMinS: 20,
    intervalMaxS: 40,
    batchSize: 25,
    batchPauseMinM: 10,
    batchPauseMaxM: 15,
    dailyLimit: 200,
    windowStart: "08:00",
    windowEnd: "20:00",
  },
} as const;

export type PacingPresetName = keyof typeof PACING_PRESETS;

/** Pisos e tetos de segurança: nem o modo personalizado passa daqui. */
export const PACING_LIMITS = {
  intervalS: { min: 10, max: 900 },
  batchSize: { min: 1, max: 100 },
  batchPauseM: { min: 1, max: 480 },
  dailyLimit: { min: 1, max: 1000 },
} as const;

const clampInt = (min: number, max: number) =>
  z.coerce.number().transform((n) => Math.min(max, Math.max(min, Math.round(n))));

export const pacingSchema = z
  .object({
    preset: z.enum(["cauteloso", "moderado", "personalizado"]).default("cauteloso"),
    intervalMinS: clampInt(PACING_LIMITS.intervalS.min, PACING_LIMITS.intervalS.max).optional(),
    intervalMaxS: clampInt(PACING_LIMITS.intervalS.min, PACING_LIMITS.intervalS.max).optional(),
    batchSize: clampInt(PACING_LIMITS.batchSize.min, PACING_LIMITS.batchSize.max).optional(),
    batchPauseMinM: clampInt(
      PACING_LIMITS.batchPauseM.min,
      PACING_LIMITS.batchPauseM.max,
    ).optional(),
    batchPauseMaxM: clampInt(
      PACING_LIMITS.batchPauseM.min,
      PACING_LIMITS.batchPauseM.max,
    ).optional(),
    dailyLimit: clampInt(PACING_LIMITS.dailyLimit.min, PACING_LIMITS.dailyLimit.max).optional(),
    windowStart: z.string().regex(HHMM, "Use o formato HH:MM.").optional(),
    windowEnd: z.string().regex(HHMM, "Use o formato HH:MM.").optional(),
  })
  .transform((input) => {
    // Presets ignoram valores avulsos; o personalizado parte do cauteloso
    const base = PACING_PRESETS[input.preset === "personalizado" ? "cauteloso" : input.preset];
    const pick = <K extends keyof typeof base>(k: K) =>
      input.preset === "personalizado" ? (input[k] ?? base[k]) : base[k];
    const p = {
      preset: input.preset,
      intervalMinS: pick("intervalMinS") as number,
      intervalMaxS: pick("intervalMaxS") as number,
      batchSize: pick("batchSize") as number,
      batchPauseMinM: pick("batchPauseMinM") as number,
      batchPauseMaxM: pick("batchPauseMaxM") as number,
      dailyLimit: pick("dailyLimit") as number,
      windowStart: pick("windowStart") as string,
      windowEnd: pick("windowEnd") as string,
    };
    if (p.intervalMaxS < p.intervalMinS) p.intervalMaxS = p.intervalMinS;
    if (p.batchPauseMaxM < p.batchPauseMinM) p.batchPauseMaxM = p.batchPauseMinM;
    return p;
  })
  .refine((p) => minutesOf(p.windowEnd) > minutesOf(p.windowStart), {
    message: "O horário final precisa ser depois do horário inicial.",
    path: ["windowEnd"],
  });

export type Pacing = z.output<typeof pacingSchema>;

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

export function isWithinWindow(
  now: Date,
  pacing: Pick<Pacing, "windowStart" | "windowEnd">,
  timeZone: string,
): boolean {
  const { hour, minute } = zonedParts(now, timeZone);
  const m = hour * 60 + minute;
  return m >= minutesOf(pacing.windowStart) && m < minutesOf(pacing.windowEnd);
}

/**
 * Próxima abertura da janela no fuso: hoje (se ainda não abriu) ou amanhã.
 * `skipToday` força o dia seguinte (limite diário atingido).
 */
export function nextWindowOpening(
  now: Date,
  pacing: Pick<Pacing, "windowStart">,
  timeZone: string,
  skipToday = false,
): Date {
  const p = zonedParts(now, timeZone);
  const [h, m] = pacing.windowStart.split(":").map(Number) as [number, number];
  const opensToday = p.hour * 60 + p.minute < h * 60 + m;
  const day = addCalendarDays(p.day, skipToday || !opensToday ? 1 : 0);
  return zonedTimeToUtc({ ...day, hour: h, minute: m }, timeZone);
}

export type SendDecision =
  { action: "send" } | { action: "wait"; until: Date; reason: string; status: "WAITING_WINDOW" };

/** Pode enviar agora? Se não, até quando esperar e por quê (texto para o painel). */
export function decideSend(input: {
  now: Date;
  pacing: Pacing;
  timeZone: string;
  sentToday: number;
}): SendDecision {
  const { now, pacing, timeZone, sentToday } = input;
  if (!isWithinWindow(now, pacing, timeZone)) {
    const until = nextWindowOpening(now, pacing, timeZone);
    return {
      action: "wait",
      status: "WAITING_WINDOW",
      until,
      reason: `Fora do horário permitido (${pacing.windowStart}–${pacing.windowEnd}). Retoma ${describeWhenBR(until, now, timeZone)}.`,
    };
  }
  if (sentToday >= pacing.dailyLimit) {
    const until = nextWindowOpening(now, pacing, timeZone, true);
    return {
      action: "wait",
      status: "WAITING_WINDOW",
      until,
      reason: `Limite de ${pacing.dailyLimit} mensagens por dia atingido. Retoma ${describeWhenBR(until, now, timeZone)}.`,
    };
  }
  return { action: "send" };
}

/**
 * Quando enviar a próxima depois de um envio. A cada `batchSize` envios bem
 * sucedidos, pausa longa; senão intervalo aleatório.
 * `random` é injetável para testes (retorna [0, 1)).
 */
export function nextSendAfter(input: {
  now: Date;
  pacing: Pacing;
  timeZone: string;
  sentInCampaign: number;
  lastSucceeded: boolean;
  random?: () => number;
}): { at: Date; reason: string } {
  const { now, pacing, timeZone, sentInCampaign, lastSucceeded } = input;
  const rnd = input.random ?? Math.random;
  const between = (a: number, b: number) => a + rnd() * (b - a);
  if (lastSucceeded && sentInCampaign > 0 && sentInCampaign % pacing.batchSize === 0) {
    const at = new Date(
      now.getTime() + between(pacing.batchPauseMinM, pacing.batchPauseMaxM) * 60_000,
    );
    const lote = sentInCampaign / pacing.batchSize;
    return {
      at,
      reason: `Lote ${lote} concluído. Pausa de proteção até ${formatTimeBR(at, timeZone)}.`,
    };
  }
  return {
    at: new Date(
      now.getTime() + Math.round(between(pacing.intervalMinS, pacing.intervalMaxS) * 1000),
    ),
    reason: "",
  };
}

/** "Digitando…" de 2 a 5 s antes de cada mensagem, para parecer humano. */
export function typingDelayMs(random: () => number = Math.random): number {
  return Math.round(2000 + random() * 3000);
}

/** Estimativa para o painel: quanto tempo um disparo de N mensagens deve levar. */
export function estimateDuration(
  total: number,
  pacing: Pacing,
): { days: number; activeMinutes: number } {
  if (total <= 0) return { days: 0, activeMinutes: 0 };
  const avgInterval = (pacing.intervalMinS + pacing.intervalMaxS) / 2 / 60;
  const avgPause = (pacing.batchPauseMinM + pacing.batchPauseMaxM) / 2;
  const pauses = Math.max(0, Math.ceil(total / pacing.batchSize) - 1);
  const activeMinutes = Math.round(total * avgInterval + pauses * avgPause);
  const windowMinutes = minutesOf(pacing.windowEnd) - minutesOf(pacing.windowStart);
  const byLimit = Math.ceil(total / pacing.dailyLimit);
  const byWindow = Math.ceil(activeMinutes / windowMinutes);
  return { days: Math.max(byLimit, byWindow), activeMinutes };
}
