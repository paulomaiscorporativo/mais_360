/**
 * Usuários de DEMONSTRAÇÃO — um por nível de acesso, para testar permissões.
 * Roda depois do seed principal e NUNCA em produção.
 *
 *   npm run db:seed:demo
 *
 * Todos usam a senha DEMO_PASSWORD (padrão "Demo@2026!") e o domínio reservado
 * ".test", que não recebe e-mail de verdade. Idempotente.
 */
import path from "node:path";
import bcrypt from "bcryptjs";
import { config as loadEnv } from "dotenv";
import {
  PrismaClient,
  type PlatformRole,
  type TenantRole,
  type WorkspaceRole,
} from "@prisma/client";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env") });

if (process.env.NODE_ENV === "production") {
  console.error("seed-demo: recusado em produção.");
  process.exit(1);
}

const prisma = new PrismaClient();
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo@2026!";

type DemoUser = {
  email: string;
  name: string;
  platformRole?: PlatformRole;
  workspace?: { slug: string; role: WorkspaceRole };
  tenants?: { slug: string; role: TenantRole }[];
};

const USERS: DemoUser[] = [
  // Plataforma (equipe do SaaS)
  { email: "suporte@demo.test", name: "Sofia Suporte", platformRole: "SUPPORT" },

  // Assinante Mais Corporativo
  { email: "admin.assinante@demo.test", name: "Alice Admin do Assinante", workspace: { slug: "mais-corporativo", role: "ADMIN" } },
  { email: "operador.assinante@demo.test", name: "Otávio Operador", workspace: { slug: "mais-corporativo", role: "OPERATOR" }, tenants: [{ slug: "abiec", role: "OPERATOR" }] },
  { email: "financeiro.assinante@demo.test", name: "Fernanda Financeiro", workspace: { slug: "mais-corporativo", role: "FINANCE" } },

  // Cliente ABIEC — um usuário por papel
  { email: "admin.abiec@demo.test", name: "Ana Admin ABIEC", tenants: [{ slug: "abiec", role: "ADMIN" }] },
  { email: "gestor.abiec@demo.test", name: "Gustavo Gestor ABIEC", tenants: [{ slug: "abiec", role: "MANAGER" }] },
  { email: "aprovador.abiec@demo.test", name: "Paula Aprovadora ABIEC", tenants: [{ slug: "abiec", role: "APPROVER" }] },
  { email: "operador.abiec@demo.test", name: "Oscar Operador ABIEC", tenants: [{ slug: "abiec", role: "OPERATOR" }] },
  { email: "balcao.abiec@demo.test", name: "Bruna Balcão ABIEC", tenants: [{ slug: "abiec", role: "DESK" }] },
  { email: "leitor.abiec@demo.test", name: "Lucas Leitor ABIEC", tenants: [{ slug: "abiec", role: "SCANNER" }] },
  { email: "vendas.abiec@demo.test", name: "Vitor Vendas ABIEC", tenants: [{ slug: "abiec", role: "SALES" }] },
  { email: "visualizador.abiec@demo.test", name: "Vera Visualizadora ABIEC", tenants: [{ slug: "abiec", role: "VIEWER" }] },

  // Cliente ABRADILAN — para testar isolamento entre clientes
  { email: "admin.abradilan@demo.test", name: "Artur Admin ABRADILAN", tenants: [{ slug: "abradilan", role: "ADMIN" }] },

  // Outro assinante (agência concorrente) — não pode ver nada da Mais Corporativo
  { email: "dono.outraagencia@demo.test", name: "Diego Dono Outra Agência", workspace: { slug: "outra-agencia-demo", role: "OWNER" }, tenants: [{ slug: "cliente-outra-agencia", role: "ADMIN" }] },
];

async function main() {
  // Segundo assinante com um cliente próprio
  const plan = await prisma.plan.findUnique({ where: { code: "essencial" } });
  const other = await prisma.workspace.upsert({
    where: { slug: "outra-agencia-demo" },
    create: { slug: "outra-agencia-demo", name: "Outra Agência (demo)", status: "TRIAL" },
    update: {},
  });
  if (plan) {
    await prisma.subscription.upsert({
      where: { workspaceId: other.id },
      create: { workspaceId: other.id, planId: plan.id, status: "TRIALING", provider: "manual" },
      update: {},
    });
  }
  const otherTenant = await prisma.tenant.upsert({
    where: { slug: "cliente-outra-agencia" },
    create: { slug: "cliente-outra-agencia", name: "Cliente da Outra Agência", workspaceId: other.id },
    update: {},
  });
  await prisma.tenantBranding.upsert({
    where: { tenantId: otherTenant.id },
    create: { tenantId: otherTenant.id, primaryColor: "#7a2e8f" },
    update: {},
  });
  for (const module of ["COMMUNICATION", "EVENTS_INVITES"] as const) {
    await prisma.tenantModule.upsert({
      where: { tenantId_module: { tenantId: otherTenant.id, module } },
      create: { tenantId: otherTenant.id, module },
      update: {},
    });
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const tenantBySlug = new Map(
    (await prisma.tenant.findMany({ select: { id: true, slug: true } })).map((t) => [t.slug, t.id]),
  );
  const workspaceBySlug = new Map(
    (await prisma.workspace.findMany({ select: { id: true, slug: true } })).map((w) => [w.slug, w.id]),
  );

  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
        platformRole: u.platformRole ?? "NONE",
        mustChangePassword: false, // demo: entra direto
      },
      update: { name: u.name, passwordHash, platformRole: u.platformRole ?? "NONE", active: true },
    });
    if (u.workspace) {
      const workspaceId = workspaceBySlug.get(u.workspace.slug);
      if (!workspaceId) throw new Error(`Assinante ${u.workspace.slug} não existe — rode o seed principal.`);
      await prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId, userId: user.id } },
        create: { workspaceId, userId: user.id, role: u.workspace.role },
        update: { role: u.workspace.role },
      });
    }
    for (const t of u.tenants ?? []) {
      const tenantId = tenantBySlug.get(t.slug);
      if (!tenantId) throw new Error(`Cliente ${t.slug} não existe — rode o seed principal.`);
      await prisma.membership.upsert({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        create: { tenantId, userId: user.id, role: t.role },
        update: { role: t.role },
      });
    }
  }

  console.log(`Seed demo concluído — ${USERS.length} usuários · senha: ${PASSWORD}`);
  for (const u of USERS) console.log(`  ${u.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
