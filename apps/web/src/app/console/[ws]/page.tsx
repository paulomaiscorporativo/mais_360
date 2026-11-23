import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { activeTenantModules, workspaceModules } from "@mais/core";
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  Stat,
  type Column,
} from "@/components/ui";
import { guard, requireWorkspace } from "@/server/auth";
import { prisma } from "@/server/db";
import { tenantAddress } from "@/server/urls";

export const metadata: Metadata = { title: "Clientes" };

const STATUS: Record<
  string,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }
> = {
  TRIAL: { label: "Em teste", tone: "info" },
  ACTIVE: { label: "Ativo", tone: "success" },
  PAST_DUE: { label: "Pagamento pendente", tone: "warning" },
  SUSPENDED: { label: "Suspenso", tone: "danger" },
  CANCELED: { label: "Cancelado", tone: "neutral" },
};

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function WorkspaceHome({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { workspace, role } = await guard(requireWorkspace(ws));
  const [sub, tenants] = await Promise.all([
    prisma.subscription.findUnique({
      where: { workspaceId: workspace.id },
      include: { plan: true },
    }),
    prisma.tenant.findMany({
      where: { workspaceId: workspace.id, status: { not: "ARCHIVED" } },
      orderBy: { name: "asc" },
      include: {
        branding: true,
        modules: true,
        domains: { where: { primary: true, status: "VERIFIED" }, take: 1 },
        _count: { select: { memberships: true, projects: true } },
      },
    }),
  ]);
  const allowed = sub ? workspaceModules(sub.plan.modules, sub.extraModules) : new Set<never>();
  const limit = (sub?.plan.limits as { tenants?: number } | null)?.tenants;
  const canCreate = role === "OWNER" || role === "ADMIN";
  const status = STATUS[workspace.status] ?? STATUS.ACTIVE!;

  type Row = (typeof tenants)[number] & { activeCount: number };
  const rows: Row[] = tenants.map((t) => ({
    ...t,
    activeCount: activeTenantModules(t.modules, allowed).size,
  }));

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Cliente",
      mobile: "primary",
      cell: (t) => (
        <span className="flex items-center gap-3">
          <Avatar name={t.name} color={t.branding?.primaryColor} size="sm" square />
          <span className="min-w-0">
            <span className="block truncate font-medium">{t.name}</span>
            <span className="text-fg-subtle block truncate text-sm md:hidden">
              {tenantAddress(t)} · {t.activeCount} {t.activeCount === 1 ? "módulo" : "módulos"}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "domain",
      header: "Endereço",
      mobile: "desktopOnly",
      className: "text-fg-muted",
      cell: (t) => <span className="font-mono text-sm">{tenantAddress(t)}</span>,
    },
    {
      key: "modules",
      header: "Módulos",
      mobile: "desktopOnly",
      cell: (t) => (
        <span className="tabular text-fg-muted">
          {t.activeCount} {t.activeCount === 1 ? "módulo" : "módulos"}
        </span>
      ),
    },
    {
      key: "team",
      header: "Equipe",
      mobile: "desktopOnly",
      align: "right",
      cell: (t) => <span className="text-fg-muted">{t._count.memberships}</span>,
    },
    {
      key: "created",
      header: "Desde",
      mobile: "meta",
      align: "right",
      cell: (t) => <span className="text-fg-subtle text-sm">{dateFmt.format(t.createdAt)}</span>,
    },
  ];

  const newHref = `/console/${workspace.slug}/clientes/novo`;

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Empresas e associações atendidas por este assinante. Cada cliente tem marca, nomenclatura e módulos próprios."
        meta={
          <>
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
            {sub && <Badge tone="brand">Plano {sub.plan.name}</Badge>}
          </>
        }
        actions={
          canCreate &&
          tenants.length > 0 && (
            <Button asChild>
              <Link href={newHref}>
                <Plus /> Novo cliente
              </Link>
            </Button>
          )
        }
      />

      <div className="border-border bg-border mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:grid-cols-3">
        <Stat
          className="bg-surface px-5 py-4"
          label="Clientes ativos"
          value={tenants.length}
          hint={limit ? `de ${limit} no plano` : "sem limite no plano"}
        />
        <Stat
          className="bg-surface px-5 py-4"
          label="Projetos"
          value={tenants.reduce((n, t) => n + t._count.projects, 0)}
          hint="viagens, eventos e feiras"
        />
        <Stat
          className="bg-surface col-span-2 px-5 py-4 sm:col-span-1"
          label="Módulos no plano"
          value={allowed.size}
          hint="disponíveis para liberar"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title="Cadastre o primeiro cliente"
          description="Defina a identidade visual, como ele chama seus membros e quais módulos contratou. Leva dois minutos."
          action={
            canCreate && (
              <Button asChild>
                <Link href={newHref}>
                  <Plus /> Novo cliente
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <DataTable
          caption="Clientes do assinante"
          rows={rows}
          columns={columns}
          rowKey={(t) => t.id}
          rowHref={(t) => `/console/${workspace.slug}/clientes/${t.slug}`}
        />
      )}
    </>
  );
}
