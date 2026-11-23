"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MODULE_KEYS, validateTenantGrant, withDependencies, MODULES } from "@mais/core";
import { defineAction, v } from "@/server/action";
import { audit } from "@/server/audit";
import { requireTenant, requireWorkspace } from "@/server/auth";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { modulesForWorkspace } from "@/server/modules";
import { inviteTenantMember, setTenantModules, tenantSlugTaken } from "@/server/tenants";

import { RESERVED_SLUGS, TENANT_FONT_NAMES, TERM_DEFS, TIMEZONES } from "@/config/terms";

const moduleKey = z.enum(MODULE_KEYS);
const tenantRole = z.enum([
  "ADMIN",
  "MANAGER",
  "APPROVER",
  "OPERATOR",
  "DESK",
  "SCANNER",
  "SALES",
  "VIEWER",
]);

const brandingSchema = z.object({
  primaryColor: v.hex(),
  accentColor: v.hex(),
  fontFamily: z.enum(TENANT_FONT_NAMES),
  showMaisBrand: z.boolean(),
});

const termsSchema = z.record(z.string(), z.string().trim().max(60, "Use no máximo 60 caracteres."));

function cleanTerms(raw: Record<string, string>) {
  const allowed = new Set<string>(TERM_DEFS.map((d) => d.key));
  return Object.entries(raw).filter(([k, val]) => allowed.has(k) && val.length > 0);
}

function explainIssues(issues: ReturnType<typeof validateTenantGrant>): string {
  const first = issues[0];
  if (!first) return "";
  return first.kind === "NOT_IN_PLAN"
    ? `${MODULES[first.module].name} não está no plano do assinante.`
    : `${MODULES[first.module].name} precisa de ${MODULES[first.requires].name}.`;
}

// ---------------------------------------------------------------------------
// Criar cliente (assistente)
// ---------------------------------------------------------------------------

const createTenantSchema = z.object({
  ws: z.string(),
  name: v.text("o nome do cliente", 80),
  legalName: v.optionalText(160),
  document: v.optionalText(20),
  slug: v.slug().refine((s) => !RESERVED_SLUGS.has(s), "Este endereço é reservado. Escolha outro."),
  timezone: z.enum(TIMEZONES.map((t) => t.value) as [string, ...string[]]),
  branding: brandingSchema,
  terms: termsSchema,
  modules: z.array(moduleKey),
  admin: z.object({ name: v.text("o nome", 120), email: v.email() }).nullable(),
});

export const createTenant = defineAction(createTenantSchema, async (input) => {
  const { viewer, workspace } = await requireWorkspace(input.ws, "ADMIN");
  if (await tenantSlugTaken(input.slug)) {
    throw new AppError(`O endereço "${input.slug}" já está em uso. Escolha outro.`);
  }
  const allowed = await modulesForWorkspace(workspace.id);
  const modules = [...withDependencies(input.modules)];
  const issues = validateTenantGrant(modules, allowed);
  if (issues.length) throw new AppError(explainIssues(issues));

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        workspaceId: workspace.id,
        slug: input.slug,
        name: input.name,
        legalName: input.legalName,
        document: input.document.replace(/\D/g, ""),
        timezone: input.timezone,
        branding: {
          create: {
            primaryColor: input.branding.primaryColor.toLowerCase(),
            accentColor: input.branding.accentColor.toLowerCase(),
            fontFamily: input.branding.fontFamily,
            showMaisBrand: input.branding.showMaisBrand,
          },
        },
        terms: { create: cleanTerms(input.terms).map(([key, value]) => ({ key, value })) },
      },
    });
    await setTenantModules(tx, tenant.id, modules);
    const admin = input.admin
      ? await inviteTenantMember(tx, {
          tenant: { ...tenant, workspace, branding: { primaryColor: input.branding.primaryColor } },
          name: input.admin.name,
          email: input.admin.email,
          role: "ADMIN",
          actor: { id: viewer.user.id, name: viewer.user.name },
        })
      : null;
    return { tenant, admin };
  });

  await audit({
    action: "tenant.create",
    userId: viewer.user.id,
    actorLabel: viewer.user.name,
    tenantId: result.tenant.id,
    entityType: "Tenant",
    entityId: result.tenant.id,
    data: { modules, admin: input.admin?.email ?? null },
  });
  if (result.admin?.invite) {
    await audit({
      action: "user.invite.send",
      userId: viewer.user.id,
      actorLabel: viewer.user.name,
      tenantId: result.tenant.id,
      entityType: "User",
      entityId: result.admin.userId,
      data: { email: result.admin.email, role: "ADMIN", scope: "tenant" },
    });
  }
  revalidatePath(`/console/${workspace.slug}`, "layout");
  return {
    slug: result.tenant.slug,
    href: `/console/${workspace.slug}/clientes/${result.tenant.slug}`,
    admin: result.admin ? { email: result.admin.email, invite: result.admin.invite } : null,
  };
});

// ---------------------------------------------------------------------------
// Edição do cliente
// ---------------------------------------------------------------------------

const tenantRef = { tenant: z.string() };

export const updateBranding = defineAction(
  z.object({ ...tenantRef, branding: brandingSchema }),
  async ({ tenant: slug, branding }) => {
    const ctx = await requireTenant(slug, "ADMIN");
    await prisma.tenantBranding.upsert({
      where: { tenantId: ctx.tenantId },
      create: { tenantId: ctx.tenantId, ...branding },
      update: {
        ...branding,
        primaryColor: branding.primaryColor.toLowerCase(),
        accentColor: branding.accentColor.toLowerCase(),
      },
    });
    await audit({
      action: "tenant.branding.update",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      entityType: "Tenant",
      entityId: ctx.tenantId,
      data: branding,
    });
    revalidatePath("/console", "layout");
  },
);

export const updateTerms = defineAction(
  z.object({ ...tenantRef, terms: termsSchema }),
  async ({ tenant: slug, terms }) => {
    const ctx = await requireTenant(slug, "ADMIN");
    const entries = cleanTerms(terms);
    await prisma.$transaction([
      prisma.tenantTerm.deleteMany({ where: { tenantId: ctx.tenantId } }),
      prisma.tenantTerm.createMany({
        data: entries.map(([key, value]) => ({ tenantId: ctx.tenantId, key, value })),
      }),
    ]);
    await audit({
      action: "tenant.terms.update",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      entityType: "Tenant",
      entityId: ctx.tenantId,
      data: Object.fromEntries(entries),
    });
    revalidatePath(`/console/${ctx.workspace.slug}/clientes/${slug}`, "layout");
  },
);

export const updateModules = defineAction(
  z.object({ ...tenantRef, modules: z.array(moduleKey) }),
  async ({ tenant: slug, modules }) => {
    const ctx = await requireTenant(slug, "ADMIN");
    // Liberar módulo é decisão comercial: só quem administra o assinante.
    await requireWorkspace(ctx.workspace.slug, "ADMIN");
    const allowed = await modulesForWorkspace(ctx.workspace.id);
    const full = [...withDependencies(modules)];
    const issues = validateTenantGrant(full, allowed);
    if (issues.length) throw new AppError(explainIssues(issues));
    const granted = await prisma.$transaction((tx) => setTenantModules(tx, ctx.tenantId, full));
    await audit({
      action: "tenant.modules.update",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      entityType: "Tenant",
      entityId: ctx.tenantId,
      data: { modules: [...granted] },
    });
    revalidatePath("/console", "layout");
    return { modules: [...granted] };
  },
);

export const addMember = defineAction(
  z.object({ ...tenantRef, name: v.text("o nome", 120), email: v.email(), role: tenantRole }),
  async ({ tenant: slug, name, email, role }) => {
    const ctx = await requireTenant(slug, "ADMIN");
    const r = await prisma.$transaction((tx) =>
      inviteTenantMember(tx, {
        tenant: ctx.tenant,
        name,
        email,
        role,
        actor: { id: ctx.viewer.user.id, name: ctx.viewer.user.name },
      }),
    );
    await audit({
      action: r.invite ? "user.invite.send" : "tenant.member.add",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      entityType: "User",
      entityId: r.userId,
      data: { email, role, scope: "tenant" },
    });
    revalidatePath(`/console/${ctx.workspace.slug}/clientes/${slug}/equipe`);
    return { email: r.email, invite: r.invite };
  },
);

export const updateMemberRole = defineAction(
  z.object({ ...tenantRef, membershipId: z.string(), role: tenantRole }),
  async ({ tenant: slug, membershipId, role }) => {
    const ctx = await requireTenant(slug, "ADMIN");
    const m = await prisma.membership.findFirst({
      where: { id: membershipId, tenantId: ctx.tenantId },
    });
    if (!m) throw new AppError("Pessoa não encontrada nesta equipe.");
    await prisma.membership.update({ where: { id: m.id }, data: { role } });
    await audit({
      action: "tenant.member.role",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      entityType: "Membership",
      entityId: m.id,
      data: { role },
    });
    revalidatePath(`/console/${ctx.workspace.slug}/clientes/${slug}/equipe`);
  },
);

export const removeMember = defineAction(
  z.object({ ...tenantRef, membershipId: z.string() }),
  async ({ tenant: slug, membershipId }) => {
    const ctx = await requireTenant(slug, "ADMIN");
    const m = await prisma.membership.findFirst({
      where: { id: membershipId, tenantId: ctx.tenantId },
    });
    if (!m) throw new AppError("Pessoa não encontrada nesta equipe.");
    if (m.userId === ctx.viewer.user.id)
      throw new AppError("Você não pode remover o seu próprio acesso.");
    await prisma.membership.delete({ where: { id: m.id } });
    await audit({
      action: "tenant.member.remove",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      entityType: "Membership",
      entityId: m.id,
    });
    revalidatePath(`/console/${ctx.workspace.slug}/clientes/${slug}/equipe`);
  },
);

export const checkSlug = defineAction(z.object({ slug: z.string() }), async ({ slug }) => {
  const s = slug.trim().toLowerCase();
  if (RESERVED_SLUGS.has(s)) return { available: false };
  return { available: !(await tenantSlugTaken(s)) };
});
