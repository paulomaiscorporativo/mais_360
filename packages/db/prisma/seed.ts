/**
 * Seed idempotente: rodar várias vezes não duplica nem sobrescreve o que foi
 * editado pelo console (usa upsert com `update` mínimo).
 *
 *   npm run db:seed
 */
import { randomBytes } from "node:crypto";
import path from "node:path";
import bcrypt from "bcryptjs";
import { config as loadEnv } from "dotenv";
import { PrismaClient, type ModuleKey } from "@prisma/client";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env") });

const prisma = new PrismaClient();

const ALL_MODULES: ModuleKey[] = [
  "COMMUNICATION",
  "CORPORATE_TRAVEL",
  "GROUP_TRAVEL",
  "EVENTS_INVITES",
  "ACCREDITATION",
  "SELF_SERVICE_KIOSK",
  "DOCUMENTS",
  "EXHIBITIONS",
  "INCENTIVE_GAMIFICATION",
  "FINANCE",
];

const PLANS = [
  {
    code: "essencial",
    name: "Essencial",
    description: "Para quem organiza eventos com convites e credenciamento.",
    priceCents: 89_000,
    modules: ["COMMUNICATION", "DOCUMENTS", "EVENTS_INVITES", "ACCREDITATION"] as ModuleKey[],
    limits: {
      tenants: 3,
      activeProjects: 5,
      registrationsPerMonth: 3000,
      whatsappPerMonth: 3000,
      kiosks: 0,
      users: 5,
    },
    sortOrder: 1,
  },
  {
    code: "profissional",
    name: "Profissional",
    description: "Agências com viagens de grupo, eventos e autoatendimento.",
    priceCents: 249_000,
    modules: [
      "COMMUNICATION",
      "DOCUMENTS",
      "EVENTS_INVITES",
      "ACCREDITATION",
      "SELF_SERVICE_KIOSK",
      "GROUP_TRAVEL",
      "CORPORATE_TRAVEL",
    ] as ModuleKey[],
    limits: {
      tenants: 15,
      activeProjects: 30,
      registrationsPerMonth: 20000,
      whatsappPerMonth: 20000,
      kiosks: 6,
      users: 25,
    },
    sortOrder: 2,
  },
  {
    code: "enterprise",
    name: "Enterprise",
    description: "Operação completa, com feiras, incentivo, financeiro e white-label.",
    priceCents: 0, // sob consulta
    modules: ALL_MODULES,
    limits: {},
    sortOrder: 3,
  },
];

type TenantSeed = {
  slug: string;
  name: string;
  legalName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  modules: ModuleKey[];
  terms: Record<string, string>;
  /** Endereços já em produção — QR codes impressos dependem deles. */
  domains: string[];
};

const TENANTS: TenantSeed[] = [
  {
    slug: "abiec",
    name: "ABIEC",
    legalName: "Associação Brasileira das Indústrias Exportadoras de Carnes",
    primaryColor: "#6ba63d",
    secondaryColor: "#123f6d",
    accentColor: "#0095eb",
    fontFamily: "Instrument Sans",
    modules: ["COMMUNICATION", "DOCUMENTS", "CORPORATE_TRAVEL", "GROUP_TRAVEL", "EVENTS_INVITES"],
    terms: {
      "member.singular": "Associado",
      "member.plural": "Associados",
      "org.singular": "Frigorífico",
      "org.plural": "Frigoríficos",
    },
    domains: ["abiec.mais.tur.br"],
  },
  {
    slug: "abradilan",
    name: "ABRADILAN",
    legalName: "Associação Brasileira dos Distribuidores de Laboratórios Nacionais",
    primaryColor: "#1690d0",
    secondaryColor: "#0f2836",
    accentColor: "#a0bf27",
    fontFamily: "Rubik",
    modules: ["COMMUNICATION", "DOCUMENTS", "CORPORATE_TRAVEL", "GROUP_TRAVEL", "EVENTS_INVITES"],
    terms: {
      "member.singular": "Associado",
      "member.plural": "Associados",
      "org.singular": "Distribuidora",
      "org.plural": "Distribuidoras",
    },
    domains: ["abradilanviagens.mais.tur.br"],
  },
];

async function main() {
  const email = (process.env.SEED_MASTER_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_MASTER_PASSWORD ?? "";
  if (!email || password.length < 10) {
    throw new Error("Defina SEED_MASTER_EMAIL e SEED_MASTER_PASSWORD (10+ caracteres) no .env.");
  }

  // Planos
  for (const p of PLANS) {
    await prisma.plan.upsert({
      where: { code: p.code },
      create: { ...p, currency: "BRL", interval: "MONTHLY" },
      update: { modules: p.modules },
    });
  }
  const enterprise = await prisma.plan.findUniqueOrThrow({ where: { code: "enterprise" } });

  // Superadmin
  const master = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Administrador da Plataforma",
      passwordHash: await bcrypt.hash(password, 12),
      platformRole: "SUPERADMIN",
      mustChangePassword: true,
    },
    update: { platformRole: "SUPERADMIN" },
  });

  // Assinante Mais Corporativo
  const workspace = await prisma.workspace.upsert({
    where: { slug: "mais-corporativo" },
    create: {
      slug: "mais-corporativo",
      name: "Mais Corporativo",
      legalName: "Mais Corporativo Viagens e Eventos",
      status: "ACTIVE",
      billingEmail: "financeiro@maiscorporativo.tur.br",
    },
    update: {},
  });
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: master.id } },
    create: { workspaceId: workspace.id, userId: master.id, role: "OWNER" },
    update: {},
  });
  await prisma.subscription.upsert({
    where: { workspaceId: workspace.id },
    create: {
      workspaceId: workspace.id,
      planId: enterprise.id,
      status: "ACTIVE",
      provider: "manual",
    },
    update: {},
  });

  // Clientes
  for (const t of TENANTS) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: t.slug },
      create: { slug: t.slug, name: t.name, legalName: t.legalName, workspaceId: workspace.id },
      update: {},
    });
    await prisma.tenantBranding.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        primaryColor: t.primaryColor,
        secondaryColor: t.secondaryColor,
        accentColor: t.accentColor,
        fontFamily: t.fontFamily,
      },
      update: {},
    });
    for (const module of t.modules) {
      await prisma.tenantModule.upsert({
        where: { tenantId_module: { tenantId: tenant.id, module } },
        create: { tenantId: tenant.id, module },
        update: {},
      });
    }
    for (const [key, value] of Object.entries(t.terms)) {
      await prisma.tenantTerm.upsert({
        where: { tenantId_key: { tenantId: tenant.id, key } },
        create: { tenantId: tenant.id, key, value },
        update: {},
      });
    }
    for (const [i, hostname] of t.domains.entries()) {
      await prisma.tenantDomain.upsert({
        where: { hostname },
        // Endereços já em produção entram verificados (ver docs/DOMINIOS.md)
        create: {
          tenantId: tenant.id,
          hostname,
          primary: i === 0,
          status: "VERIFIED",
          verifiedAt: new Date(),
          verificationToken: randomBytes(16).toString("hex"),
        },
        update: { tenantId: tenant.id },
      });
    }
  }

  const counts = {
    planos: await prisma.plan.count(),
    assinantes: await prisma.workspace.count(),
    clientes: await prisma.tenant.count(),
  };
  console.log(`Seed concluído — ${JSON.stringify(counts)} · superadmin: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
