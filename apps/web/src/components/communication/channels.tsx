"use client";

import {
  CircleAlert,
  Globe,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plug,
  PlugZap,
  Plus,
  QrCode,
  RefreshCw,
  Server,
  Smartphone,
  Trash2,
  Webhook,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Badge, Button, Field, Input, Notice, Panel, PanelHeader, Spinner } from "@/components/ui";
import { Select, Switch } from "@/components/ui/controls";
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
  deleteChannel,
  saveEmailChannel,
  saveWhatsappChannel,
  setChannelActive,
  testEmailConnection,
  whatsappConnect,
  whatsappDisconnect,
  whatsappStatus,
  type WhatsappLiveState,
} from "@/app/console/[ws]/clientes/[tenant]/comunicacao/actions";
import { ChoiceCards } from "./choice";
import { cn } from "@/lib/cn";

export type ChannelRow = {
  id: string;
  kind: "EMAIL" | "WHATSAPP";
  name: string;
  projectId: string | null;
  active: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  mode: "own" | "global";
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  hasSmtpPass: boolean;
  provider: "EVOLUTION" | "META_CLOUD" | "WEBHOOK" | null;
  waNumber: string;
  instance: string;
  evolutionMode: "own" | "global";
  evolutionUrl: string;
  hasEvolutionKey: boolean;
  metaPhoneNumberId: string;
  hasMetaToken: boolean;
  webhookUrl: string;
  hasWebhookToken: boolean;
};

type Project = { id: string; name: string };
type Globals = {
  email: { host: string; from: string } | null;
  evolution: { url: string; instance: string } | null;
};

const PROVIDER_LABEL = {
  EVOLUTION: "WhatsApp pareado por QR",
  META_CLOUD: "API oficial (Meta)",
  WEBHOOK: "Webhook (Z-API e similares)",
} as const;

const STATE_UI: Record<
  WhatsappLiveState["state"],
  { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }
> = {
  open: { label: "Conectado", tone: "success" },
  connecting: { label: "Aguardando leitura do QR", tone: "info" },
  closed: { label: "Desconectado", tone: "warning" },
  not_found: { label: "Não pareado", tone: "warning" },
  unavailable: { label: "Servidor inacessível", tone: "danger" },
  not_applicable: { label: "Configurado", tone: "neutral" },
};

export function ChannelsManager({
  tenant,
  channels,
  projects,
  globals,
  canEdit,
}: {
  tenant: string;
  channels: ChannelRow[];
  projects: Project[];
  globals: Globals;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<{
    kind: "EMAIL" | "WHATSAPP";
    row: ChannelRow | null;
  } | null>(null);
  const [removing, setRemoving] = useState<ChannelRow | null>(null);
  const [pairing, setPairing] = useState<ChannelRow | null>(null);
  const [pending, start] = useTransition();
  const projectName = (id: string | null) =>
    id ? (projects.find((p) => p.id === id)?.name ?? "Projeto") : "Todo o cliente";

  const emails = channels.filter((c) => c.kind === "EMAIL");
  const whats = channels.filter((c) => c.kind === "WHATSAPP");

  const toggle = (c: ChannelRow, active: boolean) =>
    start(async () => {
      const r = await setChannelActive({ tenant, id: c.id, active });
      if (r.ok) {
        toast.success(active ? `${c.name} voltou a enviar.` : `${c.name} foi pausado.`);
        router.refresh();
      } else toast.error(r.error);
    });

  const remove = () =>
    start(async () => {
      if (!removing) return;
      const r = await deleteChannel({ tenant, id: removing.id });
      if (r.ok) {
        toast.success(`${removing.name} foi removido.`);
        setRemoving(null);
        router.refresh();
      } else toast.error(r.error);
    });

  const menu = (c: ChannelRow) =>
    canEdit && (
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${c.name}`}>
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => setEditing({ kind: c.kind, row: c })}>
            <Pencil /> Editar
          </MenuItem>
          {c.kind === "WHATSAPP" && c.provider === "EVOLUTION" && (
            <MenuItem onSelect={() => setPairing(c)}>
              <QrCode /> Parear número
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem tone="danger" onSelect={() => setRemoving(c)}>
            <Trash2 /> Remover
          </MenuItem>
        </MenuContent>
      </Menu>
    );

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel>
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              <Mail className="text-fg-subtle size-4" /> E-mail
            </span>
          }
          description="Remetente, endereço de resposta e servidor de envio."
          actions={
            canEdit && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEditing({ kind: "EMAIL", row: null })}
              >
                <Plus /> Adicionar
              </Button>
            )
          }
        />
        <ul className="divide-border divide-y">
          {emails.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
              <span className="bg-surface-sunken text-fg-subtle grid size-9 shrink-0 place-items-center rounded-md [&_svg]:size-4">
                {c.mode === "own" ? <Server /> : <Globe />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{c.name}</span>
                  <Badge size="sm">{projectName(c.projectId)}</Badge>
                  {!c.active && (
                    <Badge size="sm" tone="warning">
                      Pausado
                    </Badge>
                  )}
                </div>
                <p className="text-fg-subtle mt-0.5 truncate text-sm">
                  {c.fromName || "Sem nome de remetente"}
                  {c.fromEmail && ` · ${c.fromEmail}`}
                  {" · "}
                  {c.mode === "own" ? c.smtpHost : "servidor da plataforma"}
                </p>
              </div>
              {canEdit && (
                <Switch
                  checked={c.active}
                  disabled={pending}
                  onCheckedChange={(v) => toggle(c, v)}
                  aria-label={`Envio por ${c.name}`}
                />
              )}
              {menu(c)}
            </li>
          ))}
          {emails.length === 0 && (
            <li className="px-5 py-5">
              {globals.email ? (
                <div className="flex items-start gap-3">
                  <Globe className="text-success mt-0.5 size-4 shrink-0" />
                  <p className="text-fg-muted text-sm">
                    Os e-mails já saem pelo servidor da plataforma, como{" "}
                    <span className="text-fg font-medium">{globals.email.from}</span>. Adicione um
                    canal para usar o nome do cliente como remetente, receber as respostas na caixa
                    dele ou usar um servidor próprio.
                  </p>
                </div>
              ) : (
                <Notice tone="warning" icon={<CircleAlert />} title="Nenhum servidor de e-mail">
                  Configure um servidor SMTP próprio para enviar convites e lembretes.
                </Notice>
              )}
            </li>
          )}
        </ul>
      </Panel>

      <Panel>
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              <MessageCircle className="text-fg-subtle size-4" /> WhatsApp
            </span>
          }
          description="Número que envia as mensagens, com ritmo que protege contra bloqueio."
          actions={
            canEdit && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEditing({ kind: "WHATSAPP", row: null })}
              >
                <Plus /> Adicionar
              </Button>
            )
          }
        />
        <ul className="divide-border divide-y">
          {whats.map((c) => (
            <WhatsappRow
              key={c.id}
              tenant={tenant}
              channel={c}
              scope={projectName(c.projectId)}
              canEdit={canEdit}
              onPair={() => setPairing(c)}
              menu={menu(c)}
              toggle={
                canEdit && (
                  <Switch
                    checked={c.active}
                    disabled={pending}
                    onCheckedChange={(v) => toggle(c, v)}
                    aria-label={`Envio por ${c.name}`}
                  />
                )
              }
            />
          ))}
          {whats.length === 0 && (
            <li className="px-5 py-5">
              <div className="flex items-start gap-3">
                <Smartphone className="text-fg-subtle mt-0.5 size-4 shrink-0" />
                <p className="text-fg-muted text-sm">
                  {globals.evolution?.instance
                    ? "As mensagens saem pelo número padrão da plataforma. Conecte o WhatsApp do próprio cliente para que os convidados reconheçam o remetente."
                    : "Conecte um número para enviar convites, lembretes e crachás digitais por WhatsApp."}
                </p>
              </div>
            </li>
          )}
        </ul>
      </Panel>

      {editing?.kind === "EMAIL" && (
        <EmailSheet
          tenant={tenant}
          row={editing.row}
          projects={projects}
          globals={globals}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {editing?.kind === "WHATSAPP" && (
        <WhatsappSheet
          tenant={tenant}
          row={editing.row}
          projects={projects}
          globals={globals}
          onClose={() => setEditing(null)}
          onSaved={(id, provider) => {
            setEditing(null);
            router.refresh();
            if (provider === "EVOLUTION") {
              const row = channels.find((c) => c.id === id);
              setPairing(row ?? ({ id, name: "WhatsApp", provider: "EVOLUTION" } as ChannelRow));
            }
          }}
        />
      )}
      {pairing && (
        <PairingSheet
          tenant={tenant}
          channel={pairing}
          onClose={() => {
            setPairing(null);
            router.refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remover ${removing?.name ?? "canal"}?`}
        description="Os próximos envios passam a usar o canal padrão do cliente (ou o da plataforma). O histórico de envios é mantido."
        confirmLabel="Remover canal"
        tone="danger"
        loading={pending}
        onConfirm={remove}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Linha de WhatsApp com estado ao vivo
// ---------------------------------------------------------------------------

function WhatsappRow({
  tenant,
  channel,
  scope,
  canEdit,
  onPair,
  menu,
  toggle,
}: {
  tenant: string;
  channel: ChannelRow;
  scope: string;
  canEdit: boolean;
  onPair: () => void;
  menu: React.ReactNode;
  toggle: React.ReactNode;
}) {
  const [state, setState] = useState<WhatsappLiveState | null>(null);
  const [checking, setChecking] = useState(false);
  const toState = (r: Awaited<ReturnType<typeof whatsappStatus>>): WhatsappLiveState =>
    r.ok ? r.data : { state: "unavailable", qr: null, message: r.error };
  // Verificação inicial: o estado só muda quando a resposta chega
  useEffect(() => {
    let alive = true;
    void whatsappStatus({ tenant, id: channel.id }).then((r) => alive && setState(toState(r)));
    return () => {
      alive = false;
    };
  }, [tenant, channel.id]);
  const check = async () => {
    setChecking(true);
    setState(toState(await whatsappStatus({ tenant, id: channel.id })));
    setChecking(false);
  };
  const ui = state ? STATE_UI[state.state] : null;
  const evolution = channel.provider === "EVOLUTION";

  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <span className="bg-surface-sunken text-fg-subtle grid size-9 shrink-0 place-items-center rounded-md [&_svg]:size-4">
        {evolution ? <QrCode /> : channel.provider === "META_CLOUD" ? <PlugZap /> : <Webhook />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{channel.name}</span>
          <Badge size="sm">{scope}</Badge>
          {!state ? (
            <span className="text-fg-subtle inline-flex items-center gap-1.5 text-xs">
              <Spinner className="size-3" /> verificando
            </span>
          ) : (
            ui && (
              <Badge size="sm" tone={ui.tone} dot>
                {ui.label}
              </Badge>
            )
          )}
          {!channel.active && (
            <Badge size="sm" tone="warning">
              Pausado
            </Badge>
          )}
        </div>
        <p className="text-fg-subtle mt-0.5 truncate text-sm">
          {channel.provider ? PROVIDER_LABEL[channel.provider] : "—"}
          {channel.waNumber && ` · ${channel.waNumber}`}
          {evolution && channel.instance && ` · instância ${channel.instance}`}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Verificar conexão"
        onClick={check}
        disabled={checking}
      >
        <RefreshCw className={cn(checking && "animate-spin")} />
      </Button>
      {canEdit && evolution && state && state.state !== "open" && state.state !== "unavailable" && (
        <Button size="sm" onClick={onPair}>
          <Plug /> Conectar
        </Button>
      )}
      {toggle}
      {menu}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Pareamento por QR (Evolution)
// ---------------------------------------------------------------------------

function PairingSheet({
  tenant,
  channel,
  onClose,
}: {
  tenant: string;
  channel: ChannelRow;
  onClose: () => void;
}) {
  const [state, setState] = useState<WhatsappLiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pareamento: cria a instância e acompanha o QR até conectar
  useEffect(() => {
    let alive = true;
    const poll = async (first: boolean) => {
      const r = first
        ? await whatsappConnect({ tenant, id: channel.id })
        : await whatsappStatus({ tenant, id: channel.id });
      if (!alive) return;
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Mantém o último QR enquanto o servidor não devolve um novo
      setState((prev) => ({
        ...r.data,
        qr: r.data.qr ?? (r.data.state === "open" ? null : (prev?.qr ?? null)),
      }));
      if (r.data.state === "open") {
        toast.success(`${channel.name} conectado. Já pode enviar.`);
        return;
      }
      if (r.data.state === "unavailable") {
        setError(r.data.message ?? "Servidor de WhatsApp inacessível.");
        return;
      }
      timer.current = setTimeout(
        () => void poll(r.data.state !== "connecting" || !r.data.qr),
        3000,
      );
    };
    void poll(true);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [tenant, channel.id, channel.name]);

  const disconnect = () =>
    start(async () => {
      const r = await whatsappDisconnect({ tenant, id: channel.id });
      if (r.ok) {
        toast.success("Número desconectado.");
        onClose();
      } else toast.error(r.error);
    });

  const open = state?.state === "open";

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={open ? "WhatsApp conectado" : "Conectar o WhatsApp"}
      description={channel.name}
      footer={
        open ? (
          <>
            <Button variant="danger-ghost" onClick={disconnect} loading={pending}>
              Desconectar número
            </Button>
            <Button onClick={onClose}>Concluir</Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        )
      }
    >
      {error ? (
        <Notice
          tone="danger"
          icon={<CircleAlert />}
          title="Não foi possível falar com o servidor de WhatsApp"
        >
          {error}
        </Notice>
      ) : open ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="bg-success-bg text-success grid size-14 place-items-center rounded-full">
            <MessageCircle className="size-6" />
          </span>
          <p className="text-md font-semibold">Pronto para enviar</p>
          <p className="text-fg-muted max-w-xs text-sm">
            Mantenha o celular com internet. Os envios respeitam o ritmo configurado em cada
            campanha.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="border-border mx-auto grid aspect-square w-full max-w-[280px] place-items-center rounded-lg border bg-white p-3 shadow-sm">
            {state?.qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.qr} alt="QR code para parear o WhatsApp" className="size-full" />
            ) : (
              <span className="text-fg-subtle flex flex-col items-center gap-2 text-sm">
                <Spinner /> Gerando QR code…
              </span>
            )}
          </div>
          <ol className="text-fg-muted flex flex-col gap-3 text-sm">
            {[
              "Abra o WhatsApp no celular que vai enviar as mensagens.",
              "Toque em Mais opções (⋮) ou Configurações e escolha Dispositivos conectados.",
              "Toque em Conectar um dispositivo e aponte a câmera para este código.",
            ].map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="tabular border-border-strong text-2xs grid size-5 shrink-0 place-items-center rounded-full border font-semibold">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
          <p className="text-fg-subtle text-xs">
            O código se renova sozinho a cada poucos segundos. Esta janela detecta a conexão
            automaticamente.
          </p>
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Formulários
// ---------------------------------------------------------------------------

function ScopeSelect({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field
      label="Vale para"
      hint="Um evento pode ter remetente ou número próprios; o resto do cliente usa o padrão."
    >
      {({ id, describedBy }) => (
        <Select
          id={id}
          aria-describedby={describedBy}
          value={value}
          onValueChange={onChange}
          options={[
            { value: "all", label: "Todo o cliente" },
            ...projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      )}
    </Field>
  );
}

function EmailSheet({
  tenant,
  row,
  projects,
  globals,
  onClose,
  onSaved,
}: {
  tenant: string;
  row: ChannelRow | null;
  projects: Project[];
  globals: Globals;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: row?.name ?? "E-mail do cliente",
    projectId: row?.projectId ?? "all",
    fromName: row?.fromName ?? "",
    fromEmail: row?.fromEmail ?? "",
    replyTo: row?.replyTo ?? "",
    mode: (row?.mode ?? (globals.email ? "global" : "own")) as "global" | "own",
    smtpHost: row?.smtpHost ?? "",
    smtpPort: String(row?.smtpPort ?? 587),
    smtpSecure: row?.smtpSecure ?? false,
    smtpUser: row?.smtpUser ?? "",
    smtpPass: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const payload = () => ({
    tenant,
    id: row?.id ?? null,
    projectId: f.projectId === "all" ? null : f.projectId,
    name: f.name,
    fromName: f.fromName,
    fromEmail: f.fromEmail,
    replyTo: f.replyTo,
    mode: f.mode,
    smtpHost: f.smtpHost,
    smtpPort: Number(f.smtpPort) || 587,
    smtpSecure: f.smtpSecure,
    smtpUser: f.smtpUser,
    smtpPass: f.smtpPass,
  });

  const save = () =>
    startSave(async () => {
      const r = await saveEmailChannel(payload());
      if (r.ok) {
        toast.success("Canal de e-mail salvo.");
        onSaved();
      } else {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
      }
    });

  const test = () =>
    startTest(async () => {
      const r = await testEmailConnection(payload());
      if (r.ok) toast.success(`Conexão com ${r.data.host} funcionando.`);
      else toast.error(r.error);
    });

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={row ? "Editar canal de e-mail" : "Novo canal de e-mail"}
      description="Quem aparece como remetente e por onde os e-mails saem."
      footer={
        <>
          <Button variant="secondary" onClick={test} loading={testing}>
            Testar conexão
          </Button>
          <Button onClick={save} loading={saving}>
            Salvar canal
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Nome do canal" error={errors.name}>
          {({ id, invalid }) => (
            <Input
              id={id}
              aria-invalid={invalid}
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
            />
          )}
        </Field>
        <ScopeSelect
          projects={projects}
          value={f.projectId}
          onChange={(v) => set("projectId", v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do remetente" hint='Ex.: "ABIEC Eventos"' error={errors.fromName}>
            {({ id }) => (
              <Input id={id} value={f.fromName} onChange={(e) => set("fromName", e.target.value)} />
            )}
          </Field>
          <Field
            label="E-mail do remetente"
            optional={f.mode === "global"}
            error={errors.fromEmail}
          >
            {({ id, invalid }) => (
              <Input
                id={id}
                type="email"
                aria-invalid={invalid}
                value={f.fromEmail}
                placeholder={f.mode === "global" ? "Usa o da plataforma" : "eventos@cliente.com.br"}
                onChange={(e) => set("fromEmail", e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field
          label="Respostas vão para"
          optional
          hint="Quando o convidado responde o e-mail, a mensagem cai nesta caixa."
          error={errors.replyTo}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="email"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={f.replyTo}
              onChange={(e) => set("replyTo", e.target.value)}
            />
          )}
        </Field>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Servidor de envio</p>
          <ChoiceCards
            label="Servidor de envio"
            columns={2}
            value={f.mode}
            onChange={(v) => set("mode", v)}
            options={[
              {
                value: "global",
                icon: <Globe />,
                title: "Servidor da plataforma",
                description: globals.email
                  ? "Entregabilidade cuidada por nós. Recomendado."
                  : "Indisponível: a plataforma não tem servidor configurado.",
                disabled: !globals.email,
              },
              {
                value: "own",
                icon: <Server />,
                title: "Servidor próprio (SMTP)",
                description: "Google Workspace, Microsoft 365, Hostinger…",
              },
            ]}
          />
        </div>

        {f.mode === "own" && (
          <div className="border-border bg-surface-muted flex flex-col gap-4 rounded-md border p-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_110px]">
              <Field label="Servidor SMTP" error={errors.smtpHost}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    aria-invalid={invalid}
                    value={f.smtpHost}
                    placeholder="smtp.hostinger.com"
                    onChange={(e) => set("smtpHost", e.target.value)}
                  />
                )}
              </Field>
              <Field label="Porta" error={errors.smtpPort}>
                {({ id }) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    value={f.smtpPort}
                    onChange={(e) => {
                      set("smtpPort", e.target.value.replace(/\D/g, ""));
                      if (e.target.value === "465") set("smtpSecure", true);
                    }}
                  />
                )}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Usuário">
                {({ id }) => (
                  <Input
                    id={id}
                    autoComplete="off"
                    value={f.smtpUser}
                    onChange={(e) => set("smtpUser", e.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Senha"
                hint={row?.hasSmtpPass ? "Em branco mantém a senha gravada." : "Guardada cifrada."}
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="password"
                    autoComplete="new-password"
                    aria-describedby={describedBy}
                    placeholder={row?.hasSmtpPass ? "••••••••" : ""}
                    value={f.smtpPass}
                    onChange={(e) => set("smtpPass", e.target.value)}
                  />
                )}
              </Field>
            </div>
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                <span className="font-medium">Conexão segura (SSL/TLS)</span>
                <span className="text-fg-subtle block text-xs">Ligue para a porta 465.</span>
              </span>
              <Switch checked={f.smtpSecure} onCheckedChange={(v) => set("smtpSecure", v)} />
            </label>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function WhatsappSheet({
  tenant,
  row,
  projects,
  globals,
  onClose,
  onSaved,
}: {
  tenant: string;
  row: ChannelRow | null;
  projects: Project[];
  globals: Globals;
  onClose: () => void;
  onSaved: (id: string, provider: "EVOLUTION" | "META_CLOUD" | "WEBHOOK") => void;
}) {
  const [f, setF] = useState({
    name: row?.name ?? "WhatsApp do cliente",
    projectId: row?.projectId ?? "all",
    provider: (row?.provider ?? "EVOLUTION") as "EVOLUTION" | "META_CLOUD" | "WEBHOOK",
    waNumber: row?.waNumber ?? "",
    instance: row?.instance ?? "",
    evolutionMode: (row?.evolutionMode ?? (globals.evolution ? "global" : "own")) as
      "global" | "own",
    evolutionUrl: row?.evolutionUrl ?? "",
    evolutionApiKey: "",
    metaToken: "",
    metaPhoneNumberId: row?.metaPhoneNumberId ?? "",
    webhookUrl: row?.webhookUrl ?? "",
    webhookToken: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, start] = useTransition();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = () =>
    start(async () => {
      const r = await saveWhatsappChannel({
        tenant,
        id: row?.id ?? null,
        ...f,
        projectId: f.projectId === "all" ? null : f.projectId,
      });
      if (r.ok) {
        toast.success("Canal de WhatsApp salvo.");
        onSaved(r.data.id, f.provider);
      } else {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
      }
    });

  const keep = (has: boolean) => (has ? "Em branco mantém o valor gravado." : "Guardado cifrado.");

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={row ? "Editar WhatsApp" : "Conectar WhatsApp"}
      description="O número que envia convites, lembretes e crachás digitais."
      footer={
        <Button onClick={save} loading={saving}>
          {f.provider === "EVOLUTION" && !row ? "Salvar e parear" : "Salvar canal"}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do canal" error={errors.name}>
            {({ id, invalid }) => (
              <Input
                id={id}
                aria-invalid={invalid}
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
              />
            )}
          </Field>
          <Field label="Número" optional hint="Só para identificação na tela.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                inputMode="tel"
                aria-describedby={describedBy}
                placeholder="(11) 99999-8888"
                value={f.waNumber}
                onChange={(e) => set("waNumber", e.target.value)}
              />
            )}
          </Field>
        </div>
        <ScopeSelect
          projects={projects}
          value={f.projectId}
          onChange={(v) => set("projectId", v)}
        />

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Como o número se conecta</p>
          <ChoiceCards
            label="Provedor de WhatsApp"
            columns={1}
            value={f.provider}
            onChange={(v) => set("provider", v)}
            options={[
              {
                value: "EVOLUTION",
                icon: <QrCode />,
                title: "WhatsApp pareado por QR code",
                description:
                  "O WhatsApp comum do organizador, conectado como dispositivo. Rápido de ligar; o ritmo de envio protege o número.",
                badge: (
                  <Badge size="sm" tone="brand">
                    Mais usado
                  </Badge>
                ),
              },
              {
                value: "META_CLOUD",
                icon: <PlugZap />,
                title: "API oficial do WhatsApp (Meta)",
                description:
                  "Número verificado pela Meta. Ideal para grandes volumes; mensagens fora da janela de 24 h exigem modelos aprovados.",
              },
              {
                value: "WEBHOOK",
                icon: <Webhook />,
                title: "Outro provedor (webhook)",
                description:
                  "Z-API e similares: a plataforma chama a URL do provedor para cada mensagem.",
              },
            ]}
          />
        </div>

        {f.provider === "EVOLUTION" && (
          <div className="border-border bg-surface-muted flex flex-col gap-4 rounded-md border p-4">
            <ChoiceCards
              label="Servidor Evolution"
              columns={2}
              value={f.evolutionMode}
              onChange={(v) => set("evolutionMode", v)}
              options={[
                {
                  value: "global",
                  title: "Servidor da plataforma",
                  description: globals.evolution
                    ? "Nada a configurar."
                    : "Indisponível no momento.",
                  disabled: !globals.evolution,
                },
                {
                  value: "own",
                  title: "Servidor próprio",
                  description: "Informe endereço e chave.",
                },
              ]}
            />
            {f.evolutionMode === "own" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Endereço do servidor" error={errors.evolutionUrl}>
                  {({ id }) => (
                    <Input
                      id={id}
                      placeholder="https://evolution.seudominio.com.br"
                      value={f.evolutionUrl}
                      onChange={(e) => set("evolutionUrl", e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Chave de API" hint={keep(!!row?.hasEvolutionKey)}>
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      type="password"
                      autoComplete="new-password"
                      aria-describedby={describedBy}
                      placeholder={row?.hasEvolutionKey ? "••••••••" : ""}
                      value={f.evolutionApiKey}
                      onChange={(e) => set("evolutionApiKey", e.target.value)}
                    />
                  )}
                </Field>
              </div>
            )}
            <Field
              label="Nome da instância"
              optional
              hint="Em branco, criamos um nome a partir do cliente."
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  className="font-mono"
                  value={f.instance}
                  onChange={(e) => set("instance", e.target.value.replace(/[^A-Za-z0-9_-]/g, ""))}
                />
              )}
            </Field>
          </div>
        )}

        {f.provider === "META_CLOUD" && (
          <div className="border-border bg-surface-muted grid gap-4 rounded-md border p-4 sm:grid-cols-2">
            <Field label="ID do número (Phone Number ID)">
              {({ id }) => (
                <Input
                  id={id}
                  className="font-mono"
                  value={f.metaPhoneNumberId}
                  onChange={(e) => set("metaPhoneNumberId", e.target.value)}
                />
              )}
            </Field>
            <Field label="Token de acesso" hint={keep(!!row?.hasMetaToken)}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  aria-describedby={describedBy}
                  placeholder={row?.hasMetaToken ? "••••••••" : ""}
                  value={f.metaToken}
                  onChange={(e) => set("metaToken", e.target.value)}
                />
              )}
            </Field>
          </div>
        )}

        {f.provider === "WEBHOOK" && (
          <div className="border-border bg-surface-muted grid gap-4 rounded-md border p-4 sm:grid-cols-2">
            <Field label="URL de envio" error={errors.webhookUrl}>
              {({ id }) => (
                <Input
                  id={id}
                  placeholder="https://api.provedor.com/send"
                  value={f.webhookUrl}
                  onChange={(e) => set("webhookUrl", e.target.value)}
                />
              )}
            </Field>
            <Field label="Token" optional hint={keep(!!row?.hasWebhookToken)}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  aria-describedby={describedBy}
                  placeholder={row?.hasWebhookToken ? "••••••••" : ""}
                  value={f.webhookToken}
                  onChange={(e) => set("webhookToken", e.target.value)}
                />
              )}
            </Field>
          </div>
        )}
      </div>
    </Sheet>
  );
}
