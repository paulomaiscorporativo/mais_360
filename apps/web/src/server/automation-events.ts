import type { PrismaClient } from "@mais/db";
import { enqueueAutomationEvents } from "@mais/messaging";

/**
 * Avisa as réguas automáticas de um acontecimento da inscrição. Só enfileira
 * (fila `automations.event`); o envio acontece no worker.
 *
 * Nunca derruba a ação do usuário: uma falha aqui é registrada no log e a
 * inscrição/check-in segue normalmente. Sem dependência do Next (usado também
 * pelo núcleo do check-in, testado contra o banco).
 *
 * A migração do legado NÃO chama isto (não dispara mensagens).
 */
export async function fireAutomationEvent(
  db: PrismaClient,
  input: {
    tenantId: string;
    projectId: string;
    trigger: "REGISTRATION_CREATED" | "REGISTRATION_CONFIRMED" | "CHECKED_IN";
    registrationIds: string[];
    at?: Date;
  },
): Promise<void> {
  try {
    await enqueueAutomationEvents(db, input);
  } catch (e) {
    console.error(`[réguas] falha ao enfileirar ${input.trigger}:`, e);
  }
}
