import {
  renderEmail,
  renderWhatsapp,
  sampleContext,
  unknownFields,
  type RenderedEmail,
} from "@mais/core/messaging";
import type { PrismaClient } from "@mais/db";
import { randomUUID } from "node:crypto";
import { resolveChannel } from "./channels";
import { loadRegistrationContext, loadScopeBranding, type LoadedContext } from "./context";
import { realProviders, type ProviderFactory } from "./providers";
import { fail, ok, type Result } from "./result";
import { templateContentSchema, validateForChannel, type TemplateContent } from "./template";

export type Preview = {
  email: RenderedEmail;
  whatsapp: string;
  /** Quem foi usado como exemplo */
  sample: { registrationId: string | null; name: string; fictitious: boolean };
  /** Campos usados que não existem no catálogo */
  unknownFields: string[];
};

async function sampleFor(
  db: PrismaClient,
  scope: { tenantId: string; projectId?: string | null; registrationId?: string | null },
): Promise<{ loaded: LoadedContext; registrationId: string | null; fictitious: boolean } | null> {
  if (scope.registrationId) {
    const l = await loadRegistrationContext(db, scope.registrationId);
    if (l && l.tenantId === scope.tenantId)
      return { loaded: l, registrationId: scope.registrationId, fictitious: false };
  }
  if (scope.projectId) {
    const first = await db.registration.findFirst({
      where: { tenantId: scope.tenantId, projectId: scope.projectId, status: { not: "CANCELED" } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (first) {
      const l = await loadRegistrationContext(db, first.id);
      if (l) return { loaded: l, registrationId: first.id, fictitious: false };
    }
  }
  const scopeInfo = await loadScopeBranding(db, scope.tenantId, scope.projectId);
  if (!scopeInfo) return null;
  const ctx = sampleContext(scopeInfo.timeZone);
  ctx.tenant = { name: scopeInfo.tenantName };
  if (scopeInfo.project) ctx.project = { ...ctx.project, ...scopeInfo.project };
  return {
    loaded: {
      ctx,
      branding: scopeInfo.branding,
      tenantId: scope.tenantId,
      projectId: scope.projectId ?? null,
    },
    registrationId: null,
    fictitious: true,
  };
}

/** Pré-visualiza um modelo (salvo ou não) com os dados de uma pessoa real do evento. */
export async function previewTemplate(
  db: PrismaClient,
  input: {
    tenantId: string;
    projectId?: string | null;
    registrationId?: string | null;
    template: TemplateContent;
  },
): Promise<Result<Preview>> {
  const t = templateContentSchema.safeParse(input.template);
  if (!t.success) return fail(t.error.issues[0]?.message ?? "Modelo inválido.");
  const s = await sampleFor(db, input);
  if (!s) return fail("Cliente não encontrado.");
  const { ctx, branding } = s.loaded;
  return ok({
    email: renderEmail(t.data, ctx, branding),
    whatsapp: renderWhatsapp(t.data, ctx),
    sample: {
      registrationId: s.registrationId,
      name: [ctx.person.firstName, ctx.person.lastName].filter(Boolean).join(" "),
      fictitious: s.fictitious,
    },
    unknownFields: unknownFields(
      `${t.data.emailSubject}\n${t.data.emailBody}\n${t.data.whatsappBody}`,
    ),
  });
}

/**
 * Envia o modelo para o próprio organizador conferir na caixa de entrada
 * (ou no WhatsApp). Não grava entrega nem conta para limites de campanha.
 */
export async function sendTest(
  db: PrismaClient,
  input: {
    tenantId: string;
    projectId?: string | null;
    channel: "EMAIL" | "WHATSAPP";
    to: string;
    template: TemplateContent;
    registrationId?: string | null;
  },
  providers: ProviderFactory = realProviders,
): Promise<Result<{ to: string; sampleName: string }>> {
  const t = templateContentSchema.safeParse(input.template);
  if (!t.success) return fail(t.error.issues[0]?.message ?? "Modelo inválido.");
  const invalid = validateForChannel(t.data, input.channel);
  if (invalid) return fail(invalid);
  const channel = await resolveChannel(db, {
    tenantId: input.tenantId,
    projectId: input.projectId,
    kind: input.channel,
  });
  if (!channel) return fail("Nenhum canal de envio configurado para este cliente.");
  const s = await sampleFor(db, input);
  if (!s) return fail("Cliente não encontrado.");
  const sampleName = [s.loaded.ctx.person.firstName, s.loaded.ctx.person.lastName]
    .filter(Boolean)
    .join(" ");
  try {
    if (channel.kind === "EMAIL") {
      const to = input.to.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to))
        return fail("Informe um e-mail válido para receber o teste.");
      const r = renderEmail(t.data, s.loaded.ctx, s.loaded.branding);
      const provider = providers.email(channel);
      try {
        await provider.send({
          from: channel.from,
          replyTo: channel.replyTo,
          to,
          subject: `[TESTE] ${r.subject}`,
          html: r.html,
          text: r.text,
          headers: { "X-Mais360-Test": randomUUID() },
        });
      } finally {
        provider.close?.();
      }
      return ok({ to, sampleName });
    }
    const { normalizePhone } = await import("@mais/core/messaging");
    const phone = normalizePhone(input.to);
    if (!phone) return fail("Informe um WhatsApp válido, com DDD, para receber o teste.");
    const provider = providers.whatsapp(channel);
    if ((await provider.connectionState()) !== "open")
      return fail("O WhatsApp deste cliente está desconectado.");
    await provider.sendText(phone.e164, `[TESTE]\n\n${renderWhatsapp(t.data, s.loaded.ctx)}`);
    return ok({ to: phone.e164, sampleName });
  } catch (e) {
    return fail(`Falha no envio do teste: ${(e as Error).message}`);
  }
}
