import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { PROJECT_STATUS_LABELS, projectTemplate } from "@mais/core";
import { Badge, Button, EmptyState } from "@/components/ui";
import { DataTable } from "@/components/ui/data-table";
import { guard, requireTenant } from "@/server/auth";
import { visibleProjectsWhere } from "@/server/projects";
import { tenantDb } from "@/server/tenant-db";
import { formatPeriod, statusTone } from "./format";

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { ws, tenant: slug } = await params;
  const ctx = await guard(requireTenant(slug));
  const db = tenantDb(ctx);
  const projects = await db.project.findMany({
    // Vínculo restrito (acesso por projeto) só lista os projetos liberados
    where: { archivedAt: null, ...(await visibleProjectsWhere(ctx)) },
    orderBy: [{ startsAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    include: { _count: { select: { registrations: true } } },
  });
  const base = `/console/${ws}/clientes/${slug}/projetos`;
  const canCreate = ctx.role === "ADMIN" || ctx.role === "MANAGER";
  const tz = ctx.tenant.timezone;

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<FolderKanban />}
        title="Crie o primeiro projeto"
        description="Uma viagem de incentivo, um evento, uma feira ou uma imersão. Cada projeto reúne inscrições, logística e comunicação num só lugar."
        action={
          canCreate && (
            <Button asChild>
              <Link href={`${base}/novo`}>
                <Plus /> Novo projeto
              </Link>
            </Button>
          )
        }
      />
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-fg-muted text-base">
          {projects.length} {projects.length === 1 ? "projeto ativo" : "projetos ativos"}
        </p>
        {canCreate && (
          <Button asChild>
            <Link href={`${base}/novo`}>
              <Plus /> Novo projeto
            </Link>
          </Button>
        )}
      </div>
      <DataTable
        caption="Projetos do cliente"
        rows={projects}
        rowKey={(p) => p.id}
        rowHref={(p) => `${base}/${p.slug}`}
        columns={[
          {
            key: "name",
            header: "Projeto",
            mobile: "primary",
            cell: (p) => (
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="text-fg-subtle block truncate text-sm">
                  {projectTemplate(p.type).name}
                  {p.destination || p.venueName ? ` · ${p.destination || p.venueName}` : ""}
                </span>
              </span>
            ),
          },
          {
            key: "when",
            header: "Período",
            mobile: "secondary",
            cell: (p) => (
              <span className="tabular text-fg-muted">
                {formatPeriod(p.startsAt, p.endsAt, p.timezone ?? tz)}
              </span>
            ),
          },
          {
            key: "regs",
            header: "Inscrições",
            align: "right",
            mobile: "desktopOnly",
            cell: (p) => <span className="tabular">{p._count.registrations}</span>,
          },
          {
            key: "status",
            header: "Status",
            mobile: "meta",
            cell: (p) => (
              <Badge tone={statusTone(p.status)} dot>
                {PROJECT_STATUS_LABELS[p.status]}
              </Badge>
            ),
          },
        ]}
      />
    </>
  );
}
