import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Inbox, ServerOff } from "lucide-react";
import { z } from "zod";
import { queueLabel, taskLabel, type JobStatusName, type WorkerState } from "@mais/core/ops";
import {
  Badge,
  DataTable,
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  PanelHeader,
  Stat,
  type Column,
} from "@/components/ui";
import { LinkTabs } from "@/components/ui/tabs";
import { guard, requirePlatformRole } from "@/server/auth";
import { env } from "@/server/env";
import { JOB_VIEWS, loadOperations, type JobItem, type OperationsData } from "@/server/operations";
import { AutoRefresh, JobActions, JobFilters } from "./controls";

export const metadata: Metadata = { title: "Operação" };

const PATH = "/console/plataforma/operacao";

const filtersSchema = z.object({
  visao: z.enum(JOB_VIEWS).catch("falhas"),
  fila: z.string().trim().min(1).max(120).optional().catch(undefined),
  cliente: z.string().trim().min(1).max(64).optional().catch(undefined),
});

const WORKER_STATE: Record<
  WorkerState,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  ALIVE: { label: "Ativo", tone: "success" },
  LATE: { label: "Atrasado", tone: "warning" },
  LOST: { label: "Sem sinal", tone: "danger" },
  STOPPED: { label: "Encerrado", tone: "neutral" },
};

const JOB_STATUS: Record<
  JobStatusName,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }
> = {
  PENDING: { label: "Na fila", tone: "info" },
  RUNNING: { label: "Em execução", tone: "info" },
  DONE: { label: "Concluído", tone: "success" },
  FAILED: { label: "Falhou", tone: "danger" },
  DEAD: { label: "Esgotou tentativas", tone: "danger" },
};

const VIEW_LABEL: Record<(typeof JOB_VIEWS)[number], string> = {
  falhas: "Falhas",
  repetindo: "Tentando de novo",
  atrasados: "Atrasados",
  rodando: "Em execução",
};

const VIEW_EMPTY: Record<(typeof JOB_VIEWS)[number], { title: string; description: string }> = {
  falhas: {
    title: "Nenhuma falha definitiva",
    description:
      "Quando um job esgotar as tentativas, ele aparece aqui com o erro para você decidir.",
  },
  repetindo: {
    title: "Nada tentando de novo",
    description: "Jobs que falharam e ainda têm tentativas aparecem aqui até darem certo.",
  },
  atrasados: {
    title: "Fila em dia",
    description: "Nenhum job esperando há mais de 5 minutos do horário previsto.",
  },
  rodando: {
    title: "Nada em execução agora",
    description: "Os jobs aparecem aqui enquanto um worker os processa.",
  },
};

function formatters(timeZone: string) {
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return { time, dateTime };
}

function ago(iso: string, nowIso: string): string {
  const s = Math.round((Date.parse(nowIso) - Date.parse(iso)) / 1000);
  if (s < 0) return `em ${duration(-s)}`;
  if (s < 5) return "agora";
  return `há ${duration(s)}`;
}

function duration(s: number): string {
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86_400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86_400)} d`;
}

function every(ms: number): string {
  if (ms >= 86_400_000) return `a cada ${Math.round(ms / 86_400_000)} dia(s)`;
  if (ms >= 3_600_000) return `a cada ${Math.round(ms / 3_600_000)} h`;
  return `a cada ${Math.round(ms / 60_000)} min`;
}

function viewHref(view: string, params: { fila?: string; cliente?: string }) {
  const q = new URLSearchParams();
  if (view !== "falhas") q.set("visao", view);
  if (params.fila) q.set("fila", params.fila);
  if (params.cliente) q.set("cliente", params.cliente);
  return q.size ? `${PATH}?${q}` : PATH;
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await guard(requirePlatformRole(["SUPERADMIN", "SUPPORT"]));
  const raw = await searchParams;
  const f = filtersSchema.parse({
    visao: typeof raw.visao === "string" ? raw.visao : undefined,
    fila: typeof raw.fila === "string" ? raw.fila : undefined,
    cliente: typeof raw.cliente === "string" ? raw.cliente : undefined,
  });
  const data = await loadOperations({
    view: f.visao,
    queue: f.fila ?? null,
    tenantId: f.cliente ?? null,
  });
  const fmt = formatters(env.DEFAULT_TIMEZONE);
  const canManage = viewer.isSuperadmin;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Plataforma", href: "/console/plataforma" }, { label: "Operação" }]}
        title="Operação"
        description="Processamento em segundo plano: workers, filas, tarefas periódicas e falhas que pedem decisão."
        actions={<AutoRefresh updatedAt={fmt.time.format(new Date(data.now))} />}
      />

      <Alerts data={data} />

      <div className="border-border bg-border mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border lg:grid-cols-5">
        <Stat
          className="bg-surface px-5 py-4"
          label="Workers ativos"
          value={data.fleet.alive}
          hint={
            data.fleet.lastSeenAt
              ? `último sinal ${ago(data.fleet.lastSeenAt, data.now)}`
              : "nenhum sinal ainda"
          }
        />
        <Stat className="bg-surface px-5 py-4" label="Na fila" value={data.totals.pending} />
        <Stat
          className="bg-surface px-5 py-4"
          label="Atrasados"
          value={data.totals.overdue}
          hint="há mais de 5 min"
        />
        <Stat className="bg-surface px-5 py-4" label="Em execução" value={data.totals.running} />
        <Stat
          className="bg-surface col-span-2 px-5 py-4 lg:col-span-1"
          label="Falhas definitivas"
          value={data.totals.failed}
          hint="esperando decisão"
        />
      </div>

      <section aria-labelledby="jobs" className="mb-8">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="jobs" className="text-md font-semibold">
              Jobs
            </h2>
            <p className="text-fg-subtle text-sm">
              Payload e erros com e-mails, telefones e links mascarados.
              {!canManage && " O suporte consulta; só superadmin repete ou descarta."}
            </p>
          </div>
          <JobFilters
            queues={data.queues.map((q) => ({ value: q.queue, label: queueLabel(q.queue) }))}
            tenants={data.tenants}
            queue={f.fila ?? null}
            tenantId={f.cliente ?? null}
          />
        </div>
        <LinkTabs
          className="mb-3"
          items={JOB_VIEWS.map((v) => ({
            href: viewHref(v, f),
            label: VIEW_LABEL[v],
            active: f.visao === v,
          }))}
        />
        <JobsTable data={data} view={f.visao} canManage={canManage} fmt={fmt} />
      </section>

      <div className="mb-8 grid gap-6 xl:grid-cols-2">
        <WorkersPanel data={data} fmt={fmt} />
        <TasksPanel data={data} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <QueuesPanel data={data} filters={f} />
        <DeliveriesPanel data={data} />
      </div>
    </>
  );
}

function Alerts({ data }: { data: OperationsData }) {
  const lateTasks = data.tasks.filter((t) => t.late || t.status === "ERROR");
  if (!data.fleet.down && data.fleet.unserved.length === 0 && lateTasks.length === 0)
    return (
      <Notice tone="success" icon={<CheckCircle2 />} className="mb-6" title="Tudo funcionando">
        {data.fleet.alive} worker(s) com sinal de vida e tarefas periódicas em dia.
      </Notice>
    );
  return (
    <div className="mb-6 flex flex-col gap-3">
      {data.fleet.down && (
        <Notice tone="danger" icon={<ServerOff />} title="Nenhum worker em funcionamento">
          {data.fleet.lastSeenAt
            ? `Sem sinal de vida ${ago(data.fleet.lastSeenAt, data.now)}. `
            : "Nenhum worker deu sinal de vida ainda. "}
          E-mails, mensagens, status de voos, verificação de domínios e limpezas estão parados até
          um worker voltar. Confira o container do worker e os logs (docs/OPERACAO.md).
        </Notice>
      )}
      {data.fleet.unserved.length > 0 && (
        <Notice tone="warning" icon={<AlertTriangle />} title="Filas sem worker">
          Há jobs vencidos em {data.fleet.unserved.map(queueLabel).join(", ")}, mas nenhum worker
          ativo atende essas filas. Confira a configuração (ex.: APIFY_TOKEN para voos).
        </Notice>
      )}
      {lateTasks.length > 0 && (
        <Notice tone="warning" icon={<AlertTriangle />} title="Tarefas periódicas com problema">
          {lateTasks
            .map(
              (t) =>
                `${taskLabel(t.name)} (${t.status === "ERROR" ? "última execução falhou" : "atrasada"})`,
            )
            .join(" · ")}
        </Notice>
      )}
    </div>
  );
}

type Fmt = ReturnType<typeof formatters>;

function JobsTable({
  data,
  view,
  canManage,
  fmt,
}: {
  data: OperationsData;
  view: (typeof JOB_VIEWS)[number];
  canManage: boolean;
  fmt: Fmt;
}) {
  if (data.jobs.length === 0)
    return (
      <EmptyState
        icon={<Inbox />}
        title={VIEW_EMPTY[view].title}
        description={VIEW_EMPTY[view].description}
      />
    );
  return (
    <>
      <ul className="border-border bg-surface divide-border divide-y overflow-hidden rounded-md border shadow-sm">
        {data.jobs.map((j) => (
          <JobRow key={j.id} job={j} now={data.now} canManage={canManage} fmt={fmt} />
        ))}
      </ul>
      {data.jobsTruncated && (
        <p className="text-fg-subtle mt-2 text-sm">
          Mostrando os 50 mais recentes. Use os filtros para chegar aos outros.
        </p>
      )}
    </>
  );
}

function JobRow({
  job,
  now,
  canManage,
  fmt,
}: {
  job: JobItem;
  now: string;
  canManage: boolean;
  fmt: Fmt;
}) {
  const s = JOB_STATUS[job.status];
  const failed = job.status === "FAILED" || job.status === "DEAD";
  return (
    <li className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{queueLabel(job.queue)}</span>
          <Badge tone={s.tone} dot size="sm">
            {s.label}
          </Badge>
          <span className="text-fg-subtle tabular text-sm">
            tentativa {job.attempts} de {job.maxAttempts}
          </span>
          {job.tenant && (
            <Link href={job.tenant.href} className="text-brand-text text-sm hover:underline">
              {job.tenant.name}
            </Link>
          )}
        </div>
        {job.error && <p className="text-danger mt-1.5 text-sm break-words">{job.error}</p>}
        <code className="bg-surface-muted text-fg-muted mt-2 block overflow-x-auto rounded-sm px-2 py-1 font-mono text-xs whitespace-pre">
          {job.payload}
        </code>
        <p className="text-fg-subtle mt-1.5 text-xs">
          <span className="font-mono">{job.queue}</span> · atualizado{" "}
          <time dateTime={job.updatedAt} title={fmt.dateTime.format(new Date(job.updatedAt))}>
            {ago(job.updatedAt, now)}
          </time>
          {job.status === "PENDING" && (
            <>
              {" "}
              · previsto{" "}
              <time dateTime={job.runAt} title={fmt.dateTime.format(new Date(job.runAt))}>
                {ago(job.runAt, now)}
              </time>
            </>
          )}
        </p>
      </div>
      {failed && canManage && <JobActions jobId={job.id} queueLabel={queueLabel(job.queue)} />}
    </li>
  );
}

function WorkersPanel({ data, fmt }: { data: OperationsData; fmt: Fmt }) {
  type Row = OperationsData["workers"][number];
  const columns: Column<Row>[] = [
    {
      key: "host",
      header: "Instância",
      mobile: "primary",
      cell: (w) => (
        <span className="min-w-0">
          <span className="block truncate font-medium">{w.hostname}</span>
          <span className="text-fg-subtle block truncate font-mono text-xs">
            pid {w.pid}
            {w.version && ` · v${w.version}`}
          </span>
        </span>
      ),
    },
    {
      key: "state",
      header: "Situação",
      mobile: "meta",
      cell: (w) => (
        <Badge tone={WORKER_STATE[w.state].tone} dot size="sm">
          {WORKER_STATE[w.state].label}
        </Badge>
      ),
    },
    {
      key: "seen",
      header: "Último sinal",
      mobile: "secondary",
      cell: (w) => (
        <time
          dateTime={w.lastSeenAt}
          title={fmt.dateTime.format(new Date(w.lastSeenAt))}
          className="text-fg-muted text-sm"
        >
          {ago(w.lastSeenAt, data.now)}
        </time>
      ),
    },
    {
      key: "queues",
      header: "Filas",
      align: "right",
      mobile: "desktopOnly",
      cell: (w) => (
        <span className="text-fg-muted tabular text-sm" title={w.queues.map(queueLabel).join(", ")}>
          {w.queues.length}
        </span>
      ),
    },
    {
      key: "since",
      header: "No ar desde",
      align: "right",
      mobile: "desktopOnly",
      cell: (w) => (
        <span className="text-fg-subtle text-sm">{fmt.dateTime.format(new Date(w.startedAt))}</span>
      ),
    },
  ];
  return (
    <section aria-labelledby="workers">
      <h2 id="workers" className="text-md mb-1 font-semibold">
        Workers
      </h2>
      <p className="text-fg-subtle mb-3 text-sm">
        Sinal de vida a cada 30 s. Sem sinal há mais de 2 min, a instância é dada como parada e seus
        jobs voltam para a fila.
      </p>
      {data.workers.length === 0 ? (
        <EmptyState
          icon={<ServerOff />}
          title="Nenhum worker nas últimas 24 h"
          description="Suba o processo do worker (npm run dev:worker ou o container) para ver a instância aqui."
        />
      ) : (
        <DataTable
          caption="Workers"
          rows={data.workers}
          columns={columns}
          rowKey={(w) => w.workerId}
        />
      )}
    </section>
  );
}

function TasksPanel({ data }: { data: OperationsData }) {
  type Row = OperationsData["tasks"][number];
  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Tarefa",
      mobile: "primary",
      cell: (t) => (
        <span className="min-w-0">
          <span className="block truncate font-medium">{taskLabel(t.name)}</span>
          <span className="text-fg-subtle block truncate text-xs">{every(t.everyMs)}</span>
          {t.lastError && (
            <span className="text-danger mt-0.5 block text-xs break-words">{t.lastError}</span>
          )}
        </span>
      ),
    },
    {
      key: "status",
      header: "Situação",
      mobile: "meta",
      cell: (t) =>
        t.status === "ERROR" ? (
          <Badge tone="danger" dot size="sm">
            Falhou
          </Badge>
        ) : t.status === "RUNNING" ? (
          <Badge tone="info" dot size="sm">
            Rodando
          </Badge>
        ) : t.late ? (
          <Badge tone="warning" dot size="sm">
            Atrasada
          </Badge>
        ) : t.status === "OK" ? (
          <Badge tone="success" dot size="sm">
            Em dia
          </Badge>
        ) : (
          <Badge size="sm">Aguardando</Badge>
        ),
    },
    {
      key: "last",
      header: "Última",
      mobile: "secondary",
      cell: (t) => (
        <span className="text-fg-muted text-sm">
          {t.lastFinishedAt
            ? `${ago(t.lastFinishedAt, data.now)} · ${(t.lastDurationMs / 1000).toFixed(1)} s`
            : "nunca"}
        </span>
      ),
    },
    {
      key: "next",
      header: "Próxima",
      align: "right",
      mobile: "desktopOnly",
      cell: (t) => <span className="text-fg-subtle text-sm">{ago(t.nextRunAt, data.now)}</span>,
    },
  ];
  return (
    <section aria-labelledby="tasks">
      <h2 id="tasks" className="text-md mb-1 font-semibold">
        Tarefas periódicas
      </h2>
      <p className="text-fg-subtle mb-3 text-sm">
        Cada execução roda em um worker só, mesmo com vários no ar.
      </p>
      {data.tasks.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="Nenhuma tarefa registrada ainda"
          description="As tarefas aparecem depois que um worker roda a primeira vez."
        />
      ) : (
        <DataTable
          caption="Tarefas periódicas"
          rows={data.tasks}
          columns={columns}
          rowKey={(t) => t.name}
        />
      )}
    </section>
  );
}

function QueuesPanel({
  data,
  filters,
}: {
  data: OperationsData;
  filters: { fila?: string; cliente?: string };
}) {
  type Row = OperationsData["queues"][number];
  const n = (v: number, tone?: string) => (
    <span className={`tabular text-sm ${v ? (tone ?? "text-fg") : "text-fg-faint"}`}>{v}</span>
  );
  const columns: Column<Row>[] = [
    {
      key: "queue",
      header: "Fila",
      mobile: "primary",
      cell: (q) => (
        <span className="min-w-0">
          <span className="block truncate font-medium">{queueLabel(q.queue)}</span>
          <span className="text-fg-subtle block truncate font-mono text-xs">{q.queue}</span>
        </span>
      ),
    },
    {
      key: "pending",
      header: "Na fila",
      align: "right",
      mobile: "secondary",
      cell: (q) => n(q.PENDING),
    },
    {
      key: "overdue",
      header: "Atrasados",
      align: "right",
      mobile: "desktopOnly",
      cell: (q) => n(q.overdue, "text-warning"),
    },
    {
      key: "running",
      header: "Rodando",
      align: "right",
      mobile: "desktopOnly",
      cell: (q) => n(q.RUNNING),
    },
    {
      key: "done",
      header: "Concluídos",
      align: "right",
      mobile: "desktopOnly",
      cell: (q) => n(q.DONE),
    },
    {
      key: "failed",
      header: "Falhas",
      align: "right",
      mobile: "meta",
      cell: (q) => n(q.FAILED + q.DEAD, "text-danger font-medium"),
    },
  ];
  return (
    <section aria-labelledby="queues">
      <h2 id="queues" className="text-md mb-1 font-semibold">
        Filas
      </h2>
      <p className="text-fg-subtle mb-3 text-sm">
        Concluídos ficam 14 dias; falhas, 60 (limpeza diária).
      </p>
      {data.queues.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="Nenhum job registrado"
          description="As filas aparecem com o primeiro job enfileirado."
        />
      ) : (
        <DataTable
          caption="Filas"
          rows={data.queues}
          columns={columns}
          rowKey={(q) => q.queue}
          rowHref={(q) => viewHref("falhas", { ...filters, fila: q.queue })}
        />
      )}
    </section>
  );
}

function DeliveriesPanel({ data }: { data: OperationsData }) {
  const d = data.deliveries;
  return (
    <section aria-labelledby="deliveries">
      <h2 id="deliveries" className="text-md mb-1 font-semibold">
        Entregas com falha
      </h2>
      <p className="text-fg-subtle mb-3 text-sm">
        Últimos 7 dias, somente leitura. Reenvios e correções ficam na comunicação de cada cliente.
      </p>
      <Panel>
        <PanelHeader
          title={`${(d.byChannel.EMAIL ?? 0) + (d.byChannel.WHATSAPP ?? 0)} falha(s)`}
          actions={
            <>
              <Badge size="sm">E-mail: {d.byChannel.EMAIL ?? 0}</Badge>
              <Badge size="sm">WhatsApp: {d.byChannel.WHATSAPP ?? 0}</Badge>
            </>
          }
        />
        {d.recent.length === 0 ? (
          <p className="text-fg-subtle px-5 py-6 text-sm">
            Nenhuma entrega falhou nos últimos 7 dias. Quando falhar, o destinatário aparece aqui
            mascarado, com o erro do provedor.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {d.recent.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 px-5 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge size="sm">{r.channel === "EMAIL" ? "E-mail" : "WhatsApp"}</Badge>
                  <span className="font-mono text-xs">{r.target}</span>
                  {r.tenant ? (
                    <Link href={r.tenant.href} className="text-brand-text hover:underline">
                      {r.tenant.name}
                    </Link>
                  ) : null}
                  <span className="text-fg-subtle ml-auto text-xs">
                    {ago(r.updatedAt, data.now)}
                  </span>
                </div>
                {r.error && <p className="text-danger text-sm break-words">{r.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}
