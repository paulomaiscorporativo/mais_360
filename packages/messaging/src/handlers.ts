import type { PrismaClient } from "@mais/db";
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
