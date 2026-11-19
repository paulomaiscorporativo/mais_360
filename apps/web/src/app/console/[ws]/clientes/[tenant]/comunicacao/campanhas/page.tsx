import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle, Plus, Send } from "lucide-react";
import { Badge, Button, DataTable, EmptyState } from "@/components/ui";
import { CampaignProgress } from "@/components/communication/campaign-progress";
import { CAMPAIGN_STATUS, fmtDateTime } from "@/components/communication/labels";
import { guard } from "@/server/auth";
import { communicationBase, projectOptions, requireCommunication } from "@/server/communication";

export const metadata: Metadata = { title: "Envios" };

const STATUS_FILTERS = [
  { key: "todos", label: "Todos", statuses: null },
  {
    key: "andamento",
    label: "Em andamento",
    statuses: ["RUNNING", "WAITING_WINDOW", "SCHEDULED", "PAUSED"],
  },
  { key: "concluidos", label: "Concluídos", statuses: ["COMPLETED"] },
  { key: "interrompidos", label: "Cancelados ou interrompidos", statuses: ["CANCELED", "FAILED"] },
] as const;

export default async function CampaignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; tenant: string }>;
  searchParams: Promise<{ status?: string; canal?: string }>;
}) {
  const { ws, tenant } = await params;
  const sp = await searchParams;
  const ctx = await guard(requireCommunication(tenant));
  const base = communicationBase(ws, tenant);
  const filter = STATUS_FILTERS.find((f) => f.key === sp.status) ?? STATUS_FILTERS[0];
  const channel = sp.canal === "email" ? "EMAIL" : sp.canal === "whatsapp" ? "WHATSAPP" : null;

  const [rows, projects, total] = await Promise.all([
    ctx.db.messageCampaign.findMany({
      where: {
        ...(filter.statuses ? { status: { in: [...filter.statuses] } } : {}),
        ...(channel ? { channel } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    projectOptions(ctx),
    ctx.db.messageCampaign.count(),
  ]);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const canSend = ["ADMIN", "MANAGER"].includes(ctx.role);
  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const status = "status" in patch ? patch.status : (sp.status ?? null);
    const canal = "canal" in patch ? patch.canal : (sp.canal ?? null);
    if (status && status !== "todos") q.set("status", status);
    if (canal) q.set("canal", canal);
    const s = q.toString();
    return `${base}/campanhas${s ? `?${s}` : ""}`;
  };

  if (total === 0) {
    return (
      <EmptyState
        icon={<Send />}
        title="Nenhum envio ainda"
        description="Escolha um modelo, o público e o canal. O sistema mostra quem vai receber — e quem será pulado — antes de confirmar."
        action={
          canSend && (
            <Button asChild>
              <Link href={`${base}/campanhas/nova`}>
                <Plus /> Novo envio
              </Link>
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href({ status: f.key })}
              aria-current={f.key === filter.key ? "true" : undefined}
              className={
                f.key === filter.key
                  ? "border-fg bg-fg text-canvas inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium"
                  : "border-border-strong text-fg-muted hover:text-fg inline-flex h-8 items-center rounded-full border px-3 text-sm"
              }
            >
              {f.label}
            </Link>
          ))}
          <span aria-hidden className="bg-border-strong mx-1 h-5 w-px" />
          {(
            [
              ["email", "E-mail"],
              ["whatsapp", "WhatsApp"],
            ] as const
          ).map(([k, l]) => (
            <Link
              key={k}
              href={href({ canal: sp.canal === k ? null : k })}
              aria-current={sp.canal === k ? "true" : undefined}
              className={
                sp.canal === k
                  ? "border-brand bg-brand-subtle text-brand-subtle-fg inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium"
                  : "border-border-strong text-fg-muted hover:text-fg inline-flex h-8 items-center rounded-full border px-3 text-sm"
              }
            >
              {l}
            </Link>
          ))}
        </div>
        {canSend && (
          <Button asChild>
            <Link href={`${base}/campanhas/nova`}>
              <Plus /> Novo envio
            </Link>
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-fg-subtle py-10 text-center text-sm">Nenhum envio com esses filtros.</p>
      ) : (
        <DataTable
          caption="Envios"
          rows={rows}
          rowKey={(r) => r.id}
          rowHref={(r) => `${base}/campanhas/${r.id}`}
          columns={[
            {
              key: "name",
              header: "Envio",
              mobile: "primary",
              cell: (r) => (
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="text-fg-subtle [&_svg]:size-4">
                    {r.channel === "EMAIL" ? <Mail /> : <MessageCircle />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="text-fg-subtle block truncate text-xs">
                      {r.projectId
                        ? (projectName.get(r.projectId) ?? "Projeto")
                        : "Base de membros"}
                    </span>
                  </span>
                </span>
              ),
            },
            {
              key: "status",
              header: "Situação",
              mobile: "meta",
              cell: (r) => (
                <Badge size="sm" tone={CAMPAIGN_STATUS[r.status]?.tone} dot>
                  {CAMPAIGN_STATUS[r.status]?.label ?? r.status}
                </Badge>
              ),
            },
            {
              key: "progress",
              header: "Progresso",
              className: "w-56",
              mobile: "desktopOnly",
              cell: (r) => <CampaignProgress sent={r.sent} failed={r.failed} total={r.total} />,
            },
            {
              key: "when",
              header: "Início",
              mobile: "secondary",
              cell: (r) => (
                <span className="text-fg-muted text-sm">
                  {fmtDateTime(r.startedAt ?? r.scheduledAt ?? r.createdAt)}
                </span>
              ),
            },
            {
              key: "by",
              header: "Por",
              mobile: "desktopOnly",
              cell: (r) => <span className="text-fg-muted text-sm">{r.createdBy || "—"}</span>,
            },
          ]}
        />
      )}
    </div>
  );
}
