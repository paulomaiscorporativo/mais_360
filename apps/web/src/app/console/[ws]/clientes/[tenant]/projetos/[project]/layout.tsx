import { CalendarDays, MapPin } from "lucide-react";
import { PROJECT_STATUS_LABELS, projectTemplate } from "@mais/core";
import { Badge, PageHeader } from "@/components/ui";
import { LinkTabs } from "@/components/ui/tabs";
import { projectNavFor } from "@/config/project-nav";
import { guard } from "@/server/auth";
import { projectBase, requireProject } from "@/server/projects";
import { formatPeriod, statusTone } from "../../(gestao)/projetos/format";

/**
 * Cabeçalho e navegação de TODO projeto. A navegação vem do registro
 * (config/project-nav.ts) filtrado pelos recursos ligados. A checagem de
 * acesso acontece aqui, antes de qualquer Suspense (404 real).
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project: slug } = await params;
  const p = await guard(requireProject(ws, tenant, slug));
  const base = projectBase(ws, tenant, slug);
  const tz = p.project.timezone ?? p.tenant.timezone;
  const nav = projectNavFor(p.features);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Clientes", href: `/console/${ws}` },
          { label: p.tenant.name, href: `/console/${ws}/clientes/${tenant}` },
          { label: "Projetos", href: `/console/${ws}/clientes/${tenant}/projetos` },
          { label: p.project.name },
        ]}
        title={p.project.name}
        meta={
          <>
            <Badge tone={statusTone(p.project.status)} dot>
              {PROJECT_STATUS_LABELS[p.project.status]}
            </Badge>
            <span className="text-fg-subtle text-sm">{projectTemplate(p.project.type).name}</span>
            <span className="text-fg-subtle inline-flex items-center gap-1.5 text-sm">
              <CalendarDays className="size-3.5" />
              <span className="tabular">
                {formatPeriod(p.project.startsAt, p.project.endsAt, tz)}
              </span>
            </span>
            {(p.project.destination || p.project.venueName) && (
              <span className="text-fg-subtle inline-flex items-center gap-1.5 text-sm">
                <MapPin className="size-3.5" />
                {p.project.destination || p.project.venueName}
              </span>
            )}
          </>
        }
        className="pb-4"
      />
      <LinkTabs
        className="mb-8"
        items={nav.map((e) => {
          const Icon = e.icon;
          return {
            href: `${base}${e.href}`,
            label: e.label,
            icon: <Icon className="size-4" />,
            exact: e.href === "",
          };
        })}
      />
      {children}
    </>
  );
}
