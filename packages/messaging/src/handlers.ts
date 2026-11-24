import type { PrismaClient } from "@mais/db";
import {
  automationEventPayloadSchema,
  automationRunPayloadSchema,
  processAutomationEvent,
  processAutomationRun,
  type AutomationRunSummary,
} from "./automations";
import { QUEUES } from "./jobs";
import {
  processCampaignTick,
  processDeliverySend,
  type DeliverySendPayload,
  type MessagingDeps,
  type TickOutcome,
} from "./processor";

/** Handlers de job do módulo de comunicação, no formato que o @mais/worker registra. */
export type JobHandler = (payload: unknown) => Promise<TickOutcome | void>;

export function messagingJobHandlers(
  db: PrismaClient,
  deps: MessagingDeps,
): Record<string, JobHandler> {
  return {
    [QUEUES.campaignTick]: async (payload) => {
      const { campaignId } = payload as { campaignId?: string };
      if (!campaignId) return;
      return processCampaignTick(db, campaignId, deps);
    },
    [QUEUES.deliverySend]: async (payload) =>
      processDeliverySend(db, payload as DeliverySendPayload, deps),
  };
}

type Log = Pick<Console, "info" | "warn">;

function report(log: Log, what: string, r: AutomationRunSummary) {
  if (r.blocked) log.info(`[réguas] ${what}: nada enviado — ${r.blocked}`);
  else if (r.queued || r.skipped)
    log.info(
      `[réguas] ${what}: ${r.queued} na fila, ${r.skipped} sem contato/opt-out, ${r.duplicate} já enviada(s)`,
    );
}

/** Handlers das réguas automáticas (filas `automations.event` e `automations.run`). */
export function automationJobHandlers(
  db: PrismaClient,
  opts: { now?: () => Date; log?: Log } = {},
): Record<string, JobHandler> {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? console;
  return {
    [QUEUES.automationEvent]: async (payload) => {
      const p = automationEventPayloadSchema.safeParse(payload);
      if (!p.success)
        return log.warn(`[réguas] acontecimento inválido ignorado: ${p.error.message}`);
      report(
        log,
        `${p.data.trigger} ${p.data.registrationId}`,
        await processAutomationEvent(db, p.data, now()),
      );
    },
    [QUEUES.automationRun]: async (payload) => {
      const p = automationRunPayloadSchema.safeParse(payload);
      if (!p.success) return log.warn(`[réguas] disparo inválido ignorado: ${p.error.message}`);
      report(
        log,
        `régua ${p.data.automationId} (${p.data.occurrenceKey})`,
        await processAutomationRun(db, p.data, now()),
      );
    },
  };
}
