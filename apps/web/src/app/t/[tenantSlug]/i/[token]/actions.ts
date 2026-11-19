"use server";

import { headers } from "next/headers";
import { z } from "zod";
import {
  enabledProjectFeatures,
  isValidCpf,
  normalizeEmail,
  normalizePhone,
  readProjectSettings,
  splitFullName,
} from "@mais/core";
import { sendTransactional } from "@mais/messaging";
import { defineAction } from "@/server/action";
import { prisma } from "@/server/db";
import { AppError, invalidFields } from "@/server/errors";
import { upsertPerson } from "@/server/people";
import { newRegistrationToken, shortCodeAllocator } from "@/server/projects";
import { rateLimit } from "@/server/rate-limit";
import { resolvePublicTenant } from "@/server/tenant-resolve";
import { tenantDb } from "@/server/tenant-db";
import { modulesForTenant } from "@/server/modules";

const schema = z.object({
  tenantSlug: z.string(),
  token: z.string().max(64),
  fullName: z.string().trim().min(3, "Informe seu nome completo.").max(160),
  badgeName: z.string().trim().max(60).default(""),
  email: z.string().trim().max(160),
  phone: z.string().trim().max(40),
  cpf: z.string().trim().max(20).default(""),
  organization: z.string().trim().max(160).default(""),
  jobTitle: z.string().trim().max(120).default(""),
  city: z.string().trim().max(80).default(""),
  state: z.string().trim().max(2).default(""),
  contactSharing: z.boolean().default(false),
  acceptTerms: z.literal(true, { message: "Aceite o uso dos dados para a inscrição." }),
  /** Campo-isca: preenchido só por robôs. */
  website: z.string().max(0, "Inválido.").default(""),
});

/**
 * Inscrição pública pelo link do projeto. Por segurança, quem já está inscrito
 * NÃO recebe o QR de volta aqui (qualquer pessoa poderia digitar o e-mail de
 * outra e obter a credencial): mostramos que a inscrição existe e o QR segue
 * pelos canais cadastrados.
 */
export const submitPublicRegistration = defineAction(schema, async (input) => {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();
  if (!rateLimit(`public-reg:${ip}`, 12, 10 * 60_000).allowed) {
    throw new AppError("Muitas inscrições seguidas deste aparelho. Aguarde alguns minutos.");
  }

  const tenant = await resolvePublicTenant(input.tenantSlug);
  if (!tenant || tenant.status !== "ACTIVE") throw new AppError("Inscrição indisponível.");
  const db = tenantDb({ tenantId: tenant.id });
  const project = await db.project.findFirst({
    where: { publicToken: input.token, archivedAt: null },
    include: { features: true },
  });
  if (!project) throw new AppError("Inscrição indisponível.");
  const features = enabledProjectFeatures(project.features, await modulesForTenant(tenant));
  const form = readProjectSettings(project.settings).form;
  if (!features.has("REGISTRATION_FORM") || !form.open) throw new AppError("As inscrições estão encerradas.");

  const fieldErrors: Record<string, string> = {};
  const email = normalizeEmail(input.email);
  if (!email) fieldErrors.email = "Informe um e-mail válido.";
  if (!normalizePhone(input.phone)) fieldErrors.phone = "Informe o WhatsApp com DDD.";
  if (form.askCpf && (form.requireCpf || input.cpf) && !isValidCpf(input.cpf))
    fieldErrors.cpf = "CPF inválido. Confira os números.";
  if (Object.keys(fieldErrors).length) {
    throw invalidFields(fieldErrors);
  }

  const { firstName, lastName } = splitFullName(input.fullName);
  const { person, created } = await upsertPerson(db, tenant.id, {
    firstName,
    lastName,
    badgeName: input.badgeName,
    email,
    phone: input.phone,
    cpf: form.askCpf ? input.cpf : "",
    organization: form.askCompany ? input.organization : "",
    jobTitle: form.askJobTitle ? input.jobTitle : "",
    city: form.askCity ? input.city : "",
    state: form.askCity ? input.state : "",
  });

  const existing = await db.registration.findFirst({
    where: { projectId: project.id, personId: person.id, status: { not: "CANCELED" } },
  });
  if (existing) return { already: true as const, firstName };

  const nextCode = await shortCodeAllocator(db, project.id);
  const reg = await db.registration.create({
    data: {
      tenantId: tenant.id,
      projectId: project.id,
      personId: person.id,
      role: "ATTENDEE",
      status: "CONFIRMED",
      source: "PUBLIC_FORM",
      categoryId: form.defaultCategoryId,
      displayCompany: form.askCompany ? input.organization : "",
      displayJobTitle: form.askJobTitle ? input.jobTitle : "",
      token: newRegistrationToken(),
      shortCode: nextCode(),
      confirmedAt: new Date(),
      formFilledAt: new Date(),
    },
  });
  if (form.askContactSharing) {
    await db.consent.create({
      data: {
        tenantId: tenant.id,
        personId: person.id,
        projectId: project.id,
        purpose: "CONTACT_SHARING",
        granted: input.contactSharing,
        textVersion: "form-v1",
        source: "inscricao",
        ip,
      },
    });
  }
  await sendCredential(tenant.id, project.id, reg.id);

  // Cadastro reaproveitado (mesmo e-mail/CPF/telefone de alguém que já existia):
  // não exibimos a credencial na tela — ela segue pelos canais do cadastro.
  if (!created) return { already: false as const, firstName, delivered: true as const };
  return { already: false as const, firstName, delivered: false as const, token: reg.token, shortCode: reg.shortCode };
});

/** Modelo padrão quando o cliente não cadastrou o seu (finalidade REGISTRATION_CONFIRMED). */
const DEFAULT_CONFIRMATION = {
  name: "Inscrição confirmada (padrão)",
  emailSubject: "Inscrição confirmada · {{projeto}}",
  emailBody: [
    "Olá, {{primeiro_nome}}!",
    "",
    "Sua inscrição em **{{projeto}}** está confirmada.",
    "",
    "No dia, apresente o QR code da sua credencial na recepção. Se preferir, informe o código **{{codigo}}**.",
  ].join("\n"),
  whatsappBody: [
    "Olá, {{primeiro_nome}}! Sua inscrição em *{{projeto}}* está confirmada.",
    "",
    "Sua credencial: {{link_cracha}}",
    "Código na recepção: *{{codigo}}*",
  ].join("\n"),
  includeActions: true,
};

/**
 * Envia a credencial (e-mail e WhatsApp) pelo motor de comunicação. Idempotente
 * (dedupeKey) e assíncrono (fila do worker); falha aqui nunca invalida a inscrição.
 */
async function sendCredential(tenantId: string, projectId: string, registrationId: string) {
  try {
    const base = { tenantId, projectId, registrationId, channels: ["EMAIL", "WHATSAPP"] as ("EMAIL" | "WHATSAPP")[], reason: "registration.confirmed" };
    const r = await sendTransactional(prisma, { ...base, purpose: "REGISTRATION_CONFIRMED" });
    if (!r.ok) await sendTransactional(prisma, { ...base, template: DEFAULT_CONFIRMATION });
  } catch (err) {
    console.error("[inscricao] envio da credencial", err);
  }
}
