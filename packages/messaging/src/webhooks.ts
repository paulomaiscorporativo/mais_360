import type { DeliveryStatus, PrismaClient } from "@mais/db";

/**
 * Status de entrega vindos dos provedores (webhook). A rota HTTP fica na
 * aplicação web; aqui ficam o parser de cada provedor e a aplicação no banco.
 *
 * O status só avança: SENT → DELIVERED → READ. Um "entregue" atrasado nunca
 * rebaixa uma mensagem que já foi lida.
 */

export type StatusUpdate = {
  providerMessageId: string;
  status: "DELIVERED" | "READ" | "FAILED";
  at: Date;
  error?: string;
};

const RANK: Partial<Record<DeliveryStatus, number>> = {
  SENDING: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
};

export async function applyStatusUpdates(
  db: PrismaClient,
  updates: StatusUpdate[],
): Promise<number> {
  let applied = 0;
  for (const u of updates) {
    if (!u.providerMessageId) continue;
    const d = await db.messageDelivery.findFirst({
      where: { providerMessageId: u.providerMessageId },
      select: { id: true, status: true },
    });
    if (!d) continue;
    if (u.status === "FAILED") {
      if (d.status === "SENT") {
        await db.messageDelivery.update({
          where: { id: d.id },
          data: { status: "FAILED", error: u.error ?? "Falha informada pelo provedor." },
        });
        applied++;
      }
      continue;
    }
    const current = RANK[d.status];
    if (current === undefined || current >= (RANK[u.status] ?? 0)) continue;
    await db.messageDelivery.update({
      where: { id: d.id },
      data: {
        status: u.status,
        ...(u.status === "DELIVERED"
          ? { deliveredAt: u.at }
          : { readAt: u.at, deliveredAt: undefined }),
      },
    });
    applied++;
  }
  return applied;
}

/** Evolution v2: evento "messages.update" com data.status DELIVERY_ACK | READ | PLAYED | ERROR. */
export function parseEvolutionWebhook(body: unknown): StatusUpdate[] {
  const b = body as { event?: string; data?: unknown };
  if (!b?.event || !/messages[._]update/i.test(b.event)) return [];
  const items = Array.isArray(b.data) ? b.data : [b.data];
  const out: StatusUpdate[] = [];
  for (const raw of items) {
    const it = raw as {
      keyId?: string;
      key?: { id?: string };
      status?: string;
      dateTime?: string | number;
    };
    const id = it?.keyId ?? it?.key?.id;
    const s = String(it?.status ?? "").toUpperCase();
    const status =
      s === "DELIVERY_ACK"
        ? "DELIVERED"
        : s === "READ" || s === "PLAYED"
          ? "READ"
          : s === "ERROR"
            ? "FAILED"
            : null;
    if (id && status)
      out.push({
        providerMessageId: id,
        status,
        at: it.dateTime ? new Date(it.dateTime) : new Date(),
      });
  }
  return out;
}

/** Meta Cloud API: entry[].changes[].value.statuses[] (sent | delivered | read | failed). */
export function parseMetaWebhook(body: unknown): StatusUpdate[] {
  const out: StatusUpdate[] = [];
  const entries =
    (body as { entry?: { changes?: { value?: { statuses?: unknown[] } }[] }[] })?.entry ?? [];
  for (const e of entries) {
    for (const ch of e.changes ?? []) {
      for (const raw of ch.value?.statuses ?? []) {
        const s = raw as {
          id?: string;
          status?: string;
          timestamp?: string;
          errors?: { title?: string }[];
        };
        const status =
          s.status === "delivered"
            ? "DELIVERED"
            : s.status === "read"
              ? "READ"
              : s.status === "failed"
                ? "FAILED"
                : null;
        if (!s.id || !status) continue;
        out.push({
          providerMessageId: s.id,
          status,
          at: s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date(),
          error: s.errors?.[0]?.title,
        });
      }
    }
  }
  return out;
}
