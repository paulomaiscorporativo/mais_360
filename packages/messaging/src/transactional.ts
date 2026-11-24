import {
  planRecipients,
  SKIP_REASON_LABELS,
  transactionalKey,
  type Channel,
} from "@mais/core/messaging";
import { Prisma, type PrismaClient, type TemplatePurpose } from "@mais/db";
import { whatsappOptOuts } from "./campaigns";
import { enqueueJob, QUEUES } from "./jobs";
import type { DeliverySendPayload } from "./processor";
import { fail, ok, type Result } from "./result";
import { templateContentSchema, type TemplateContent } from "./template";

/**
 * Mensagem transacional: inscrição confirmada, convite, comprovante de
 * solicitação, cotação disponível… Um envio por (motivo, entidade, canal) —
 * chamar duas vezes não duplica (dedupeKey).
 */

export type SendTransactionalInput = {
  tenantId: string;
  projectId?: string | null;
  /** Destinatário: a inscrição (preferível) ou a pessoa */
  registrationId?: string;
  personId?: string;
  channels: Channel[];
  /** Motivo estável, vira parte da chave: "registration.confirmed", "invite.sent" */
  reason: string;
  /** Diferencia reenvios intencionais ("reenviar convite" = nova ocorrência) */
  occurrence?: string;
  /** Conteúdo explícito, ou o modelo do cliente/projeto com esta finalidade */
  template?: TemplateContent;
  purpose?: TemplatePurpose;
};

export type TransactionalOutcome = {
  channel: Channel;
  status: "QUEUED" | "DUPLICATE" | "SKIPPED";
  deliveryId?: string;
  detail?: string;
};

async function templateForPurpose(
  db: PrismaClient,
  tenantId: string,
  projectId: string | null | undefined,
  purpose: TemplatePurpose,
) {
  const rows = await db.messageTemplate.findMany({
    where: {
      tenantId,
      purpose,
      archivedAt: null,
      OR: [{ projectId: null }, ...(projectId ? [{ projectId }] : [])],
    },
    orderBy: { updatedAt: "desc" },
  });
  // O do projeto vence o do cliente
  const t =
    rows.find((r) => r.projectId && r.projectId === projectId) ?? rows.find((r) => !r.projectId);
  return t ? templateContentSchema.parse(t) : null;
}

export async function sendTransactional(
  db: PrismaClient,
  input: SendTransactionalInput,
): Promise<Result<TransactionalOutcome[]>> {
  if (!input.registrationId && !input.personId) return fail("Informe o destinatário.");
  const template =
    input.template ??
    (input.purpose
      ? await templateForPurpose(db, input.tenantId, input.projectId, input.purpose)
      : null);
  if (!template) return fail("Não há modelo de mensagem para esta finalidade.");

  const reg = input.registrationId
    ? await db.registration.findFirst({
        where: { id: input.registrationId, tenantId: input.tenantId },
        select: {
          id: true,
          projectId: true,
          person: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
        },
      })
    : null;
  const person =
    reg?.person ??
    (input.personId
      ? await db.person.findFirst({
          where: { id: input.personId, tenantId: input.tenantId },
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        })
      : null);
  if (!person) return fail("Destinatário não encontrado neste cliente.");
  const projectId = reg?.projectId ?? input.projectId ?? null;
  const entityId = reg?.id ?? person.id;

  const optedOut = input.channels.includes("WHATSAPP")
    ? (await whatsappOptOuts(db, input.tenantId, [person.id])).has(person.id)
    : false;
  const outcomes: TransactionalOutcome[] = [];
  for (const channel of input.channels) {
    const [plan] = planRecipients(
      [
        {
          recipientId: entityId,
          personId: person.id,
          registrationId: reg?.id,
          name: `${person.firstName} ${person.lastName}`.trim(),
          email: person.email,
          phone: person.phone,
          whatsappOptOut: optedOut,
        },
      ],
      channel,
    );
    if (!plan) continue;
    if (plan.skip) {
      outcomes.push({ channel, status: "SKIPPED", detail: SKIP_REASON_LABELS[plan.skip] });
      continue;
    }
    try {
      const delivery = await db.$transaction(async (tx) => {
        const d = await tx.messageDelivery.create({
          data: {
            tenantId: input.tenantId,
            channel,
            personId: person.id,
            registrationId: reg?.id ?? null,
            recipientName: plan.candidate.name,
            target: plan.target,
            dedupeKey: transactionalKey(input.reason, entityId, channel, input.occurrence),
            status: "QUEUED",
          },
        });
        const payload: DeliverySendPayload = { deliveryId: d.id, template, projectId };
        await enqueueJob(tx, {
          queue: QUEUES.deliverySend,
          payload,
          uniqueKey: `delivery:${d.id}`,
          maxAttempts: 6,
        });
        return d;
      });
      outcomes.push({ channel, status: "QUEUED", deliveryId: delivery.id });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        outcomes.push({ channel, status: "DUPLICATE", detail: "Esta mensagem já foi enviada." });
        continue;
      }
      throw e;
    }
  }
  return ok(outcomes);
}
