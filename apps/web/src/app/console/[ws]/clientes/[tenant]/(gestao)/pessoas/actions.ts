"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cleanText, isValidCpf, normalizeCpf, normalizeEmail, normalizePhone } from "@mais/core";
import { defineAction, v } from "@/server/action";
import { audit } from "@/server/audit";
import { requireTenant } from "@/server/auth";
import { AppError, invalidFields } from "@/server/errors";
import { refreshSearch } from "@/server/people";
import { tenantDb } from "@/server/tenant-db";

const date = z
  .string()
  .trim()
  .transform((s) => (s ? new Date(`${s}T12:00:00Z`) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), "Data inválida.");

export const updatePerson = defineAction(
  z.object({
    tenant: z.string(),
    personId: z.string(),
    data: z.object({
      firstName: v.text("o nome", 80),
      lastName: v.optionalText(120),
      badgeName: v.optionalText(60),
      socialName: v.optionalText(120),
      email: z.string().trim().max(160).default(""),
      phone: z.string().trim().max(40).default(""),
      cpf: z.string().trim().max(20).default(""),
      birthDate: date,
      nationality: v.optionalText(60),
      jobTitle: v.optionalText(120),
      city: v.optionalText(80),
      state: v.optionalText(2),
      passportNumber: v.optionalText(30),
      passportExpiry: date,
      rg: v.optionalText(30),
      dietary: v.optionalText(500),
      medicalNotes: v.optionalText(1000),
      emergencyName: v.optionalText(120),
      emergencyPhone: z.string().trim().max(40).default(""),
    }),
  }),
  async ({ tenant, personId, data }) => {
    const ctx = await requireTenant(tenant, "OPERATOR");
    const db = tenantDb(ctx);
    const person = await db.person.findFirst({ where: { id: personId, archivedAt: null } });
    if (!person) throw new AppError("Pessoa não encontrada.");

    const errors: Record<string, string> = {};
    const email = normalizeEmail(data.email);
    if (data.email && !email) errors["data.email"] = "E-mail inválido.";
    const cpf = normalizeCpf(data.cpf);
    if (data.cpf && !isValidCpf(cpf)) errors["data.cpf"] = "CPF inválido.";
    const phone = data.phone ? normalizePhone(data.phone)?.e164 : "";
    if (data.phone && !phone) errors["data.phone"] = "Telefone inválido. Use DDD + número.";
    const emergencyPhone = data.emergencyPhone ? (normalizePhone(data.emergencyPhone)?.e164 ?? data.emergencyPhone) : "";
    if (Object.keys(errors).length) throw invalidFields(errors);

    // Não deixa duas pessoas com o mesmo CPF ou e-mail no cliente
    const clash = await db.person.findFirst({
      where: {
        id: { not: personId },
        archivedAt: null,
        OR: [...(cpf ? [{ cpf }] : []), ...(email ? [{ emailNorm: email }] : [])],
      },
      select: { firstName: true, lastName: true, cpf: true },
    });
    if (clash && (cpf || email)) {
      throw new AppError(
        `${cleanText(`${clash.firstName} ${clash.lastName}`)} já usa este ${clash.cpf === cpf && cpf ? "CPF" : "e-mail"}. Para unir os cadastros, fale com o suporte.`,
      );
    }

    await db.person.update({
      where: { id: personId },
      data: {
        ...data,
        email,
        emailNorm: email,
        cpf,
        phone: phone ?? "",
        emergencyPhone,
        state: data.state.toUpperCase(),
      },
    });
    await refreshSearch(db, personId);
    await audit({
      action: "person.update",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      entityType: "Person",
      entityId: personId,
    });
    revalidatePath("/console", "layout");
  },
);
