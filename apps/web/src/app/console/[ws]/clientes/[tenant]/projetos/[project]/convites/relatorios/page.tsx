import { BarChart3, Download } from "lucide-react";
import type { InviteStatus } from "@mais/core";
import { buttonVariants, DataTable, EmptyState, Stat, type Column } from "@/components/ui";
import { INVITE_STATUS_UI } from "@/components/events/labels";
import { guard } from "@/server/auth";
import { loadInviteReport } from "@/server/invite-reports";
import { projectBase, requireProjectFeature } from "@/server/projects";
import { cn } from "@/lib/cn";

type CompanyRow = Awaited<ReturnType<typeof loadInviteReport>>["companies"][number];

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

// Ordem da barra: do mais avançado ao que ainda não saiu
const FUNNEL: InviteStatus[] = ["CHECKED_IN", "CONFIRMED", "SENT", "PENDING", "DECLINED"];
const BAR_TONE: Record<InviteStatus, string> = {
  CHECKED_IN: "bg-brand",
  CONFIRMED: "bg-success",
  SENT: "bg-info",
  PENDING: "bg-border-strong",
  DECLINED: "bg-warning",
  CANCELED: "bg-danger",
};

export default async function InviteReportsPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  const p = await guard(requireProjectFeature(ws, tenant, project, "INVITES"));
  const { totals, companies } = await loadInviteReport(p.db, p.projectId);
  const exportBase = `${projectBase(ws, tenant, project)}/convites/relatorios/exportar`;

  if (totals.active === 0 && totals.CANCELED === 0)
    return (
      <EmptyState
        icon={<BarChart3 />}
        title="Ainda não há convites"
        description="Os números de confirmação, presença e uso das cotas aparecem aqui assim que os primeiros convites forem emitidos."
      />
    );

  const answered = totals.CONFIRMED + totals.DECLINED + totals.CHECKED_IN;
  const columns: Column<CompanyRow>[] = [
    {
      key: "name",
      header: "Empresa",
      mobile: "primary",
      cell: (c) => <span className="font-medium">{c.name}</span>,
    },
    {
      key: "quota",
      header: "Cota",
      align: "right",
      mobile: "secondary",
      cell: (c) => (
        <span className="tabular">
          {c.quota === null
            ? `${c.active} convites`
            : `${c.active} de ${c.quota} · ${pct(c.usage)}`}
        </span>
      ),
    },
    {
      key: "confirmed",
      header: "Confirmados",
      align: "right",
      mobile: "meta",
      cell: (c) => <span className="tabular">{c.CONFIRMED + c.CHECKED_IN}</span>,
    },
    {
      key: "declined",
      header: "Recusaram",
      align: "right",
      mobile: "desktopOnly",
      cell: (c) => <span className="tabular">{c.DECLINED}</span>,
    },
    {
      key: "waiting",
      header: "Sem resposta",
      align: "right",
      mobile: "desktopOnly",
      cell: (c) => <span className="tabular">{c.SENT + c.PENDING}</span>,
    },
    {
      key: "present",
      header: "Presença",
      align: "right",
      mobile: "desktopOnly",
      cell: (c) => (
        <span className="tabular">
          {c.CHECKED_IN} <span className="text-fg-subtle">({pct(c.attendance)})</span>
        </span>
      ),
    },
    {
      key: "returned",
      header: "Devolvidos",
      align: "right",
      mobile: "desktopOnly",
      cell: (c) => <span className="tabular text-fg-muted">{c.returnedToPool || "—"}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="resumo" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="resumo" className="text-md font-semibold">
            Confirmações e presença
          </h2>
          <div className="flex flex-wrap gap-2">
            <a
              href={`${exportBase}?tipo=convidados`}
              className={buttonVariants({ variant: "secondary", size: "md" })}
            >
              <Download /> Convidados (CSV)
            </a>
            <a
              href={`${exportBase}?tipo=empresas`}
              className={buttonVariants({ variant: "secondary", size: "md" })}
            >
              <Download /> Empresas (CSV)
            </a>
            <a
              href={`${exportBase}?tipo=convidados&codificacao=windows-1252`}
              className={buttonVariants({ variant: "ghost", size: "md" })}
              title="Para Excel antigo ou sistemas que não leem UTF-8"
            >
              Excel antigo (Windows-1252)
            </a>
          </div>
        </div>

        <div className="border-border bg-surface grid grid-cols-2 gap-6 rounded-md border p-5 shadow-sm sm:grid-cols-4">
          <Stat
            label="Convites ativos"
            value={totals.active}
            hint={`${totals.CANCELED} cancelados`}
          />
          <Stat
            label="Confirmaram"
            value={totals.CONFIRMED + totals.CHECKED_IN}
            hint={`${pct(totals.active ? (totals.CONFIRMED + totals.CHECKED_IN) / totals.active : 0)} dos ativos`}
          />
          <Stat
            label="Sem resposta"
            value={totals.SENT + totals.PENDING}
            hint={`${totals.PENDING} ainda não enviados`}
          />
          <Stat
            label="Presentes"
            value={totals.CHECKED_IN}
            hint={`${pct(totals.active ? totals.CHECKED_IN / totals.active : 0)} dos ativos`}
          />
        </div>

        <figure className="flex flex-col gap-3">
          <div
            className="bg-surface-sunken flex h-3 overflow-hidden rounded-full"
            role="img"
            aria-label={FUNNEL.map((s) => `${INVITE_STATUS_UI[s].label}: ${totals[s]}`).join(", ")}
          >
            {FUNNEL.map((s) =>
              totals[s] ? (
                <div
                  key={s}
                  className={cn("h-full", BAR_TONE[s])}
                  style={{ width: `${(totals[s] / totals.active) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <figcaption className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {FUNNEL.map((s) => (
              <span key={s} className="text-fg-muted inline-flex items-center gap-2">
                <span aria-hidden className={cn("size-2.5 rounded-full", BAR_TONE[s])} />
                {INVITE_STATUS_UI[s].label}
                <span className="tabular text-fg font-medium">{totals[s]}</span>
              </span>
            ))}
            <span className="text-fg-subtle">
              · {answered} de {totals.active} responderam
            </span>
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="cotas" className="flex flex-col gap-3">
        <h2 id="cotas" className="text-md font-semibold">
          Cotas por empresa
        </h2>
        {companies.length === 0 ? (
          <EmptyState
            title="Nenhuma empresa com cota"
            description="Os convites deste evento são todos individuais."
          />
        ) : (
          <DataTable
            rows={companies}
            columns={columns}
            rowKey={(c) => c.id ?? "individual"}
            caption="Uso das cotas, confirmações e presença por empresa"
          />
        )}
      </section>
    </div>
  );
}
