import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Inbox, Plus, Search } from "lucide-react";
import { formatInZone } from "@mais/core";
import {
  OPEN_TRAVEL_STATUSES,
  routeLabel,
  type TravelRequestStatus,
} from "@mais/core/corporate-travel";
import type { Prisma } from "@mais/db";
import { Protocol, TravelStatusBadge } from "@/components/corporate-travel/display";
import { Button, DataTable, EmptyState, Input, Panel, Stat, type Column } from "@/components/ui";
import { cn } from "@/lib/cn";
import { guard } from "@/server/auth";
import { corporateTravelBase, requireCorporateTravel } from "@/server/corporate-travel";

export const metadata: Metadata = { title: "Viagens corporativas" };

type Row = {
  id: string;
  protocol: string;
  status: TravelRequestStatus;
  requester: string;
  company: string;
  route: string;
  dates: string;
  pax: number;
  handledBy: string;
  created: string;
  outOfPolicy: boolean;
};

const FILTERS: { key: string; label: string; statuses: readonly TravelRequestStatus[] | null }[] = [
  { key: "abertas", label: "Em aberto", statuses: OPEN_TRAVEL_STATUSES },
  { key: "novas", label: "Novas", statuses: ["NEW"] },
  { key: "atendimento", label: "Em atendimento", statuses: ["IN_PROGRESS", "REJECTED"] },
  { key: "cotadas", label: "Aguardando escolha", statuses: ["QUOTED"] },
  { key: "aprovacao", label: "Aguardando aprovação", statuses: ["AWAITING_APPROVAL"] },
  { key: "emitir", label: "Prontas para emitir", statuses: ["APPROVED"] },
  { key: "reservadas", label: "Reservadas", statuses: ["BOOKED"] },
  { key: "canceladas", label: "Canceladas", statuses: ["CANCELED"] },
  { key: "todas", label: "Todas", statuses: null },
];

/** Fila de atendimento: filtros por situação, "só as minhas" e busca. */
export default async function TravelQueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; tenant: string }>;
  searchParams: Promise<{ filtro?: string; meus?: string; q?: string }>;
}) {
  const { ws, tenant } = await params;
  const sp = await searchParams;
  const c = await guard(requireCorporateTravel(tenant));
  const base = corporateTravelBase(ws, tenant);
  const filter = FILTERS.find((f) => f.key === sp.filtro) ?? FILTERS[0]!;
  const mine = sp.meus === "1";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const filtered = !!q || mine || filter.key !== "abertas";

  const where: Prisma.TravelRequestWhereInput = {
    ...(filter.statuses ? { status: { in: [...filter.statuses] } } : {}),
    ...(mine ? { assignedUserId: c.viewer.user.id } : {}),
    ...(q
      ? {
          OR: [
            { protocol: { contains: q.toUpperCase() } },
            { requesterName: { contains: q, mode: "insensitive" } },
            { companyName: { contains: q, mode: "insensitive" } },
            { destination: { contains: q, mode: "insensitive" } },
            { origin: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, counts] = await Promise.all([
    c.db.travelRequest.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      include: {
        segments: { orderBy: { sortOrder: "asc" }, select: { origin: true, destination: true } },
      },
    }),
    c.db.travelRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const count = (s: TravelRequestStatus[]) =>
    counts.filter((x) => s.includes(x.status)).reduce((n, x) => n + x._count._all, 0);

  const data: Row[] = rows.map((r) => ({
    id: r.id,
    protocol: r.protocol,
    status: r.status,
    requester: r.requesterName,
    company: r.companyName,
    route: routeLabel(r.segments) || r.destination,
    dates: r.departDate
      ? `${formatInZone(r.departDate, c.tz, "short")}${r.returnDate ? ` – ${formatInZone(r.returnDate, c.tz, "short")}` : ""}`
      : "",
    pax: r.pax,
    handledBy: r.handledBy,
    created: formatInZone(r.createdAt, c.tz, "datetime"),
    outOfPolicy: r.outOfPolicy,
  }));

  const columns: Column<Row>[] = [
    {
      key: "route",
      header: "Solicitação",
      mobile: "primary",
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{r.route}</span>
          <span className="text-fg-subtle flex items-center gap-2 text-xs">
            <Protocol value={r.protocol} />
            {r.outOfPolicy && (
              <span className="text-warning inline-flex items-center gap-1">
                <AlertTriangle className="size-3" aria-hidden /> Fora da política
              </span>
            )}
          </span>
        </div>
      ),
    },
    {
      key: "requester",
      header: "Solicitante",
      mobile: "secondary",
      cell: (r) => (
        <div className="flex flex-col">
          <span>{r.requester}</span>
          {r.company && <span className="text-fg-subtle text-xs">{r.company}</span>}
        </div>
      ),
    },
    {
      key: "dates",
      header: "Datas",
      mobile: "secondary",
      cell: (r) => (
        <span className="tabular text-sm">
          {r.dates}
          <span className="text-fg-subtle">
            {" "}
            · {r.pax} {r.pax === 1 ? "passageiro" : "passageiros"}
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Situação",
      mobile: "meta",
      cell: (r) => <TravelStatusBadge status={r.status} size="sm" />,
    },
    {
      key: "handledBy",
      header: "Responsável",
      mobile: "desktopOnly",
      cell: (r) =>
        r.handledBy ? (
          <span className="text-sm">{r.handledBy}</span>
        ) : (
          <span className="text-fg-faint text-sm">Ninguém</span>
        ),
    },
    {
      key: "created",
      header: "Recebida",
      mobile: "desktopOnly",
      align: "right",
      cell: (r) => <span className="text-fg-subtle tabular text-xs">{r.created}</span>,
    },
  ];

  const href = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const next = { filtro: filter.key, meus: mine ? "1" : null, q: q || null, ...over };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div className="flex flex-col gap-6">
      <Panel className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <Stat label="Novas" value={count(["NEW"])} hint="Esperando alguém assumir" />
        <Stat label="Em atendimento" value={count(["IN_PROGRESS", "REJECTED"])} hint="Cotando" />
        <Stat label="Aguardando aprovação" value={count(["AWAITING_APPROVAL"])} />
        <Stat label="Prontas para emitir" value={count(["APPROVED"])} hint="Reserva manual" />
      </Panel>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <nav
          aria-label="Filtrar por situação"
          className="-mx-4 flex [scrollbar-width:none] gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href({ filtro: f.key })}
              aria-current={f.key === filter.key ? "true" : undefined}
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-sm border px-3 text-sm transition-colors",
                f.key === filter.key
                  ? "border-brand bg-brand-subtle text-brand-subtle-fg font-medium"
                  : "border-border text-fg-muted hover:text-fg",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={href({ meus: mine ? null : "1" })}
            aria-current={mine ? "true" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-sm border px-3 text-sm",
              mine
                ? "border-brand bg-brand-subtle text-brand-subtle-fg font-medium"
                : "border-border text-fg-muted hover:text-fg",
            )}
          >
            Só as minhas
          </Link>
          <form action={base} method="get" role="search" className="relative">
            <input type="hidden" name="filtro" value={filter.key} />
            {mine && <input type="hidden" name="meus" value="1" />}
            <Search className="text-fg-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Protocolo, nome, empresa, destino"
              aria-label="Buscar solicitações"
              className="w-64 max-w-full pl-9"
            />
          </form>
          {c.canAttend && (
            <Button asChild>
              <Link href={`${base}/nova`}>
                <Plus /> Nova solicitação
              </Link>
            </Button>
          )}
        </div>
      </div>

      {data.length ? (
        <DataTable
          rows={data}
          columns={columns}
          rowKey={(r) => r.id}
          rowHref={(r) => `${base}/${r.id}`}
          caption={`Solicitações de viagem: ${filter.label.toLowerCase()}`}
        />
      ) : (
        <EmptyState
          icon={<Inbox />}
          title={filtered ? "Nada com esses filtros" : "Nenhuma solicitação em aberto"}
          description={
            filtered
              ? "Troque o filtro ou limpe a busca para ver as outras solicitações."
              : `Os pedidos chegam pela área do associado de ${c.tenant.name}. Pedidos feitos por telefone ou e-mail também podem ser registrados aqui.`
          }
          action={
            filtered ? (
              <Button asChild variant="secondary">
                <Link href={base}>Limpar filtros</Link>
              </Button>
            ) : c.canAttend ? (
              <Button asChild>
                <Link href={`${base}/nova`}>
                  <Plus /> Registrar solicitação
                </Link>
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
