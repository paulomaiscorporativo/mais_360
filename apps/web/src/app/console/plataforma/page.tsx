import type { Metadata } from "next";
import { Avatar, Badge, DataTable, PageHeader, Stat, type Column } from "@/components/ui";
import { guard, requirePlatformRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { NewWorkspaceButton } from "./new-workspace";

export const metadata: Metadata = { title: "Assinantes" };

const STATUS = {
  TRIAL: { label: "Em teste", tone: "info" },
  ACTIVE: { label: "Ativo", tone: "success" },
  PAST_DUE: { label: "Pagamento pendente", tone: "warning" },
  SUSPENDED: { label: "Suspenso", tone: "danger" },
  CANCELED: { label: "Cancelado", tone: "neutral" },
} as const;

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function PlatformHome() {
  const viewer = await guard(requirePlatformRole(["SUPERADMIN", "SUPPORT"]));
  const [workspaces, plans] = await Promise.all([
    prisma.workspace.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { tenants: true, members: true } },
      },
    }),
    prisma.plan.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } }),
  ]);

  type Row = (typeof workspaces)[number];
  const mrr = workspaces
    .filter((w) => w.subscription?.status === "ACTIVE")
    .reduce((sum, w) => sum + (w.subscription?.plan.priceCents ?? 0), 0);
  const trials = workspaces.filter((w) => w.status === "TRIAL").length;

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Assinante",
      mobile: "primary",
      cell: (w) => (
        <span className="flex items-center gap-3">
          <Avatar name={w.name} size="sm" square />
          <span className="min-w-0">
            <span className="block truncate font-medium">{w.name}</span>
            <span className="text-fg-subtle block truncate font-mono text-xs">{w.slug}</span>
          </span>
        </span>
      ),
    },
    {
      key: "plan",
      header: "Plano",
      mobile: "secondary",
      cell: (w) => (
        <span className="text-fg-muted">{w.subscription?.plan.name ?? "Sem plano"}</span>
      ),
    },
    {
      key: "status",
      header: "Situação",
      mobile: "meta",
      cell: (w) => {
        const s = STATUS[w.status];
        return (
          <Badge tone={s.tone} dot size="sm">
            {s.label}
          </Badge>
        );
      },
    },
    {
      key: "tenants",
      header: "Clientes",
      align: "right",
      mobile: "secondary",
      cell: (w) => (
        <span className="text-fg-muted">
          {w._count.tenants}
          <span className="md:hidden"> clientes</span>
        </span>
      ),
    },
    {
      key: "created",
      header: "Desde",
      align: "right",
      mobile: "desktopOnly",
      cell: (w) => <span className="text-fg-subtle text-sm">{dateFmt.format(w.createdAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Assinantes"
        description="Agências, organizadoras e associações que contratam a plataforma."
        actions={
          viewer.isSuperadmin && (
            <NewWorkspaceButton
              plans={plans.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents }))}
            />
          )
        }
      />
      <div className="border-border bg-border mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border lg:grid-cols-4">
        <Stat className="bg-surface px-5 py-4" label="Assinantes" value={workspaces.length} />
        <Stat className="bg-surface px-5 py-4" label="Em teste" value={trials} />
        <Stat
          className="bg-surface px-5 py-4"
          label="Clientes atendidos"
          value={workspaces.reduce((n, w) => n + w._count.tenants, 0)}
        />
        <Stat
          className="bg-surface px-5 py-4"
          label="Receita recorrente"
          value={brl.format(mrr / 100)}
          hint="assinaturas ativas, por mês"
        />
      </div>
      <DataTable
        caption="Assinantes"
        rows={workspaces}
        columns={columns}
        rowKey={(w) => w.id}
        rowHref={(w) => `/console/${w.slug}`}
      />
    </>
  );
}
