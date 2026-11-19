"use client";

import {
  Ban,
  CheckCircle2,
  Copy,
  ExternalLink,
  Mail,
  MailOpen,
  MessageCircle,
  MoreHorizontal,
  RotateCcw,
  Search,
  Send,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { InviteStatus } from "@mais/core";
import { Badge, Button, EmptyState, Field, Input, Notice } from "@/components/ui";
import { Checkbox, Select, Switch } from "@/components/ui/controls";
import { DataTable } from "@/components/ui/data-table";
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
import { INVITE_KIND_LABEL, INVITE_STATUS_UI } from "@/components/events/labels";
import {
  addGuest,
  cancelGuests,
  reactivateGuest,
  sendInvites,
  setGuestStatus,
} from "./actions";

export type GuestRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  companyId: string | null;
  kind: keyof typeof INVITE_KIND_LABEL;
  status: InviteStatus;
  shortCode: string;
  table: string;
  category: { name: string; color: string } | null;
  /** "EMAIL:SENT", "WHATSAPP:READ"… */
  deliveries: string[];
  link: string;
};

type Channel = "EMAIL" | "WHATSAPP";

export function GuestsManager(props: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  rows: GuestRow[];
  companies: { id: string; name: string; locked: boolean }[];
  categories: { id: string; name: string; color: string }[];
  pool: { available: number; total: number } | null;
  filters: { q: string; status: string; empresa: string };
}) {
  const { rows, canEdit, tenant, projectId } = props;
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(props.filters.q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState<{ ids: string[]; resend: boolean } | null>(null);
  const [canceling, setCanceling] = useState<string[] | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (q === props.filters.q) return;
    const t = setTimeout(() => setParam("q", q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const ids = rows.map((r) => r.id);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const hasFilters = !!props.filters.q || !!props.filters.status || !!props.filters.empresa;
  const counts = countBy(rows);

  function quick(action: Promise<{ ok: boolean; error?: string }>, done: string) {
    start(async () => {
      const r = await action;
      if (r.ok) {
        toast.success(done);
        router.refresh();
      } else toast.error(r.error ?? "Não foi possível concluir.");
    });
  }

  if (rows.length === 0 && !hasFilters) {
    return (
      <>
        <EmptyState
          icon={<MailOpen />}
          title="Emita os primeiros convites"
          description="Cadastre as empresas convidadas com suas cotas (elas mesmas inscrevem os convidados) ou emita convites individuais da organização."
          action={
            canEdit && (
              <Button onClick={() => setAdding(true)}>
                <UserPlus /> Convite individual
              </Button>
            )
          }
          secondary={
            <Button variant="secondary" onClick={() => router.push(`${pathname}/empresas`)}>
              Cadastrar empresas
            </Button>
          }
        />
        <AddGuestSheet
          open={adding}
          onOpenChange={setAdding}
          {...{ tenant, projectId }}
          companies={props.companies}
          categories={props.categories}
        />
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:grid-cols-4 [&>*]:bg-surface">
        <Kpi label="Convites ativos" value={counts.active} />
        <Kpi label="Enviados" value={counts.sent} hint={`${counts.pending} a enviar`} />
        <Kpi label="Confirmados" value={counts.confirmed} hint={`${counts.declined} recusaram`} />
        <Kpi
          label={props.pool ? "Pool individual" : "Credenciados"}
          value={props.pool ? props.pool.available : counts.checkedIn}
          hint={props.pool ? `de ${props.pool.total} devolvidos pelas empresas` : "no dia do evento"}
        />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, empresa ou código"
            leading={<Search />}
            trailing={
              q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="hover:text-fg rounded p-1"
                  aria-label="Limpar busca"
                >
                  <X className="size-3.5" />
                </button>
              )
            }
            aria-label="Buscar convidados"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <Select
            value={props.filters.status || "ACTIVE"}
            onValueChange={(v) => setParam("status", v === "ACTIVE" ? "" : v)}
            options={[
              { value: "ACTIVE", label: "Ativos" },
              ...Object.entries(INVITE_STATUS_UI).map(([value, s]) => ({ value, label: s.label })),
              { value: "ALL", label: "Todos" },
            ]}
            className="md:w-40"
          />
          <Select
            value={props.filters.empresa || "any"}
            onValueChange={(v) => setParam("empresa", v === "any" ? "" : v)}
            options={[
              { value: "any", label: "Todas as origens" },
              { value: "individual", label: "Convites individuais" },
              ...props.companies.map((c) => ({ value: c.id, label: c.name })),
            ]}
            className="md:w-56"
          />
        </div>
        {canEdit && (
          <Button onClick={() => setAdding(true)}>
            <UserPlus /> Convite
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-fg-subtle py-10 text-center text-sm">Nenhum convidado com estes filtros.</p>
      ) : (
        <DataTable
          caption="Convidados do evento"
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            ...(canEdit
              ? [
                  {
                    key: "sel",
                    header: (
                      <Checkbox
                        checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false}
                        onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(ids))}
                        aria-label="Selecionar todos"
                      />
                    ),
                    className: "w-10",
                    mobile: "desktopOnly" as const,
                    cell: (r: GuestRow) => (
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={(on) =>
                          setSelected((s) => {
                            const n = new Set(s);
                            if (on) n.add(r.id);
                            else n.delete(r.id);
                            return n;
                          })
                        }
                        aria-label={`Selecionar ${r.name}`}
                      />
                    ),
                  },
                ]
              : []),
            {
              key: "name",
              header: "Convidado",
              mobile: "primary",
              cell: (r) => (
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.name}</span>
                    {r.kind === "RESPONSIBLE" && (
                      <Badge size="sm" tone="brand">
                        Responsável
                      </Badge>
                    )}
                  </span>
                  <span className="text-fg-subtle block truncate text-sm">
                    {r.company || INVITE_KIND_LABEL[r.kind]}
                  </span>
                </span>
              ),
            },
            {
              key: "contact",
              header: "Envio",
              mobile: "desktopOnly",
              cell: (r) => <DeliveryIcons row={r} />,
            },
            {
              key: "table",
              header: "Mesa",
              mobile: "secondary",
              cell: (r) =>
                r.table ? (
                  <span className="tabular text-sm">Mesa {r.table.replace("·", " · cad. ")}</span>
                ) : (
                  <span className="text-fg-faint text-sm">—</span>
                ),
            },
            {
              key: "code",
              header: "Código",
              mobile: "desktopOnly",
              cell: (r) => <span className="tabular text-fg-muted font-mono text-sm">{r.shortCode}</span>,
            },
            {
              key: "status",
              header: "Status",
              mobile: "meta",
              cell: (r) => (
                <Badge tone={INVITE_STATUS_UI[r.status].tone} dot size="sm">
                  {INVITE_STATUS_UI[r.status].label}
                </Badge>
              ),
            },
            {
              key: "actions",
              header: <span className="sr-only">Ações</span>,
              className: "w-12",
              align: "right" as const,
              mobile: "meta" as const,
              cell: (r: GuestRow) => (
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${r.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuItem
                      onSelect={() => {
                        void navigator.clipboard.writeText(r.link);
                        toast.success("Link do convite copiado.");
                      }}
                    >
                      <Copy /> Copiar link do convite
                    </MenuItem>
                    <MenuItem onSelect={() => window.open(r.link, "_blank", "noopener")}>
                      <ExternalLink /> Abrir convite
                    </MenuItem>
                    {canEdit && r.status !== "CANCELED" && (
                      <>
                        <MenuSeparator />
                        <MenuItem
                          onSelect={() =>
                            setSending({ ids: [r.id], resend: r.status !== "PENDING" })
                          }
                        >
                          <Send /> {r.status === "PENDING" ? "Enviar convite" : "Reenviar convite"}
                        </MenuItem>
                        {r.status !== "CONFIRMED" && r.status !== "CHECKED_IN" && (
                          <MenuItem
                            onSelect={() =>
                              quick(
                                setGuestStatus({ tenant, projectId, id: r.id, status: "CONFIRMED" }),
                                "Presença confirmada.",
                              )
                            }
                          >
                            <CheckCircle2 /> Marcar como confirmado
                          </MenuItem>
                        )}
                        {r.status !== "DECLINED" && r.status !== "CHECKED_IN" && (
                          <MenuItem
                            onSelect={() =>
                              quick(
                                setGuestStatus({ tenant, projectId, id: r.id, status: "DECLINED" }),
                                "Marcado como recusado.",
                              )
                            }
                          >
                            <XCircle /> Marcar como recusado
                          </MenuItem>
                        )}
                        <MenuSeparator />
                        <MenuItem tone="danger" onSelect={() => setCanceling([r.id])}>
                          <Ban /> Cancelar convite
                        </MenuItem>
                      </>
                    )}
                    {canEdit && r.status === "CANCELED" && (
                      <MenuItem
                        onSelect={() =>
                          quick(reactivateGuest({ tenant, projectId, id: r.id }), "Convite reativado.")
                        }
                      >
                        <RotateCcw /> Reativar convite
                      </MenuItem>
                    )}
                  </MenuContent>
                </Menu>
              ),
            },
          ]}
        />
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6">
          <div className="border-border bg-surface flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 shadow-lg">
            <span className="tabular px-1 text-sm font-medium">{selected.size} selecionados</span>
            <Button size="sm" onClick={() => setSending({ ids: [...selected], resend: false })}>
              <Send /> Enviar convites
            </Button>
            <Button size="sm" variant="danger-ghost" onClick={() => setCanceling([...selected])}>
              <Ban /> Cancelar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Limpar
            </Button>
          </div>
        </div>
      )}

      <AddGuestSheet
        open={adding}
        onOpenChange={setAdding}
        {...{ tenant, projectId }}
        companies={props.companies}
        categories={props.categories}
      />
      <SendDialog
        target={sending}
        onClose={() => setSending(null)}
        pending={pending}
        onSend={(channels, resend) =>
          start(async () => {
            if (!sending) return;
            const r = await sendInvites({ tenant, projectId, ids: sending.ids, channels, resend });
            if (r.ok) {
              const { sent, skipped, sample } = r.data;
              if (sent) toast.success(`${sent} envio(s) na fila. Acompanhe o status na lista.`);
              if (skipped)
                toast.warning(`${skipped} envio(s) não saíram: ${sample.join(" · ")}`);
              if (!sent && !skipped) toast.info("Nada novo a enviar — os convites já tinham saído.");
              setSending(null);
              setSelected(new Set());
              router.refresh();
            } else toast.error(r.error);
          })
        }
      />
      <CancelDialog
        ids={canceling}
        onClose={() => setCanceling(null)}
        pending={pending}
        onConfirm={(notify) =>
          start(async () => {
            if (!canceling) return;
            const r = await cancelGuests({ tenant, projectId, ids: canceling, notify });
            if (r.ok) {
              toast.success(canceling.length > 1 ? "Convites cancelados." : "Convite cancelado.");
              setCanceling(null);
              setSelected(new Set());
              router.refresh();
            } else toast.error(r.error);
          })
        }
      />
    </>
  );
}

function countBy(rows: GuestRow[]) {
  const c = { active: 0, sent: 0, pending: 0, confirmed: 0, declined: 0, checkedIn: 0 };
  for (const r of rows) {
    if (r.status === "CANCELED") continue;
    c.active++;
    if (r.status === "PENDING") c.pending++;
    else c.sent++;
    if (r.status === "CONFIRMED" || r.status === "CHECKED_IN") c.confirmed++;
    if (r.status === "DECLINED") c.declined++;
    if (r.status === "CHECKED_IN") c.checkedIn++;
  }
  return c;
}

function Kpi({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-fg-subtle text-xs">{label}</p>
      <p className="tabular mt-0.5 text-xl font-semibold">{value}</p>
      {hint && <p className="text-fg-faint text-xs">{hint}</p>}
    </div>
  );
}

const DELIVERY_RANK = ["FAILED", "SKIPPED", "QUEUED", "SENDING", "SENT", "DELIVERED", "READ"];

function DeliveryIcons({ row }: { row: GuestRow }) {
  const best = (channel: Channel) => {
    const list = row.deliveries
      .filter((d) => d.startsWith(`${channel}:`))
      .map((d) => d.split(":")[1] ?? "");
    return list.sort((a, b) => DELIVERY_RANK.indexOf(b) - DELIVERY_RANK.indexOf(a))[0];
  };
  const tone = (s?: string) =>
    !s
      ? "text-fg-faint"
      : s === "FAILED"
        ? "text-danger"
        : s === "READ" || s === "DELIVERED"
          ? "text-success"
          : s === "SKIPPED"
            ? "text-warning"
            : "text-info";
  const title = (c: string, s?: string) =>
    `${c}: ${
      !s
        ? "não enviado"
        : ({
            FAILED: "falhou",
            SKIPPED: "não enviado (sem contato)",
            QUEUED: "na fila",
            SENDING: "enviando",
            SENT: "enviado",
            DELIVERED: "entregue",
            READ: "lido",
          } as Record<string, string>)[s] ?? s
    }`;
  const e = best("EMAIL");
  const w = best("WHATSAPP");
  return (
    <span className="flex items-center gap-2">
      <Mail className={`size-4 ${tone(e)}`} aria-label={title("E-mail", e)}>
        <title>{title("E-mail", e)}</title>
      </Mail>
      <MessageCircle className={`size-4 ${tone(w)}`} aria-label={title("WhatsApp", w)}>
        <title>{title("WhatsApp", w)}</title>
      </MessageCircle>
    </span>
  );
}

function ChannelPicker({ value, onChange }: { value: Channel[]; onChange: (v: Channel[]) => void }) {
  const toggle = (c: Channel, on: boolean) =>
    onChange(on ? [...new Set([...value, c])] : value.filter((x) => x !== c));
  return (
    <div className="flex flex-col gap-3">
      {(
        [
          ["EMAIL", "E-mail", "Sai na hora, com o convite digital e o QR."],
          ["WHATSAPP", "WhatsApp", "Segue o ritmo seguro do número conectado."],
        ] as const
      ).map(([c, label, hint]) => (
        <label key={c} className="flex items-start gap-3">
          <Switch checked={value.includes(c)} onCheckedChange={(on) => toggle(c, on)} />
          <span>
            <span className="block text-base font-medium">{label}</span>
            <span className="text-fg-subtle block text-sm">{hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function SendDialog({
  target,
  onClose,
  onSend,
  pending,
}: {
  target: { ids: string[]; resend: boolean } | null;
  onClose: () => void;
  onSend: (channels: Channel[], resend: boolean) => void;
  pending: boolean;
}) {
  const [channels, setChannels] = useState<Channel[]>(["EMAIL", "WHATSAPP"]);
  const [resend, setResend] = useState(false);
  const n = target?.ids.length ?? 0;
  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o) onClose();
        else setResend(target?.resend ?? false);
      }}
      title={n === 1 ? "Enviar convite" : `Enviar ${n} convites`}
      description="Cada convidado recebe o link do convite digital com QR, data, local e o botão de confirmar presença."
      confirmLabel="Enviar"
      loading={pending}
      onConfirm={() => onSend(channels, resend || !!target?.resend)}
    >
      <div className="flex flex-col gap-4">
        <ChannelPicker value={channels} onChange={setChannels} />
        {!target?.resend && (
          <label className="text-fg-muted flex items-center gap-2 text-sm">
            <Checkbox checked={resend} onCheckedChange={(v) => setResend(v === true)} />
            Reenviar para quem já recebeu
          </label>
        )}
      </div>
    </ConfirmDialog>
  );
}

function CancelDialog({
  ids,
  onClose,
  onConfirm,
  pending,
}: {
  ids: string[] | null;
  onClose: () => void;
  onConfirm: (notify: boolean) => void;
  pending: boolean;
}) {
  const [notify, setNotify] = useState(true);
  const n = ids?.length ?? 0;
  return (
    <ConfirmDialog
      open={!!ids}
      onOpenChange={(o) => !o && onClose()}
      title={n === 1 ? "Cancelar este convite?" : `Cancelar ${n} convites?`}
      description="O QR deixa de valer no check-in e a cadeira na mesa fica livre. Você pode reativar depois."
      confirmLabel="Cancelar convite"
      cancelLabel="Voltar"
      tone="danger"
      loading={pending}
      onConfirm={() => onConfirm(notify)}
    >
      <label className="text-fg-muted flex items-center gap-2 text-sm">
        <Checkbox checked={notify} onCheckedChange={(v) => setNotify(v === true)} />
        Avisar o convidado por e-mail e WhatsApp
      </label>
    </ConfirmDialog>
  );
}

function AddGuestSheet({
  open,
  onOpenChange,
  tenant,
  projectId,
  companies,
  categories,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenant: string;
  projectId: string;
  companies: { id: string; name: string; locked: boolean }[];
  categories: { id: string; name: string; color: string }[];
}) {
  const router = useRouter();
  const [f, setF] = useState({ fullName: "", email: "", phone: "", company: "", jobTitle: "" });
  const [origin, setOrigin] = useState("individual");
  const [category, setCategory] = useState("none");
  const [channels, setChannels] = useState<Channel[]>(["EMAIL"]);
  const [send, setSend] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const r = await addGuest({
        tenant,
        projectId,
        ...f,
        companyQuotaId: origin === "individual" ? null : origin,
        categoryId: category === "none" ? null : category,
        ...(send && channels.length ? { send: channels } : {}),
      });
      if (r.ok) {
        toast.success(r.data.sent ? "Convite emitido e enviado." : "Convite emitido.");
        setF({ fullName: "", email: "", phone: "", company: "", jobTitle: "" });
        setErrors({});
        onOpenChange(false);
        router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
      }
    });
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Novo convite"
      description="Convites individuais saem do pool da organização; convites de empresa ocupam a cota dela."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={pending}>
            Emitir convite
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome completo" error={errors.fullName}>
          {(a) => <Input {...a} value={f.fullName} onChange={set("fullName")} autoFocus />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-mail" optional error={errors.email}>
            {(a) => <Input {...a} type="email" value={f.email} onChange={set("email")} />}
          </Field>
          <Field label="WhatsApp" optional error={errors.phone}>
            {(a) => (
              <Input {...a} inputMode="tel" placeholder="(11) 99999-9999" value={f.phone} onChange={set("phone")} />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Empresa" optional>
            {(a) => <Input {...a} value={f.company} onChange={set("company")} />}
          </Field>
          <Field label="Cargo" optional>
            {(a) => <Input {...a} value={f.jobTitle} onChange={set("jobTitle")} />}
          </Field>
        </div>
        <Field label="Origem do convite">
          {(a) => (
            <Select
              id={a.id}
              value={origin}
              onValueChange={setOrigin}
              options={[
                { value: "individual", label: "Convite individual da organização" },
                ...companies.map((c) => ({
                  value: c.id,
                  label: `Cota de ${c.name}`,
                  disabled: c.locked,
                  description: c.locked ? "Prazo encerrado" : undefined,
                })),
              ]}
            />
          )}
        </Field>
        {categories.length > 0 && (
          <Field label="Categoria" optional>
            {(a) => (
              <Select
                id={a.id}
                value={category}
                onValueChange={setCategory}
                options={[
                  { value: "none", label: "Sem categoria" },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            )}
          </Field>
        )}
        <div className="border-border rounded-md border p-4">
          <label className="flex items-center justify-between gap-3">
            <span className="text-base font-medium">Enviar o convite agora</span>
            <Switch checked={send} onCheckedChange={setSend} />
          </label>
          {send && (
            <div className="mt-4">
              <ChannelPicker value={channels} onChange={setChannels} />
            </div>
          )}
        </div>
        {!f.email && !f.phone && (
          <Notice tone="info">
            Sem e-mail e WhatsApp o convite fica só com o link — copie e compartilhe pela lista.
          </Notice>
        )}
      </div>
    </Sheet>
  );
}
