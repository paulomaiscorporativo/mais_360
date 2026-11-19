"use client";

import {
  CalendarClock,
  CircleCheck,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  ScanLine,
  Trash2,
  UserPlus,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Button, EmptyState, Field, Input, Notice, Panel } from "@/components/ui";
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
  deleteAutomation,
  saveAutomation,
  setAutomationActive,
} from "@/app/console/[ws]/clientes/[tenant]/comunicacao/actions";
import { REG_STATUS_LABEL, ROLE_LABEL, TRIGGER_LABEL } from "./labels";

export type AutomationRow = {
  id: string;
  projectId: string;
  templateId: string;
  templateName: string;
  trigger: string;
  offsetDays: number;
  sendAt: string;
  channels: ("EMAIL" | "WHATSAPP")[];
  roles: string[];
  statuses: string[];
  active: boolean;
};

type Trigger = keyof typeof TRIGGER_LABEL;

const TRIGGER_ICON: Record<string, React.ReactNode> = {
  REGISTRATION_CREATED: <UserPlus />,
  REGISTRATION_CONFIRMED: <CircleCheck />,
  CHECKED_IN: <ScanLine />,
  DAYS_BEFORE_START: <CalendarClock />,
  DAYS_AFTER_END: <CalendarClock />,
  INVITE_DEADLINE_BEFORE: <CalendarClock />,
};

/** "3 dias antes do início, às 09:00" */
function describe(a: Pick<AutomationRow, "trigger" | "offsetDays" | "sendAt">) {
  const d = a.offsetDays;
  const days = d === 0 ? "No dia" : d === 1 ? "1 dia" : `${d} dias`;
  switch (a.trigger) {
    case "DAYS_BEFORE_START":
      return d === 0
        ? `No dia do início, às ${a.sendAt}`
        : `${days} antes do início, às ${a.sendAt}`;
    case "DAYS_AFTER_END":
      return d === 0
        ? `No dia do término, às ${a.sendAt}`
        : `${days} depois do término, às ${a.sendAt}`;
    case "INVITE_DEADLINE_BEFORE":
      return d === 0
        ? `No dia da data-limite, às ${a.sendAt}`
        : `${days} antes da data-limite das cotas, às ${a.sendAt}`;
    default:
      return TRIGGER_LABEL[a.trigger]?.label ?? a.trigger;
  }
}

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
  projects: { id: string; name: string }[];
  templates: { id: string; name: string; projectId: string | null }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AutomationRow | "new" | null>(null);
  const [removing, setRemoving] = useState<AutomationRow | null>(null);
  const [pending, start] = useTransition();
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "Projeto";

  const toggle = (a: AutomationRow, active: boolean) =>
    start(async () => {
      const r = await setAutomationActive({ tenant, id: a.id, active });
      if (r.ok) {
        toast.success(active ? "Régua ligada." : "Régua desligada.");
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

  const byProject = new Map<string, AutomationRow[]>();
  for (const a of automations)
    byProject.set(a.projectId, [...(byProject.get(a.projectId) ?? []), a]);

  const blocked = !projects.length
    ? "Crie um evento ou viagem primeiro: cada régua acompanha o calendário de um projeto."
    : !templates.length
      ? "Escreva um modelo de mensagem primeiro."
      : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-fg-muted max-w-2xl text-base">
          Mensagens que saem sozinhas no momento certo: confirmação da inscrição, lembrete da
          véspera, boas-vindas no check-in e pesquisa depois do evento.
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
          title="Automatize a comunicação do evento"
          description={
            blocked ??
            "Monte a sequência uma vez — inscrição, D-7, D-1, check-in, pós-evento — e ela vale para todos os inscritos, inclusive os que chegarem depois."
          }
          action={
            canEdit &&
            (blocked ? (
              !templates.length && projects.length ? (
                <Button asChild>
                  <Link href={`${base}/modelos/novo`}>Escrever modelo</Link>
                </Button>
              ) : null
            ) : (
              <Button onClick={() => setEditing("new")}>
                <Plus /> Nova régua
              </Button>
            ))
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
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={a.active}
                          disabled={pending}
                          onCheckedChange={(v) => toggle(a, v)}
                          aria-label={a.active ? "Desligar régua" : "Ligar régua"}
                        />
                        <Menu>
                          <MenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Ações da régua">
                              <MoreHorizontal />
                            </Button>
                          </MenuTrigger>
                          <MenuContent>
                            <MenuItem onSelect={() => setEditing(a)}>
                              <Pencil /> Editar
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem tone="danger" onSelect={() => setRemoving(a)}>
                              <Trash2 /> Remover
                            </MenuItem>
                          </MenuContent>
                        </Menu>
                      </div>
                    )}
                  </li>
                ))}
            </ol>
          </Panel>
        ))
      )}

      {automations.length > 0 && (
        <Notice tone="info" title="Como as réguas disparam">
          Cada pessoa recebe cada régua uma única vez. As réguas por data saem no horário escolhido,
          no fuso do evento, respeitando o ritmo de proteção do WhatsApp.
        </Notice>
      )}

      {editing && (
        <AutomationSheet
          tenant={tenant}
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
    </div>
  );
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
    case "DAYS_BEFORE_START":
      return 1000 - a.offsetDays;
    case "CHECKED_IN":
      return 2000;
    default:
      return 3000 + a.offsetDays;
  }
}

function AutomationSheet({
  tenant,
  row,
  projects,
  templates,
  onClose,
  onSaved,
}: {
  tenant: string;
  row: AutomationRow | null;
  projects: { id: string; name: string }[];
  templates: { id: string; name: string; projectId: string | null }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    projectId: row?.projectId ?? projects[0]?.id ?? "",
    templateId: row?.templateId ?? "",
    trigger: (row?.trigger ?? "DAYS_BEFORE_START") as Trigger,
    offsetDays: String(row?.offsetDays ?? 1),
    sendAt: row?.sendAt ?? "09:00",
    channels: row?.channels ?? (["EMAIL"] as ("EMAIL" | "WHATSAPP")[]),
    roles: row?.roles ?? [],
    statuses: row?.statuses ?? [],
    active: row?.active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const usesDays = TRIGGER_LABEL[f.trigger]?.usesDays;
  const available = templates.filter((t) => !t.projectId || t.projectId === f.projectId);

  const toggleIn = <T extends string>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const save = () =>
    start(async () => {
      const r = await saveAutomation({
        tenant,
        id: row?.id ?? null,
        projectId: f.projectId,
        templateId: f.templateId,
        trigger: f.trigger,
        offsetDays: usesDays ? Number(f.offsetDays) || 0 : 0,
        sendAt: f.sendAt,
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

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Quando enviar</span>
          <div role="radiogroup" aria-label="Gatilho" className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(TRIGGER_LABEL) as Trigger[]).map((t) => {
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
                    <span className="block text-sm font-semibold">{TRIGGER_LABEL[t]!.label}</span>
                    <span className="text-fg-subtle block text-xs">{TRIGGER_LABEL[t]!.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {usesDays && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quantos dias" error={errors.offsetDays}>
              {({ id }) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  value={f.offsetDays}
                  onChange={(e) => set("offsetDays", e.target.value.replace(/\D/g, "").slice(0, 3))}
                />
              )}
            </Field>
            <Field label="Horário" hint="No fuso do evento." error={errors.sendAt}>
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
        </div>

        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="text-sm font-medium">Régua ligada</span>
            <span className="text-fg-subtle block text-xs">
              Desligada, nada sai — e você pode religar quando quiser.
            </span>
          </span>
          <Switch checked={f.active} onCheckedChange={(v) => set("active", v)} />
        </label>
        <div className="flex">
          <Badge size="sm">
            Prévia:{" "}
            {describe({
              trigger: f.trigger,
              offsetDays: Number(f.offsetDays) || 0,
              sendAt: f.sendAt,
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
