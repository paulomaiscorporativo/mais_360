"use client";

import {
  ArrowLeft,
  CircleAlert,
  Clock,
  Mail,
  MessageCircle,
  Pause,
  Play,
  Search,
  Square,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Badge, Button, Input, Notice, Panel, PanelBody, Skeleton } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import {
  campaignLive,
  cancelCampaignAction,
  pauseCampaignAction,
  resumeCampaignAction,
  type LiveDelivery,
} from "@/app/console/[ws]/clientes/[tenant]/comunicacao/actions";
import { CampaignProgress } from "./campaign-progress";
import {
  ACTIVE_CAMPAIGN,
  CAMPAIGN_STATUS,
  DELIVERY_STATUS,
  fmtDateTime,
  fmtRelative,
  maskTarget,
} from "./labels";
import { cn } from "@/lib/cn";

type Summary = {
  status: string;
  statusReason: string;
  total: number;
  counts: Record<string, number>;
  progress: number;
  nextSendAt: string | null;
  batch?: { current: number; total: number };
  startedAt: string | null;
  finishedAt: string | null;
};

type Filter = "ALL" | "SENT" | "PENDING" | "PROBLEM";
const nf = new Intl.NumberFormat("pt-BR");

export function CampaignLive({
  tenant,
  base,
  campaign,
  canControl,
}: {
  tenant: string;
  base: string;
  campaign: {
    id: string;
    name: string;
    channel: "EMAIL" | "WHATSAPP";
    subject: string;
    templateId: string | null;
    projectName: string;
    createdBy: string;
    createdAt: string;
    scheduledAt: string | null;
    skipped: number;
    timezone: string;
    pacing: {
      preset: string;
      intervalMinS: number;
      intervalMaxS: number;
      batchSize: number;
      dailyLimit: number;
      windowStart: string;
      windowEnd: string;
    } | null;
  };
  canControl: boolean;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<LiveDelivery[]>([]);
  const [matched, setMatched] = useState(0);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [q, setQ] = useState("");
  const [take, setTake] = useState(100);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const r = await campaignLive({ tenant, id: campaign.id, filter, q, take });
    if (r.ok) {
      setSummary(r.data.summary);
      setRows(r.data.rows);
      setMatched(r.data.matched);
    }
    return r.ok ? r.data.summary.status : null;
  }, [tenant, campaign.id, filter, q, take]);

  // Atualização ao vivo enquanto o envio está ativo
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const status = await load();
      if (!alive) return;
      const active = status ? ACTIVE_CAMPAIGN.has(status) : false;
      timer.current = setTimeout(tick, active ? 4000 : 30000);
    };
    const h = setTimeout(tick, q ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(h);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load, q]);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const act = (
    fn: (i: { tenant: string; id: string }) => Promise<{ ok: true } | { ok: false; error: string }>,
    ok: string,
  ) =>
    start(async () => {
      const r = await fn({ tenant, id: campaign.id });
      if (r.ok) {
        toast.success(ok);
        setConfirmCancel(false);
        await load();
      } else toast.error(r.error);
    });

  const status = summary?.status ?? "RUNNING";
  const ui = CAMPAIGN_STATUS[status];
  const c = summary?.counts ?? {};
  const sent = (c.SENT ?? 0) + (c.DELIVERED ?? 0) + (c.READ ?? 0);
  const isWa = campaign.channel === "WHATSAPP";
  const next = summary?.nextSendAt ? new Date(summary.nextSendAt).getTime() : null;
  const secondsToNext = next ? Math.max(0, Math.round((next - now) / 1000)) : null;
  const active = ACTIVE_CAMPAIGN.has(status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            aria-label="Voltar aos envios"
            className="mt-0.5"
          >
            <Link href={`${base}/campanhas`}>
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold tracking-tight">{campaign.name}</h3>
              {summary ? (
                <Badge tone={ui?.tone} dot>
                  {ui?.label ?? status}
                </Badge>
              ) : (
                <Skeleton className="h-6 w-24 rounded-full" />
              )}
            </div>
            <p className="text-fg-subtle mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5">
                {isWa ? <MessageCircle className="size-3.5" /> : <Mail className="size-3.5" />}
                {isWa ? "WhatsApp" : "E-mail"}
              </span>
              <span>{campaign.projectName}</span>
              <span>
                por {campaign.createdBy || "—"} · {fmtDateTime(campaign.createdAt)}
              </span>
            </p>
          </div>
        </div>
        {canControl && active && (
          <div className="flex shrink-0 gap-2">
            {status === "PAUSED" ? (
              <Button
                onClick={() => act(resumeCampaignAction, "Envio retomado.")}
                loading={pending}
              >
                <Play /> Retomar
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => act(pauseCampaignAction, "Envio pausado.")}
                loading={pending}
              >
                <Pause /> Pausar
              </Button>
            )}
            <Button variant="danger-ghost" onClick={() => setConfirmCancel(true)}>
              <Square /> Cancelar
            </Button>
          </div>
        )}
      </div>

      <Panel>
        <PanelBody className="flex flex-col gap-5 py-5">
          {summary ? (
            <CampaignProgress sent={sent} failed={c.FAILED ?? 0} total={summary.total} size="lg" />
          ) : (
            <Skeleton className="h-8 w-full" />
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Enviados" value={sent} />
            {isWa ? (
              <>
                <Tile label="Entregues" value={(c.DELIVERED ?? 0) + (c.READ ?? 0)} />
                <Tile label="Lidos" value={c.READ ?? 0} tone="success" />
              </>
            ) : (
              <Tile
                label="Entregues"
                value={(c.DELIVERED ?? 0) + (c.READ ?? 0)}
                hint="quando o provedor confirma"
              />
            )}
            <Tile label="Na fila" value={(c.QUEUED ?? 0) + (c.SENDING ?? 0)} />
            <Tile
              label="Falhas"
              value={c.FAILED ?? 0}
              tone={(c.FAILED ?? 0) > 0 ? "danger" : undefined}
            />
            <Tile label="Pulados" value={campaign.skipped} hint="sem contato válido" />
          </div>

          {summary && active && (
            <div className="border-border bg-surface-muted text-fg-muted flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border px-4 py-3 text-sm">
              <span className="inline-flex items-center gap-2">
                <Clock className="text-fg-subtle size-4" />
                {status === "PAUSED"
                  ? summary.statusReason || "Pausado."
                  : status === "SCHEDULED"
                    ? `Começa ${fmtDateTime(summary.nextSendAt)}`
                    : status === "WAITING_WINDOW"
                      ? `${summary.statusReason || "Aguardando o horário permitido."} Retoma ${fmtRelative(summary.nextSendAt, now)}.`
                      : secondsToNext !== null && secondsToNext > 0
                        ? `Próxima mensagem em ${secondsToNext < 90 ? `${secondsToNext} s` : fmtRelative(summary.nextSendAt, now)}`
                        : "Enviando agora…"}
              </span>
              {summary.batch && (
                <span>
                  Lote {summary.batch.current} de {summary.batch.total}
                </span>
              )}
              {campaign.pacing && (
                <span>
                  Ritmo {campaign.pacing.preset} · {campaign.pacing.intervalMinS}–
                  {campaign.pacing.intervalMaxS} s · até {campaign.pacing.dailyLimit}/dia ·{" "}
                  {campaign.pacing.windowStart}–{campaign.pacing.windowEnd}
                </span>
              )}
            </div>
          )}
          {summary && !active && summary.statusReason && status !== "COMPLETED" && (
            <Notice tone={status === "FAILED" ? "danger" : "warning"} icon={<CircleAlert />}>
              {summary.statusReason}
            </Notice>
          )}
        </PanelBody>
      </Panel>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="bg-surface-sunken flex [scrollbar-width:none] gap-1 overflow-x-auto rounded-md p-1">
            {(
              [
                ["ALL", "Todos", summary?.total ?? 0],
                ["SENT", "Enviados", sent],
                ["PENDING", "Na fila", (c.QUEUED ?? 0) + (c.SENDING ?? 0)],
                ["PROBLEM", "Problemas", (c.FAILED ?? 0) + (c.SKIPPED ?? 0) + (c.CANCELED ?? 0)],
              ] as const
            ).map(([k, l, n]) => (
              <button
                key={k}
                type="button"
                aria-pressed={filter === k}
                onClick={() => {
                  setFilter(k);
                  setTake(100);
                }}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-3 text-sm font-medium transition-colors",
                  filter === k ? "bg-surface text-fg shadow-sm" : "text-fg-subtle hover:text-fg",
                )}
              >
                {l}
                <span className="tabular text-fg-subtle text-xs">{nf.format(n)}</span>
              </button>
            ))}
          </div>
          <Input
            leading={<Search />}
            placeholder="Buscar pessoa ou destino"
            aria-label="Buscar destinatário"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="sm:w-72"
          />
        </div>

        <div className="border-border bg-surface overflow-hidden rounded-md border shadow-sm">
          {!summary ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-fg-subtle px-5 py-10 text-center text-sm">Ninguém neste filtro.</p>
          ) : (
            <ul className="divide-border divide-y">
              {rows.map((d) => {
                const s = DELIVERY_STATUS[d.status];
                const when = d.readAt ?? d.deliveredAt ?? d.sentAt;
                return (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.name || "Sem nome"}</p>
                      <p className="text-fg-subtle truncate font-mono text-xs">
                        {d.target ? maskTarget(d.target) : "—"}
                      </p>
                      {d.error && (d.status === "FAILED" || d.status === "SKIPPED") && (
                        <p
                          className={cn(
                            "mt-1 text-xs",
                            d.status === "FAILED" ? "text-danger" : "text-warning",
                          )}
                        >
                          {d.error}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge size="sm" tone={s?.tone} dot>
                        {s?.label ?? d.status}
                      </Badge>
                      {when && <span className="text-fg-subtle text-xs">{fmtDateTime(when)}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {matched > rows.length && (
            <div className="border-border border-t px-5 py-3 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTake((t) => Math.min(500, t + 200))}
              >
                Mostrar mais ({nf.format(matched - rows.length)} restantes)
              </Button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancelar este envio?"
        description={`As ${nf.format(c.QUEUED ?? 0)} mensagens ainda na fila não serão enviadas. O que já saiu continua no histórico.`}
        confirmLabel="Cancelar envio"
        cancelLabel="Manter"
        tone="danger"
        loading={pending}
        onConfirm={() => act(cancelCampaignAction, "Envio cancelado.")}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "success" | "danger";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-fg-subtle text-xs font-medium">{label}</span>
      <span
        className={cn(
          "tabular text-xl font-semibold tracking-tight",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
        )}
      >
        {nf.format(value)}
      </span>
      {hint && <span className="text-fg-faint text-2xs">{hint}</span>}
    </div>
  );
}
