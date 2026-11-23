import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Building2, History } from "lucide-react";
import {
  availableStatusActions,
  WORKSPACE_STATUS_LABELS,
  WORKSPACE_STATUS_ACTION_SPECS,
} from "@mais/core/workspaces";
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  Stat,
  type Column,
} from "@/components/ui";
import { guard, requirePlatformRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { describeAuditEntry, STATUS_TONE } from "../labels";
import { WorkspaceActions } from "./manage";

export const metadata: Metadata = { title: "Assinante" };

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("pt-BR");
const tz = env.DEFAULT_TIMEZONE;
const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: tz });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: tz,
});

const TENANT_STATUS = {
  ACTIVE: { label: "Ativo", tone: "success" },
  SUSPENDED: { label: "Suspenso", tone: "warning" },
  ARCHIVED: { label: "Arquivado", tone: "neutral" },
} as const;

const USAGE_LABELS = {
  REGISTRATIONS: "Inscrições",
  WHATSAPP_MESSAGES: "Mensagens de WhatsApp",
  EMAILS: "E-mails",
  FACE_MATCHES: "Reconhecimentos faciais",
  BADGES_PRINTED: "Credenciais impressas",
  STORAGE_BYTES: "Armazenamento (bytes)",
} as const;

export default async function WorkspaceDetailPage({ params }: { params: Promise<{ ws: string }> }) {
  const viewer = await guard(requirePlatformRole(["SUPERADMIN", "SUPPORT"]));
  const { ws: slug } = await params;
  const ws = await prisma.workspace.findUnique({
    where: { slug },
    include: {
      subscription: { include: { plan: true } },
      tenants: {
        orderBy: { name: "asc" },
        include: {
          branding: { select: { primaryColor: true } },
          _count: { select: { projects: true, memberships: true } },
        },
      },
      _count: { select: { members: true } },
    },
  });
  if (!ws) notFound();

  const since = new Date(Date.now() - 30 * 86_400_000);
  const [activeProjects, usage, history, plans] = await Promise.all([
    prisma.project.count({ where: { tenant: { workspaceId: ws.id }, archivedAt: null } }),
    prisma.usageRecord.groupBy({
      by: ["metric"],
      where: { workspaceId: ws.id, day: { gte: since } },
      _sum: { quantity: true },
    }),
    prisma.auditLog.findMany({
      where: { entityType: "Workspace", entityId: ws.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, action: true, actorLabel: true, data: true, createdAt: true },
    }),
    prisma.plan.findMany({
      where: { archivedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, priceCents: true },
    }),
  ]);

  const plan = ws.subscription?.plan;
  const limits = (plan?.limits ?? {}) as Record<string, number | undefined>;
  const ofLimit = (key: string) => {
    const max = limits[key];
    return max === undefined ? "sem limite no plano" : `de ${num.format(max)} no plano`;
  };
  const canEdit = viewer.isSuperadmin;
  const actions = availableStatusActions(ws.status);
  const showReason = ws.statusReason && ws.status !== "TRIAL" && ws.status !== "ACTIVE";

  type TenantRow = (typeof ws.tenants)[number];
  const tenantColumns: Column<TenantRow>[] = [
    {
      key: "name",
      header: "Cliente",
      mobile: "primary",
      cell: (t) => (
        <span className="flex items-center gap-3">
          <Avatar name={t.name} color={t.branding?.primaryColor} size="sm" square />
          <span className="min-w-0">
            <span className="block truncate font-medium">{t.name}</span>
            <span className="text-fg-subtle block truncate font-mono text-xs">{t.slug}</span>
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Situação",
      mobile: "meta",
      cell: (t) => (
        <Badge tone={TENANT_STATUS[t.status].tone} dot size="sm">
          {TENANT_STATUS[t.status].label}
        </Badge>
      ),
    },
    {
      key: "projects",
      header: "Projetos",
      align: "right",
      mobile: "secondary",
      cell: (t) => (
        <span className="text-fg-muted tabular">
          {num.format(t._count.projects)}
          <span className="md:hidden"> projetos</span>
        </span>
      ),
    },
    {
      key: "members",
      header: "Equipe",
      align: "right",
      mobile: "desktopOnly",
      cell: (t) => (
        <span className="text-fg-muted tabular">{num.format(t._count.memberships)}</span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Assinantes", href: "/console/plataforma" }, { label: ws.name }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={ws.name} size="md" square />
            <span className="min-w-0 truncate">{ws.name}</span>
          </span>
        }
        meta={
          <>
            <Badge tone={STATUS_TONE[ws.status]} dot>
              {WORKSPACE_STATUS_LABELS[ws.status]}
            </Badge>
            <span className="text-fg-subtle font-mono text-sm">{ws.slug}</span>
          </>
        }
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href={`/console/${ws.slug}`}>
                Abrir console <ArrowUpRight />
              </Link>
            </Button>
            {canEdit && (
              <WorkspaceActions
                workspace={{
                  id: ws.id,
                  name: ws.name,
                  status: ws.status,
                  legalName: ws.legalName,
                  document: ws.document,
                  billingEmail: ws.billingEmail,
                  whiteLabel: ws.whiteLabel,
                  trialEndsAt: ws.trialEndsAt?.toISOString() ?? null,
                  planId: ws.subscription?.planId ?? null,
                }}
                plans={plans}
                statusActions={actions.map((a) => ({
                  action: a,
                  label: WORKSPACE_STATUS_ACTION_SPECS[a].label,
                  effect: WORKSPACE_STATUS_ACTION_SPECS[a].effect,
                  destructive: WORKSPACE_STATUS_ACTION_SPECS[a].destructive,
                  to: WORKSPACE_STATUS_LABELS[WORKSPACE_STATUS_ACTION_SPECS[a].to],
                }))}
              />
            )}
          </>
        }
      />

      {!canEdit && (
        <Notice className="mb-6" tone="info" title="Somente consulta">
          O suporte da plataforma vê os dados do assinante; mudanças ficam com o superadmin.
        </Notice>
      )}
      {showReason && (
        <Notice
          className="mb-6"
          tone={ws.status === "PAST_DUE" ? "warning" : "danger"}
          title={`${WORKSPACE_STATUS_LABELS[ws.status]}${ws.statusChangedAt ? ` desde ${dateTimeFmt.format(ws.statusChangedAt)}` : ""}`}
        >
          Motivo: {ws.statusReason}
        </Notice>
      )}

      <div className="border-border bg-border mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border lg:grid-cols-4">
        <Stat
          className="bg-surface px-5 py-4"
          label="Clientes"
          value={num.format(ws.tenants.length)}
          hint={ofLimit("tenants")}
        />
        <Stat
          className="bg-surface px-5 py-4"
          label="Projetos ativos"
          value={num.format(activeProjects)}
          hint={ofLimit("activeProjects")}
        />
        <Stat
          className="bg-surface px-5 py-4"
          label="Usuários do assinante"
          value={num.format(ws._count.members)}
          hint={ofLimit("users")}
        />
        <Stat
          className="bg-surface px-5 py-4"
          label="Mensalidade"
          value={
            plan ? (plan.priceCents ? brl.format(plan.priceCents / 100) : "Sob consulta") : "—"
          }
          hint={plan ? `plano ${plan.name}` : "sem plano"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel>
            <PanelHeader title="Dados do assinante" />
            <PanelBody>
              <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                <Item label="Razão social" value={ws.legalName} />
                <Item label="CNPJ" value={formatCnpj(ws.document)} mono />
                <Item label="E-mail de cobrança" value={ws.billingEmail} />
                <Item label="Marca própria (white-label)" value={ws.whiteLabel ? "Sim" : "Não"} />
                <Item label="Cliente desde" value={dateFmt.format(ws.createdAt)} />
                <Item
                  label="Situação da assinatura"
                  value={
                    ws.status === "TRIAL"
                      ? ws.trialEndsAt
                        ? `Em teste até ${dateFmt.format(ws.trialEndsAt)}`
                        : "Em teste, sem data de fim"
                      : WORKSPACE_STATUS_LABELS[ws.status]
                  }
                />
              </dl>
            </PanelBody>
          </Panel>

          <section aria-labelledby="clientes-titulo">
            <h2 id="clientes-titulo" className="mb-3 text-base font-semibold">
              Clientes
            </h2>
            {ws.tenants.length ? (
              <DataTable
                caption="Clientes do assinante"
                rows={ws.tenants}
                columns={tenantColumns}
                rowKey={(t) => t.id}
                rowHref={(t) => `/console/${ws.slug}/clientes/${t.slug}`}
              />
            ) : (
              <EmptyState
                icon={<Building2 />}
                title="Ainda sem clientes"
                description="O próprio assinante cadastra os clientes pelo console dele."
                action={
                  <Button variant="secondary" asChild>
                    <Link href={`/console/${ws.slug}`}>Abrir console do assinante</Link>
                  </Button>
                }
              />
            )}
          </section>

          <Panel>
            <PanelHeader title="Uso nos últimos 30 dias" />
            <PanelBody>
              {usage.length ? (
                <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                  {usage.map((u) => (
                    <Item
                      key={u.metric}
                      label={USAGE_LABELS[u.metric]}
                      value={num.format(u._sum.quantity ?? 0)}
                    />
                  ))}
                </dl>
              ) : (
                <p className="text-fg-muted text-sm">
                  Nenhum consumo medido no período. A medição aparece aqui conforme os clientes
                  recebem inscrições e enviam mensagens.
                </p>
              )}
            </PanelBody>
          </Panel>
        </div>

        <Panel className="self-start">
          <PanelHeader title="Histórico" />
          <PanelBody>
            {history.length ? (
              <ol className="flex flex-col gap-5">
                {history.map((h) => {
                  const d = describeAuditEntry(h, (x) => dateFmt.format(x));
                  return (
                    <li key={h.id} className="border-border relative border-l pl-4">
                      <span
                        aria-hidden
                        className="bg-border-strong absolute top-1.5 -left-[3px] size-1.5 rounded-full"
                      />
                      <p className="text-sm font-medium">{d.title}</p>
                      {d.detail && <p className="text-fg-muted mt-0.5 text-sm">{d.detail}</p>}
                      <p className="text-fg-subtle mt-1 text-xs">
                        <time dateTime={h.createdAt.toISOString()}>
                          {dateTimeFmt.format(h.createdAt)}
                        </time>
                        {h.actorLabel ? ` · ${h.actorLabel}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="text-fg-muted flex items-start gap-3 text-sm">
                <History className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  As mudanças de dados, plano, teste e situação feitas a partir de agora ficam
                  registradas aqui, com quem fez e quando.
                </p>
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-fg-subtle text-xs font-medium">{label}</dt>
      <dd className={mono ? "mt-1 truncate font-mono" : "mt-1 truncate"}>
        {value || <span className="text-fg-faint">Não informado</span>}
      </dd>
    </div>
  );
}

function formatCnpj(d: string) {
  return d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : d;
}
