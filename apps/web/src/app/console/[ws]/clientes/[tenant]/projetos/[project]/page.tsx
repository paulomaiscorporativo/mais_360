import Link from "next/link";
import { ArrowRight, Link2, UserPlus } from "lucide-react";
import { PROJECT_FEATURE_LABELS, readProjectSettings } from "@mais/core";
import { Badge, Button, EmptyState, Panel, PanelHeader, Stat } from "@/components/ui";
import { guard } from "@/server/auth";
import { projectBase, requireProject } from "@/server/projects";
import { publicFormUrl } from "@/server/public-links";
import { CopyButton } from "./copy-button";

export default async function ProjectOverview({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project: slug } = await params;
  const p = await guard(requireProject(ws, tenant, slug));
  const base = projectBase(ws, tenant, slug);
  const [byStatus, checkedIn, categories, recent] = await Promise.all([
    p.db.registration.groupBy({ by: ["status"], where: { projectId: p.projectId }, _count: true }),
    p.db.registration.count({ where: { projectId: p.projectId, checkedInAt: { not: null } } }),
    p.db.registrationCategory.findMany({
      where: { projectId: p.projectId },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { registrations: { where: { status: { not: "CANCELED" } } } } },
      },
    }),
    p.db.registration.findMany({
      where: { projectId: p.projectId },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { person: true, category: true },
    }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const active = byStatus.filter((b) => b.status !== "CANCELED").reduce((a, b) => a + b._count, 0);
  const maxCat = Math.max(1, ...categories.map((c) => c._count.registrations));
  const settings = readProjectSettings(p.project.settings);
  const formOn = p.features.has("REGISTRATION_FORM");
  const url = await publicFormUrl(p.tenant, p.project.publicToken);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="border-border bg-border grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:grid-cols-4">
          <Stat className="bg-surface px-5 py-4" label="Inscrições" value={active} />
          <Stat className="bg-surface px-5 py-4" label="Confirmadas" value={count("CONFIRMED")} />
          <Stat
            className="bg-surface px-5 py-4"
            label="Pendentes"
            value={count("PENDING") + count("INVITED")}
          />
          <Stat className="bg-surface px-5 py-4" label="Credenciadas" value={checkedIn} />
        </div>

        <Panel>
          <PanelHeader
            title="Últimas inscrições"
            actions={
              <Button variant="ghost" size="sm" asChild>
                <Link href={`${base}/inscricoes`}>
                  Ver todas <ArrowRight />
                </Link>
              </Button>
            }
          />
          {recent.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<UserPlus />}
                title="Ninguém inscrito ainda"
                description={
                  formOn
                    ? "Compartilhe o link de inscrição, importe uma planilha ou adicione pessoas uma a uma."
                    : "Importe uma planilha ou adicione pessoas uma a uma."
                }
                action={
                  <Button asChild>
                    <Link href={`${base}/inscricoes`}>Adicionar inscrições</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="divide-border divide-y">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium">
                      {r.person.firstName} {r.person.lastName}
                    </span>
                    <span className="text-fg-subtle block truncate text-sm">
                      {r.displayCompany || r.person.email || "—"}
                    </span>
                  </span>
                  {r.category && (
                    <Badge size="sm">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: r.category.color }}
                      />
                      {r.category.name}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {categories.length > 0 && (
          <Panel>
            <PanelHeader title="Por categoria" />
            <ul className="flex flex-col gap-3 px-5 py-4">
              {categories.map((c) => (
                <li
                  key={c.id}
                  className="grid grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-3 text-sm"
                >
                  <span className="truncate">{c.name}</span>
                  <span className="bg-surface-sunken h-2 overflow-hidden rounded-full">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(c._count.registrations / maxCat) * 100}%`,
                        background: c.color,
                      }}
                    />
                  </span>
                  <span className="tabular text-fg-muted w-10 text-right">
                    {c._count.registrations}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <div className="flex flex-col gap-6">
        {formOn && (
          <Panel>
            <PanelHeader
              title="Link de inscrição"
              description={
                settings.form.open
                  ? "Aberto ao público."
                  : "Fechado — ninguém consegue se inscrever."
              }
              actions={
                <Badge tone={settings.form.open ? "success" : "neutral"} dot>
                  {settings.form.open ? "Aberto" : "Fechado"}
                </Badge>
              }
            />
            <div className="flex flex-col gap-3 px-5 pb-5">
              <code className="bg-surface-muted text-fg-muted block truncate rounded-sm px-3 py-2 font-mono text-xs">
                {url}
              </code>
              <div className="flex gap-2">
                <CopyButton value={url} />
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`${base}/formulario`}>
                    <Link2 /> Configurar
                  </Link>
                </Button>
              </div>
            </div>
          </Panel>
        )}

        <Panel>
          <PanelHeader
            title="Recursos ligados"
            actions={
              p.canEdit && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`${base}/configuracoes#recursos`}>Ajustar</Link>
                </Button>
              )
            }
          />
          {p.features.size === 0 ? (
            <p className="text-fg-subtle px-5 pb-5 text-sm">
              Nenhum recurso ligado. Ligue em Configurações.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2 px-5 pb-5">
              {[...p.features].map((f) => (
                <li key={f}>
                  <Badge tone="brand">{PROJECT_FEATURE_LABELS[f].label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
