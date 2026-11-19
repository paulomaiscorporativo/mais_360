import { ExternalLink } from "lucide-react";
import { Avatar, Badge, PageHeader } from "@/components/ui";
import { LinkTabs } from "@/components/ui/tabs";
import { guard, requireTenant } from "@/server/auth";
import { prisma } from "@/server/db";
import { modulesForTenant } from "@/server/modules";
import { tenantAddress } from "@/server/urls";
import { env } from "@/server/env";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { ws, tenant: slug } = await params;
  const ctx = await guard(requireTenant(slug));
  const [domains, active, members] = await Promise.all([
    prisma.tenantDomain.findMany({ where: { tenantId: ctx.tenantId, primary: true }, take: 1 }),
    modulesForTenant(ctx.tenant),
    prisma.membership.count({ where: { tenantId: ctx.tenantId } }),
  ]);
  const base = `/console/${ws}/clientes/${slug}`;
  const address = tenantAddress({ slug, domains });
  const devHref = env.NODE_ENV === "production" ? `https://${address}` : `/t/${slug}`;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Clientes", href: `/console/${ws}` }, { label: ctx.tenant.name }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar
              name={ctx.tenant.name}
              color={ctx.tenant.branding?.primaryColor}
              size="md"
              square
            />
            <span className="min-w-0 truncate">{ctx.tenant.name}</span>
          </span>
        }
        meta={
          <>
            <Badge tone={ctx.tenant.status === "ACTIVE" ? "success" : "warning"} dot>
              {ctx.tenant.status === "ACTIVE" ? "Ativo" : "Suspenso"}
            </Badge>
            <a
              href={devHref}
              target="_blank"
              rel="noreferrer"
              className="text-fg-subtle hover:text-brand-text inline-flex items-center gap-1.5 font-mono text-sm"
            >
              {address}
              <ExternalLink className="size-3.5" />
            </a>
          </>
        }
        className="pb-4"
      />
      <LinkTabs
        className="mb-8"
        items={[
          { href: base, label: "Visão geral", exact: true },
          { href: `${base}/modulos`, label: "Módulos", count: active.size },
          { href: `${base}/identidade`, label: "Identidade visual" },
          { href: `${base}/termos`, label: "Nomenclatura" },
          { href: `${base}/equipe`, label: "Equipe", count: members },
        ]}
      />
      {children}
    </>
  );
}
