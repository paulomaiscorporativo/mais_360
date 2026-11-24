"use client";

import {
  BookCheck,
  CalendarClock,
  CircleCheck,
  Eye,
  FileWarning,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plane,
  Plus,
  ScanLine,
  Send,
  Trash2,
  UserPlus,
  Workflow,
} from "lucide-react";
import type { AutomationTrigger } from "@mais/core/automations";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Badge, Button, EmptyState, Field, Input, Notice, Panel, Skeleton } from "@/components/ui";
import { Checkbox, Select, Switch } from "@/components/ui/controls";
import {
  ConfirmDialog,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Sheet,
} from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import {
  createStarterTemplate,
  deleteAutomation,
  previewAutomation,
  runAutomationNowAction,
  saveAutomation,
  setAutomationActive,
} from "@/app/console/[ws]/clientes/[tenant]/comunicacao/actions";
import { fmtDateTime, REG_STATUS_LABEL, ROLE_LABEL, TRIGGER_LABEL } from "./labels";
import { STARTERS } from "./starters";

export type AutomationRow = {
  id: string;
  projectId: string;
  templateId: string;
  templateName: string;
  trigger: string;
  offsetDays: number;
  offsetHours: number;
  sendAt: string;
  repeatEveryDays: number;
  maxSends: number;
  channels: ("EMAIL" | "WHATSAPP")[];
  roles: string[];
  statuses: string[];
  active: boolean;
  next:
    | { kind: "event" }
    | { kind: "scheduled"; label: string; due: boolean }
    | { kind: "none"; label: string };
  stats: { sent: number; queued: number; skipped: number; failed: number; lastAt: string | null };
};

type ProjectOption = { id: string; name: string; features: string[] };
type TemplateOption = { id: string; name: string; projectId: string | null; purpose: string };
type Trigger = keyof typeof TRIGGER_LABEL;

const TRIGGER_ICON: Record<string, React.ReactNode> = {
  REGISTRATION_CREATED: <UserPlus />,
  REGISTRATION_CONFIRMED: <CircleCheck />,
  CHECKED_IN: <ScanLine />,
  DAYS_BEFORE_START: <CalendarClock />,
  DAYS_AFTER_END: <CalendarClock />,
  INVITE_DEADLINE_BEFORE: <CalendarClock />,
  FLIGHT_DEPARTURE_BEFORE: <Plane />,
  PASSPORT_EXPIRING: <BookCheck />,
  DOCUMENTS_PENDING: <FileWarning />,
};

const GROUPS: { key: "event" | "date" | "travel"; label: string }[] = [
  { key: "event", label: "Quando algo acontece" },
  { key: "date", label: "Por data do projeto" },
  { key: "travel", label: "Viagem em grupo" },
];

type Schedule = Pick<
  AutomationRow,
  "trigger" | "offsetDays" | "offsetHours" | "sendAt" | "repeatEveryDays" | "maxSends"
>;

const daysLabel = (d: number) => (d === 1 ? "1 dia" : `${d} dias`);

/** "3 dias antes do início, às 09:00" */
function describe(a: Schedule) {
  const d = a.offsetDays;
  const repeat =
    a.repeatEveryDays > 0 && a.maxSends > 1
      ? `; repete a cada ${daysLabel(a.repeatEveryDays)} até resolver (no máximo ${a.maxSends} envios)`
      : "";
  switch (a.trigger) {
    case "DAYS_BEFORE_START":
      return d === 0
        ? `No dia do início, às ${a.sendAt}`
        : `${daysLabel(d)} antes do início, às ${a.sendAt}`;
    case "DAYS_AFTER_END":
      return d === 0
        ? `No dia do término, às ${a.sendAt}`
        : `${daysLabel(d)} depois do término, às ${a.sendAt}`;
    case "INVITE_DEADLINE_BEFORE":
      return d === 0
        ? `No dia da data-limite, às ${a.sendAt}`
        : `${daysLabel(d)} antes da data-limite das cotas, às ${a.sendAt}`;
    case "FLIGHT_DEPARTURE_BEFORE":
      return `${a.offsetHours === 1 ? "1 hora" : `${a.offsetHours} horas`} antes de cada voo`;
    case "PASSPORT_EXPIRING":
      return `Passaporte pendente: ${daysLabel(d)} antes do embarque, às ${a.sendAt}${repeat}`;
    case "DOCUMENTS_PENDING":
      return `Documentos pendentes: ${daysLabel(d)} antes do embarque, às ${a.sendAt}${repeat}`;
    default:
      return TRIGGER_LABEL[a.trigger]?.label ?? a.trigger;
  }
}

/** Ordem cronológica da jornada: inscrição → antes → check-in → depois. */
function order(a: AutomationRow) {
  switch (a.trigger) {
    case "REGISTRATION_CREATED":
      return 0;
    case "REGISTRATION_CONFIRMED":
      return 1;
    case "INVITE_DEADLINE_BEFORE":
      return 100 - a.offsetDays;
    case "PASSPORT_EXPIRING":
    case "DOCUMENTS_PENDING":
    case "DAYS_BEFORE_START":
      return 1000 - a.offsetDays;
    case "FLIGHT_DEPARTURE_BEFORE":
      return 1500 - a.offsetHours / 24;
    case "CHECKED_IN":
      return 2000;
    default:
      return 3000 + a.offsetDays;
  }
}

/** O gatilho cabe no projeto? (recurso ligado) */
const fits = (t: Trigger, p: ProjectOption | undefined) => {
  const need = TRIGGER_LABEL[t]?.feature;
  return !need || !!p?.features.includes(need);
};

export function AutomationsManager({
  tenant,
  base,
  automations,
  projects,
  templates,
  canEdit,
}: {
  tenant: string;
  base: string;
  automations: AutomationRow[];
  projects: ProjectOption[];
  templates: TemplateOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AutomationRow | "new" | null>(null);
  const [removing, setRemoving] = useState<AutomationRow | null>(null);
  const [running, setRunning] = useState<AutomationRow | null>(null);
  const [previewing, setPreviewing] = useState<AutomationRow | null>(null);
  const [pending, start] = useTransition();
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "Projeto";

  const toggle = (a: AutomationRow, active: boolean) =>
    start(async () => {
      const r = await setAutomationActive({ tenant, id: a.id, active });
      if (r.ok) {
        toast.success(active ? "Régua ligada. Vale a partir de agora." : "Régua desligada.");
        router.refresh();
      } else toast.error(r.error);
    });

  const remove = () =>
    start(async () => {
      if (!removing) return;
      const r = await deleteAutomation({ tenant, id: removing.id });
      if (r.ok) {
        toast.success("Régua removida.");
        setRemoving(null);
        router.refresh();
      } else toast.error(r.error);
    });

  const runNow = () =>
    start(async () => {
      if (!running) return;
      const r = await runAutomationNowAction({ tenant, id: running.id });
      if (r.ok) {
        toast.success("Envio antecipado. As mensagens entram na fila em instantes.");
        setRunning(null);
        router.refresh();
      } else toast.error(r.error);
    });

  const byProject = new Map<string, AutomationRow[]>();
  for (const a of automations)
    byProject.set(a.projectId, [...(byProject.get(a.projectId) ?? []), a]);

  const blocked = !projects.length
    ? "Crie um evento ou viagem primeiro: cada régua acompanha o calendário de um projeto."
    : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-fg-muted max-w-2xl text-base">
          Mensagens que saem sozinhas no momento certo: confirmação da inscrição, lembrete da
          véspera, aviso de voo, cobrança de documentos e pesquisa depois do evento.
        </p>
        {canEdit && automations.length > 0 && (
          <Button onClick={() => setEditing("new")} disabled={!!blocked}>
            <Plus /> Nova régua
          </Button>
        )}
      </div>

      {automations.length === 0 ? (
        <EmptyState
          icon={<Workflow />}
          title="Automatize a comunicação do evento ou da viagem"
          description={
            blocked ??
            "Monte a sequência uma vez — inscrição, D-7, D-1, voo, check-in, pós-evento — e ela vale para todos os inscritos, inclusive os que chegarem depois."
          }
          action={
            canEdit &&
            !blocked && (
              <Button onClick={() => setEditing("new")}>
                <Plus /> Nova régua
              </Button>
            )
          }
        />
      ) : (
        [...byProject].map(([projectId, list]) => (
          <Panel key={projectId}>
            <div className="border-border flex items-center justify-between border-b px-5 py-3">
              <h3 className="font-semibold">{projectName(projectId)}</h3>
              <span className="text-fg-subtle text-xs">
                {list.filter((a) => a.active).length} de {list.length} ligada(s)
              </span>
            </div>
            <ol className="relative">
              {list
                .slice()
                .sort((a, b) => order(a) - order(b))
                .map((a, i, arr) => (
                  <li key={a.id} className="relative flex items-start gap-4 px-5 py-4">
                    {i < arr.length - 1 && (
                      <span
                        aria-hidden
                        className="bg-border absolute top-12 bottom-0 left-[38px] w-px"
                      />
                    )}
                    <span
                      className={
                        a.active
                          ? "bg-brand-subtle text-brand-subtle-fg relative grid size-9 shrink-0 place-items-center rounded-full [&_svg]:size-4"
                          : "bg-surface-sunken text-fg-faint relative grid size-9 shrink-0 place-items-center rounded-full [&_svg]:size-4"
                      }
                    >
                      {TRIGGER_ICON[a.trigger]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{describe(a)}</p>
                      <p className="text-fg-subtle mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span>{a.templateName}</span>
                        <span className="inline-flex items-center gap-1.5">
                          {a.channels.includes("EMAIL") && (
                            <Mail className="size-3.5" aria-label="E-mail" />
                          )}
                          {a.channels.includes("WHATSAPP") && (
                            <MessageCircle className="size-3.5" aria-label="WhatsApp" />
                          )}
                        </span>
                        {(a.roles.length > 0 || a.statuses.length > 0) && (
                          <span>
                            só{" "}
                            {[
                              ...a.roles.map((r) => ROLE_LABEL[r] ?? r),
                              ...a.statuses.map((s) => REG_STATUS_LABEL[s] ?? s),
                            ]
                              .join(", ")
                              .toLowerCase()}
                          </span>
                        )}
                      </p>
                      <NextAndHistory a={a} />
                    </div>
                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <Switch
                          checked={a.active}
                          disabled={pending}
                          onCheckedChange={(v) => toggle(a, v)}
                          aria-label={a.active ? "Desligar régua" : "Ligar régua"}
                        />
                      )}
                      <Menu>
                        <MenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Ações da régua">
                            <MoreHorizontal />
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem onSelect={() => setPreviewing(a)}>
                            <Eye /> Ver quem vai receber
                          </MenuItem>
                          {canEdit && a.active && a.next.kind === "scheduled" && (
                            <MenuItem onSelect={() => setRunning(a)}>
                              <Send /> Enviar agora
                            </MenuItem>
                          )}
                          {canEdit && (
                            <>
                              <MenuItem onSelect={() => setEditing(a)}>
                                <Pencil /> Editar
                              </MenuItem>
                              <MenuSeparator />
                              <MenuItem tone="danger" onSelect={() => setRemoving(a)}>
                                <Trash2 /> Remover
                              </MenuItem>
                            </>
                          )}
                        </MenuContent>
                      </Menu>
                    </div>
                  </li>
                ))}
            </ol>
          </Panel>
        ))
      )}

      {automations.length > 0 && (
        <Notice tone="info" title="Como as réguas disparam">
          Cada pessoa recebe cada régua uma única vez (os lembretes de documentos repetem só até o
          teto). As réguas por data saem no horário escolhido, no fuso do projeto. Uma régua ligada
          depois do horário previsto não envia o que já passou — a tolerância é de 6 horas. Guia
          completo em <span className="font-medium">docs/REGUAS.md</span>.
        </Notice>
      )}

      {editing && (
        <AutomationSheet
          tenant={tenant}
          base={base}
          row={editing === "new" ? null : editing}
          projects={projects}
          templates={templates}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {previewing && (
        <AudienceSheet tenant={tenant} row={previewing} onClose={() => setPreviewing(null)} />
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remover esta régua?"
        description="Ninguém mais recebe esta mensagem automaticamente. As que já saíram continuam no histórico."
        confirmLabel="Remover régua"
        tone="danger"
        loading={pending}
        onConfirm={remove}
      />
      <ConfirmDialog
        open={!!running}
        onOpenChange={(o) => !o && setRunning(null)}
        title="Enviar agora?"
        description={
          running?.next.kind === "scheduled"
            ? `O disparo previsto para ${running.next.label} sai agora, para quem se encaixa neste momento. No horário previsto ele não se repete.`
            : ""
        }
        confirmLabel="Enviar agora"
        loading={pending}
        onConfirm={runNow}
      />
    </div>
  );
}

function NextAndHistory({ a }: { a: AutomationRow }) {
  const s = a.stats;
  const parts = [
    s.sent && `${s.sent} enviada(s)`,
    s.queued && `${s.queued} na fila`,
    s.skipped && `${s.skipped} sem contato ou sem autorização`,
    s.failed && `${s.failed} com falha`,
  ].filter(Boolean);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      {!a.active ? (
        <Badge size="sm">Desligada</Badge>
      ) : a.next.kind === "event" ? (
        <Badge size="sm" tone="info">
          Sai a cada acontecimento
        </Badge>
      ) : a.next.kind === "scheduled" ? (
        <Badge size="sm" tone={a.next.due ? "brand" : "info"}>
          {a.next.due ? "Enviando agora" : `Próximo envio: ${a.next.label}`}
        </Badge>
      ) : (
        <Badge size="sm" tone="warning">
          {a.next.label}
        </Badge>
      )}
      <span className="text-fg-subtle">
        {parts.length ? parts.join(" · ") : "Nenhum envio ainda"}
        {s.lastAt ? ` · último em ${fmtDateTime(s.lastAt)}` : ""}
      </span>
      {s.failed > 0 && (
        <Badge size="sm" tone="danger">
          Verifique o canal de envio
        </Badge>
      )}
    </div>
  );
}

type Preview = {
  total: number;
  sample: { name: string; email: string; phone: string }[];
  withoutContact: number;
  alreadySent: number;
  occurrenceLabel?: string;
};

function AudienceSheet({
  tenant,
  row,
  onClose,
}: {
  tenant: string;
  row: AutomationRow;
  onClose: () => void;
}) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; error: string } | { status: "ok"; data: Preview }
  >({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  useEffect(() => {
    let alive = true;
    void previewAutomation({ tenant, id: row.id }).then((r) => {
      if (alive)
        setState(r.ok ? { status: "ok", data: r.data } : { status: "error", error: r.error });
    });
    return () => {
      alive = false;
    };
  }, [tenant, row.id, attempt]);

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Quem vai receber"
      description={
        row.next.kind === "event"
          ? "Quem hoje se encaixa no filtro. Novas inscrições entram automaticamente."
          : row.next.kind === "scheduled"
            ? `Próximo envio: ${row.next.label}. A lista é refeita na hora do envio.`
            : row.next.label
      }
    >
      {state.status === "loading" ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando">
          <Skeleton className="h-16" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : state.status === "error" ? (
        <Notice tone="danger" title="Não foi possível montar a prévia">
          {state.error}{" "}
          <Button variant="link" size="sm" onClick={retry}>
            Tentar de novo
          </Button>
        </Notice>
      ) : state.data.total === 0 ? (
        <EmptyState
          icon={<Eye />}
          title="Ninguém se encaixa agora"
          description="Confira o filtro da régua, a situação das inscrições e, nas réguas de viagem, se há voos com passageiros ou documentos pendentes."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <PreviewStat label="Pessoas" value={state.data.total} />
            <PreviewStat label="Sem contato" value={state.data.withoutContact} />
            <PreviewStat label="Já receberam" value={state.data.alreadySent} />
          </div>
          {state.data.occurrenceLabel && (
            <p className="text-fg-muted text-sm">Voo: {state.data.occurrenceLabel}</p>
          )}
          <ul className="divide-border border-border divide-y rounded-md border">
            {state.data.sample.map((p, i) => (
              <li key={i} className="px-3 py-2 text-sm">
                <p className="font-medium">{p.name}</p>
                <p className="text-fg-subtle truncate text-xs">
                  {[p.email, p.phone].filter(Boolean).join(" · ") || "Sem e-mail nem telefone"}
                </p>
              </li>
            ))}
          </ul>
          {state.data.total > state.data.sample.length && (
            <p className="text-fg-subtle text-xs">
              Mostrando {state.data.sample.length} de {state.data.total}.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border rounded-md border px-3 py-2">
      <p className="text-fg-subtle text-xs">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function AutomationSheet({
  tenant,
  base,
  row,
  projects,
  templates,
  onClose,
  onSaved,
}: {
  tenant: string;
  base: string;
  row: AutomationRow | null;
  projects: ProjectOption[];
  templates: TemplateOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    projectId: row?.projectId ?? projects[0]?.id ?? "",
    templateId: row?.templateId ?? "",
    trigger: (row?.trigger ?? "DAYS_BEFORE_START") as Trigger,
    offsetDays: String(row?.offsetDays ?? 1),
    offsetHours: String(row?.offsetHours || 24),
    sendAt: row?.sendAt ?? "09:00",
    repeatEveryDays: String(row?.repeatEveryDays || 7),
    maxSends: String(row && row.maxSends > 1 ? row.maxSends : 3),
    channels: row?.channels ?? (["EMAIL"] as ("EMAIL" | "WHATSAPP")[]),
    roles: row?.roles ?? [],
    statuses: row?.statuses ?? [],
    active: row?.active ?? true,
  });
  const [extraTemplates, setExtraTemplates] = useState<TemplateOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const info = TRIGGER_LABEL[f.trigger];
  const project = projects.find((p) => p.id === f.projectId);
  const all = [...templates, ...extraTemplates];
  const available = all.filter((t) => !t.projectId || t.projectId === f.projectId);
  const starters = info?.purpose
    ? STARTERS.filter((s) => s.purpose === info.purpose && s.id !== "blank")
    : [];
  const missingPurpose = !!info?.purpose && !available.some((t) => t.purpose === info.purpose);
  const num = (v: string) => Number(v) || 0;

  const toggleIn = <T extends string>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const applyStarter = (starterId: string) =>
    start(async () => {
      const r = await createStarterTemplate({ tenant, starterId, projectId: f.projectId });
      if (r.ok) {
        const created = STARTERS.find((s) => s.id === starterId);
        setExtraTemplates((l) => [
          ...l,
          {
            id: r.data.id,
            name: r.data.name,
            projectId: r.data.projectId,
            purpose: created?.purpose ?? "CUSTOM",
          },
        ]);
        set("templateId", r.data.id);
        toast.success("Modelo criado. Revise o texto em Modelos quando quiser.");
      } else toast.error(r.error);
    });

  const save = () =>
    start(async () => {
      const r = await saveAutomation({
        tenant,
        id: row?.id ?? null,
        projectId: f.projectId,
        templateId: f.templateId,
        trigger: f.trigger as AutomationTrigger,
        offsetDays: info?.usesDays ? num(f.offsetDays) : 0,
        offsetHours: info?.usesHours ? num(f.offsetHours) : 0,
        sendAt: f.sendAt,
        repeatEveryDays: info?.repeats ? num(f.repeatEveryDays) : 0,
        maxSends: info?.repeats ? Math.max(1, num(f.maxSends)) : 1,
        channels: f.channels,
        filter: {
          ...(f.roles.length ? { roles: f.roles } : {}),
          ...(f.statuses.length ? { statuses: f.statuses } : {}),
        },
        active: f.active,
      });
      if (r.ok) {
        toast.success(row ? "Régua atualizada." : "Régua criada.");
        onSaved();
      } else {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
      }
    });

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={row ? "Editar régua" : "Nova régua automática"}
      description="Quando a mensagem sai, para quem e por qual canal."
      footer={
        <Button onClick={save} loading={pending}>
          {row ? "Salvar régua" : "Criar régua"}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Evento ou viagem" error={errors.projectId}>
          {({ id, invalid }) => (
            <Select
              id={id}
              invalid={invalid}
              value={f.projectId || undefined}
              onValueChange={(v) => {
                set("projectId", v);
                set("templateId", "");
              }}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          )}
        </Field>

        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Quando enviar</span>
          {GROUPS.map((g) => {
            const list = (Object.keys(TRIGGER_LABEL) as Trigger[]).filter(
              (t) => TRIGGER_LABEL[t]!.group === g.key && (fits(t, project) || t === f.trigger),
            );
            if (!list.length) return null;
            return (
              <div key={g.key} className="flex flex-col gap-2">
                <span className="text-fg-subtle text-xs font-semibold">{g.label}</span>
                <div role="radiogroup" aria-label={g.label} className="grid gap-2 sm:grid-cols-2">
                  {list.map((t) => {
                    const on = f.trigger === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => set("trigger", t)}
                        className={
                          on
                            ? "border-brand bg-brand-subtle/50 flex items-start gap-3 rounded-md border p-3 text-left shadow-[0_0_0_1px_var(--brand)]"
                            : "border-border-strong hover:border-fg-faint/70 flex items-start gap-3 rounded-md border p-3 text-left"
                        }
                      >
                        <span
                          className={
                            on
                              ? "text-brand-text mt-0.5 [&_svg]:size-4"
                              : "text-fg-subtle mt-0.5 [&_svg]:size-4"
                          }
                        >
                          {TRIGGER_ICON[t]}
                        </span>
                        <span>
                          <span className="block text-sm font-semibold">
                            {TRIGGER_LABEL[t]!.label}
                          </span>
                          <span className="text-fg-subtle block text-xs">
                            {TRIGGER_LABEL[t]!.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {project && !project.features.includes("FLIGHTS") && (
            <p className="text-fg-subtle text-xs">
              Réguas de voo e documentos aparecem quando o projeto usa voos ou documentos do
              viajante.
            </p>
          )}
          {info && <Notice tone="info">{info.explain}</Notice>}
        </div>

        {info?.usesHours && (
          <Field
            label="Quantas horas antes da partida"
            hint="Ex.: 24 para a véspera, 3 para o dia do embarque. Horário de cada voo, no fuso do aeroporto."
            error={errors.offsetHours}
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                inputMode="numeric"
                aria-describedby={describedBy}
                value={f.offsetHours}
                onChange={(e) => set("offsetHours", e.target.value.replace(/\D/g, "").slice(0, 3))}
              />
            )}
          </Field>
        )}

        {info?.usesDays && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={info.repeats ? "Começar quantos dias antes do embarque" : "Quantos dias"}
              error={errors.offsetDays}
            >
              {({ id }) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  value={f.offsetDays}
                  onChange={(e) => set("offsetDays", e.target.value.replace(/\D/g, "").slice(0, 3))}
                />
              )}
            </Field>
            <Field label="Horário" hint="No fuso do projeto." error={errors.sendAt}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="time"
                  aria-describedby={describedBy}
                  value={f.sendAt}
                  onChange={(e) => set("sendAt", e.target.value)}
                />
              )}
            </Field>
          </div>
        )}

        {info?.repeats && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Repetir a cada quantos dias"
              hint="0 = envia uma vez só."
              error={errors.repeatEveryDays}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  aria-describedby={describedBy}
                  value={f.repeatEveryDays}
                  onChange={(e) =>
                    set("repeatEveryDays", e.target.value.replace(/\D/g, "").slice(0, 2))
                  }
                />
              )}
            </Field>
            <Field
              label="No máximo quantos envios por pessoa"
              hint="Para quando a pendência é resolvida ou no embarque."
              error={errors.maxSends}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  aria-describedby={describedBy}
                  value={f.maxSends}
                  onChange={(e) => set("maxSends", e.target.value.replace(/\D/g, "").slice(0, 2))}
                />
              )}
            </Field>
          </div>
        )}

        <Field label="Mensagem" error={errors.templateId}>
          {({ id, invalid }) => (
            <Select
              id={id}
              invalid={invalid}
              value={f.templateId || undefined}
              onValueChange={(v) => set("templateId", v)}
              placeholder={available.length ? "Escolha um modelo" : "Nenhum modelo disponível"}
              options={available.map((t) => ({ value: t.id, label: t.name }))}
            />
          )}
        </Field>
        {missingPurpose && starters.length > 0 && (
          <Notice tone="info" title="Ainda não há modelo para este tipo de mensagem">
            <span className="block">Comece por um modelo pronto e ajuste depois em Modelos.</span>
            <span className="mt-2 flex flex-wrap gap-2">
              {starters.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant="secondary"
                  loading={pending}
                  onClick={() => applyStarter(s.id)}
                >
                  Usar “{s.name}”
                </Button>
              ))}
            </span>
          </Notice>
        )}
        {!available.length && !starters.length && (
          <p className="text-fg-subtle text-xs">
            <Link className="underline" href={`${base}/modelos/novo`}>
              Escreva um modelo
            </Link>{" "}
            para usar nesta régua.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Canais</span>
          <div className="flex flex-wrap gap-4">
            {(
              [
                ["EMAIL", "E-mail", <Mail key="m" className="size-4" />],
                ["WHATSAPP", "WhatsApp", <MessageCircle key="w" className="size-4" />],
              ] as const
            ).map(([v, l, icon]) => (
              <label key={v} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={f.channels.includes(v)}
                  onCheckedChange={() => set("channels", toggleIn(f.channels, v))}
                />
                <span className="text-fg-subtle">{icon}</span> {l}
              </label>
            ))}
          </div>
          {errors.channels && <p className="text-danger text-xs font-medium">{errors.channels}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">
            Só para <span className="text-fg-subtle font-normal">(opcional)</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ROLE_LABEL).map(([v, l]) => (
              <TogglePill
                key={v}
                on={f.roles.includes(v)}
                onClick={() => set("roles", toggleIn(f.roles, v))}
              >
                {l}
              </TogglePill>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(REG_STATUS_LABEL)
              .filter(([k]) => k !== "CANCELED")
              .map(([v, l]) => (
                <TogglePill
                  key={v}
                  on={f.statuses.includes(v)}
                  onClick={() => set("statuses", toggleIn(f.statuses, v))}
                >
                  {l}
                </TogglePill>
              ))}
          </div>
          <p className="text-fg-subtle text-xs">
            Sem escolha, recebem todos menos quem cancelou ou recusou.
          </p>
        </div>

        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="text-sm font-medium">Régua ligada</span>
            <span className="text-fg-subtle block text-xs">
              Desligada, nada sai. Ao religar, vale dali em diante — o que passou não é enviado.
            </span>
          </span>
          <Switch checked={f.active} onCheckedChange={(v) => set("active", v)} />
        </label>
        <div className="flex">
          <Badge size="sm">
            Prévia:{" "}
            {describe({
              trigger: f.trigger,
              offsetDays: num(f.offsetDays),
              offsetHours: num(f.offsetHours),
              sendAt: f.sendAt,
              repeatEveryDays: info?.repeats ? num(f.repeatEveryDays) : 0,
              maxSends: info?.repeats ? num(f.maxSends) : 1,
            })}
          </Badge>
        </div>
      </div>
    </Sheet>
  );
}

function TogglePill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={
        on
          ? "border-brand bg-brand-subtle text-brand-subtle-fg inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium"
          : "border-border-strong text-fg-muted hover:text-fg inline-flex h-7 items-center rounded-full border px-2.5 text-xs"
      }
    >
      {children}
    </button>
  );
}
