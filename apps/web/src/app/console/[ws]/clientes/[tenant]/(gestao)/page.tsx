import Link from "next/link";
import { ArrowRight, History } from "lucide-react";
import { MODULES } from "@mais/core";
import { Button, EmptyState, Panel, PanelHeader, Stat } from "@/components/ui";
import { MODULE_UI, moduleHref } from "@/config/modules-ui";
import { termsWithDefaults } from "@/config/terms";
import { guard, requireTenant } from "@/server/auth";
import { prisma } from "@/server/db";
import { visibleProjectsWhere } from "@/server/projects";
import { modulesForTenant } from "@/server/modules";

const ACTIONS: Record<string, string> = {
  "tenant.create": "criou o cliente",
  "tenant.branding.update": "atualizou a identidade visual",
  "tenant.terms.update": "atualizou a nomenclatura",
  "tenant.modules.update": "alterou os módulos",
  "tenant.member.add": "adicionou uma pessoa à equipe",
  "tenant.member.role": "alterou o papel de uma pessoa",
  "tenant.member.remove": "removeu uma pessoa da equipe",
};

const when = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function TenantOverview({
  params,
}: {
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { ws, tenant: slug } = await params;
  const ctx = await guard(requireTenant(slug));
  const [active, terms, counts, logs] = await Promise.all([
    modulesForTenant(ctx.tenant),
    prisma.tenantTerm.findMany({ where: { tenantId: ctx.tenantId } }),
    Promise.all([
      prisma.person.count({ where: { tenantId: ctx.tenantId, isMember: true } }),
      visibleProjectsWhere(ctx).then((visible) =>
        prisma.project.count({ where: { tenantId: ctx.tenantId, archivedAt: null, ...visible } }),
      ),
      prisma.membership.count({ where: { tenantId: ctx.tenantId } }),
    ]),
    prisma.auditLog.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);
  const t = termsWithDefaults(terms);
  const [members, projects, team] = counts;
  const base = `/console/${ws}/clientes/${slug}`;
  const b = ctx.tenant.branding;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="border-border bg-border grid grid-cols-3 gap-px overflow-hidden rounded-md border">
          <Stat className="bg-surface px-5 py-4" label={t["member.plural"]} value={members} />
          <Stat className="bg-surface px-5 py-4" label="Projetos" value={projects} />
          <Stat className="bg-surface px-5 py-4" label="Equipe" value={team} />
        </div>

        <Panel>
          <PanelHeader
            title="Módulos ativos"
            description="O que este cliente contratou e já pode usar."
            actions={
              <Button variant="ghost" size="sm" asChild>
                <Link href={`${base}/modulos`}>
                  Gerenciar <ArrowRight />
                </Link>
              </Button>
            }
          />
          {active.size === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nenhum módulo liberado"
                description="Libere os módulos contratados para o cliente começar a operar."
                action={
                  <Button asChild>
                    <Link href={`${base}/modulos`}>Liberar módulos</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="divide-border grid divide-y sm:grid-cols-2 sm:divide-y-0">
              {[...active].map((m, i) => {
                const Icon = MODULE_UI[m].icon;
                return (
                  <li key={m} className={i >= 2 ? "sm:border-border sm:border-t" : undefined}>
                    <Link
                      href={moduleHref(base, m)}
                      className="group hover:bg-surface-muted flex items-start gap-3 px-5 py-4 transition-colors"
                    >
                      <span className="bg-brand-subtle text-brand-subtle-fg grid size-8 shrink-0 place-items-center rounded-sm [&_svg]:size-4">
                        <Icon />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-base font-medium">{MODULES[m].name}</span>
                        <span className="text-fg-subtle mt-0.5 line-clamp-2 block text-sm">
                          {MODULES[m].summary}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="flex flex-col gap-6">
        <Panel>
          <PanelHeader
            title="Identidade"
            actions={
              <Button variant="ghost" size="sm" asChild>
                <Link href={`${base}/identidade`}>Editar</Link>
              </Button>
            }
          />
          <dl className="divide-border divide-y text-base">
            <div className="flex items-center justify-between px-5 py-3">
              <dt className="text-fg-subtle">Cores</dt>
              <dd className="flex items-center gap-1.5">
                <span
                  className="size-5 rounded-full ring-1 ring-black/10 ring-inset"
                  style={{ background: b?.primaryColor }}
                />
                <span
                  className="size-5 rounded-full ring-1 ring-black/10 ring-inset"
                  style={{ background: b?.accentColor }}
                />
                <span className="text-fg-muted ml-1 font-mono text-sm uppercase">
                  {b?.primaryColor}
                </span>
              </dd>
            </div>
            <div className="flex justify-between px-5 py-3">
              <dt className="text-fg-subtle">Fonte</dt>
              <dd>{b?.fontFamily ?? "Instrument Sans"}</dd>
            </div>
            <div className="flex justify-between px-5 py-3">
              <dt className="text-fg-subtle">Membros</dt>
              <dd>{t["member.plural"]}</dd>
            </div>
            <div className="flex justify-between px-5 py-3">
              <dt className="text-fg-subtle">Empresas</dt>
              <dd>{t["org.plural"]}</dd>
            </div>
          </dl>
        </Panel>

        <Panel>
          <PanelHeader title="Atividade recente" />
          {logs.length === 0 ? (
            <p className="text-fg-subtle flex items-center gap-2 px-5 py-6 text-sm">
              <History className="size-4" /> As alterações feitas neste cliente aparecem aqui.
            </p>
          ) : (
            <ol className="flex flex-col gap-4 px-5 py-4">
              {logs.map((l) => (
                <li
                  key={l.id}
                  className="before:bg-border-strong relative pl-5 text-sm before:absolute before:top-1.5 before:left-0 before:size-2 before:rounded-full"
                >
                  <span className="font-medium">{l.actorLabel || "Sistema"}</span>{" "}
                  <span className="text-fg-muted">{ACTIONS[l.action] ?? l.action}</span>
                  <span className="text-fg-faint block text-xs">{when.format(l.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
