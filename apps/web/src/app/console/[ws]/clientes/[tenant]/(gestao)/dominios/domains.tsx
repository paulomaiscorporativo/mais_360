"use client";

import {
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Globe,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Notice,
  Panel,
  PanelHeader,
} from "@/components/ui";
import {
  ConfirmDialog,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Sheet,
} from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { addDomain, removeDomain, setPrimaryDomain, verifyDomainNow } from "./actions";

export type DomainView = {
  id: string;
  hostname: string;
  status: "PENDING" | "VERIFIED" | "FAILED";
  primary: boolean;
  managedByPlatform: boolean;
  apex: boolean;
  lastError: string;
  lastCheckedLabel: string | null;
  verifiedLabel: string | null;
  records: { type: "CNAME" | "TXT"; name: string; value: string; purpose: string }[];
};

type Props = {
  tenant: string;
  tenantName: string;
  canEdit: boolean;
  defaultHost: string;
  defaultIsPrimary: boolean;
  target: string;
  domains: DomainView[];
};

const STATUS = {
  PENDING: { label: "Aguardando DNS", tone: "warning" },
  VERIFIED: { label: "Ativo", tone: "success" },
  FAILED: { label: "Com problema", tone: "danger" },
} as const;

export function DomainsManager(props: Props) {
  const { tenant, tenantName, canEdit, defaultHost, defaultIsPrimary, domains } = props;
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<DomainView | null>(null);
  const [pending, start] = useTransition();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /** O worker responde em segundos: atualiza a tela algumas vezes depois do pedido. */
  function refreshSoon() {
    timers.current.forEach(clearTimeout);
    timers.current = [3_000, 8_000, 15_000].map((ms) => setTimeout(() => router.refresh(), ms));
  }

  function run<T>(
    action: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    success: string,
    after?: () => void,
  ) {
    start(async () => {
      const r = await action();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(success);
      after?.();
      router.refresh();
    });
  }

  const primaryHost =
    domains.find((d) => d.primary && d.status === "VERIFIED")?.hostname ?? defaultHost;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold tracking-tight">Endereços de {tenantName}</h2>
          <p className="text-fg-muted mt-1 text-base">
            Convites, inscrições, credenciais e portais usam o endereço principal. O cliente já tem
            um endereço da plataforma e pode usar também um domínio da própria empresa, como{" "}
            <span className="font-mono text-sm">eventos.suaempresa.com.br</span>.
          </p>
        </div>
        {canEdit && domains.length > 0 && (
          <Button onClick={() => setAdding(true)} className="shrink-0">
            <Plus /> Adicionar domínio
          </Button>
        )}
      </div>

      {!canEdit && (
        <Notice tone="info" title="Somente consulta">
          Quem cadastra e altera domínios é o administrador do assinante.
        </Notice>
      )}

      <Panel>
        <PanelHeader
          title="Endereços"
          description={
            <>
              Principal agora: <span className="text-fg font-mono">{primaryHost}</span>
            </>
          }
        />
        <ul className="divide-border divide-y">
          <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="truncate font-mono text-sm font-medium">{defaultHost}</span>
                {defaultIsPrimary && <PrimaryBadge />}
                <Badge tone="neutral" size="sm">
                  Endereço padrão
                </Badge>
              </p>
              <p className="text-fg-subtle mt-1 text-sm">
                Sempre funciona, sem configurar nada. Não pode ser removido.
              </p>
            </div>
            {canEdit && !defaultIsPrimary && (
              <Button
                variant="secondary"
                size="sm"
                loading={pending}
                onClick={() =>
                  run(
                    () => setPrimaryDomain({ tenant, domainId: null }),
                    "Os links voltam a usar o endereço padrão.",
                  )
                }
              >
                <Star /> Tornar principal
              </Button>
            )}
          </li>
          {domains.map((d) => (
            <DomainRow
              key={d.id}
              domain={d}
              canEdit={canEdit}
              busy={pending}
              onVerify={() =>
                run(
                  () => verifyDomainNow({ tenant, domainId: d.id }),
                  "Verificação pedida. O resultado aparece aqui em instantes.",
                  refreshSoon,
                )
              }
              onPrimary={() =>
                run(
                  () => setPrimaryDomain({ tenant, domainId: d.id }),
                  `${d.hostname} agora é o endereço principal.`,
                )
              }
              onRemove={() => setRemoving(d)}
            />
          ))}
        </ul>
      </Panel>

      {domains.length === 0 && (
        <EmptyState
          icon={<Globe />}
          title="Use o domínio da empresa"
          description="Com um domínio próprio, os participantes veem o endereço do cliente em convites e QR codes. Leva alguns minutos de configuração no DNS."
          action={
            canEdit ? (
              <Button onClick={() => setAdding(true)}>
                <Plus /> Adicionar domínio
              </Button>
            ) : undefined
          }
        />
      )}

      <AddDomainSheet
        open={adding}
        onClose={() => setAdding(false)}
        tenant={tenant}
        onAdded={refreshSoon}
      />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remover ${removing?.hostname ?? ""}?`}
        description={
          removing?.primary && removing.status === "VERIFIED"
            ? `É o endereço principal: os links novos passam a usar ${defaultHost}, e links e QR codes já enviados com ${removing.hostname} deixam de abrir.`
            : "Links e QR codes que usam esse endereço deixam de abrir. Os registros no DNS podem ser apagados depois."
        }
        confirmLabel="Remover domínio"
        tone="danger"
        loading={pending}
        onConfirm={() => {
          const d = removing;
          if (!d) return;
          run(
            () => removeDomain({ tenant, domainId: d.id }),
            `${d.hostname} removido.`,
            () => setRemoving(null),
          );
        }}
      />
    </div>
  );
}

function PrimaryBadge() {
  return (
    <Badge tone="brand" size="sm">
      <Star className="size-3" aria-hidden /> Principal
    </Badge>
  );
}

function DomainRow({
  domain: d,
  canEdit,
  busy,
  onVerify,
  onPrimary,
  onRemove,
}: {
  domain: DomainView;
  canEdit: boolean;
  busy: boolean;
  onVerify: () => void;
  onPrimary: () => void;
  onRemove: () => void;
}) {
  const needsSetup = d.status !== "VERIFIED" && !d.managedByPlatform;
  const [open, setOpen] = useState(needsSetup);
  const s = STATUS[d.status];
  const instructionsId = `dns-${d.id}`;

  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate font-mono text-sm font-medium">{d.hostname}</span>
            {d.primary && d.status === "VERIFIED" && <PrimaryBadge />}
            <Badge tone={s.tone} dot size="sm">
              {s.label}
            </Badge>
            {d.managedByPlatform && (
              <Badge tone="neutral" size="sm">
                Endereço da plataforma
              </Badge>
            )}
          </p>
          <p className="text-fg-subtle mt-1 text-sm">
            {d.managedByPlatform
              ? "Endereço antigo mantido para links e QR codes já distribuídos."
              : d.status === "VERIFIED"
                ? `Funcionando${d.verifiedLabel ? ` desde ${d.verifiedLabel}` : ""}. Conferido todo dia.`
                : d.status === "PENDING"
                  ? "Crie os dois registros abaixo no DNS. Conferimos sozinhos a cada poucos minutos."
                  : "Os registros não foram encontrados. Corrija o DNS e verifique de novo."}
            {d.lastCheckedLabel &&
              !d.managedByPlatform &&
              ` Última consulta: ${d.lastCheckedLabel}.`}
          </p>
          {d.lastError && (
            <p className="text-warning mt-2 flex items-start gap-1.5 text-sm">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{d.lastError}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!d.managedByPlatform && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={open}
              aria-controls={instructionsId}
              onClick={() => setOpen((o) => !o)}
            >
              Instruções de DNS
              <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
            </Button>
          )}
          {canEdit && !d.managedByPlatform && (
            <Menu>
              <MenuTrigger asChild>
                <Button variant="secondary" size="icon-sm" aria-label={`Ações de ${d.hostname}`}>
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={onVerify} disabled={busy}>
                  <RefreshCw /> Verificar agora
                </MenuItem>
                {!d.primary && (
                  <MenuItem onSelect={onPrimary} disabled={busy || d.status !== "VERIFIED"}>
                    <Star /> Tornar principal
                  </MenuItem>
                )}
                <MenuItem tone="danger" onSelect={onRemove}>
                  <Trash2 /> Remover
                </MenuItem>
              </MenuContent>
            </Menu>
          )}
          {canEdit && d.managedByPlatform && !d.primary && (
            <Button variant="secondary" size="sm" onClick={onPrimary} loading={busy}>
              <Star /> Tornar principal
            </Button>
          )}
        </div>
      </div>

      {open && !d.managedByPlatform && (
        <div
          id={instructionsId}
          className="border-border bg-surface-muted mt-4 rounded-md border p-4"
        >
          <ol className="flex flex-col gap-4 text-sm">
            <li>
              <p className="font-medium">1. Abra o painel onde o domínio está registrado</p>
              <p className="text-fg-muted mt-0.5">
                Registro.br, GoDaddy, Cloudflare, HostGator, Locaweb… Procure a área “DNS” ou “Zona
                de DNS”. Se quem cuida disso é a TI ou a agência do cliente, envie estas instruções
                para ela.
              </p>
            </li>
            <li>
              <p className="font-medium">2. Crie estes dois registros</p>
              <div className="mt-2 flex flex-col gap-2">
                {d.records.map((r) => (
                  <RecordRow key={r.type} record={r} />
                ))}
              </div>
              <p className="text-fg-subtle mt-2 text-xs">
                Alguns painéis pedem só o começo do nome (por exemplo, apenas{" "}
                <span className="font-mono">{d.hostname.split(".")[0]}</span>) e completam o resto
                sozinhos. Na Cloudflare, deixe o CNAME como “somente DNS” (nuvem cinza).
              </p>
              {d.apex && (
                <Notice tone="info" className="mt-3">
                  {d.hostname} é um domínio raiz, e muitos painéis não aceitam CNAME nele. Se o seu
                  não aceitar, use um registro ALIAS/ANAME com o mesmo valor ou, mais simples,
                  cadastre um subdomínio como eventos.{d.hostname}.
                </Notice>
              )}
            </li>
            <li>
              <p className="font-medium">3. Aguarde a verificação</p>
              <p className="text-fg-muted mt-0.5">
                Conferimos sozinhos a cada poucos minutos, por até 7 dias. Mudanças no DNS costumam
                aparecer em minutos, mas podem levar algumas horas. Quando der certo, o domínio fica
                “Ativo” e o certificado de segurança (https) é emitido automaticamente.
              </p>
              {canEdit && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={onVerify}
                  loading={busy}
                >
                  <RefreshCw /> Verificar agora
                </Button>
              )}
            </li>
          </ol>
        </div>
      )}
    </li>
  );
}

function RecordRow({ record }: { record: DomainView["records"][number] }) {
  return (
    <div className="border-border bg-surface grid gap-2 rounded-sm border p-3 sm:grid-cols-[72px_minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center">
      <div>
        <span className="text-fg-subtle block text-xs sm:hidden">Tipo</span>
        <Badge tone="neutral" size="sm" className="font-mono">
          {record.type}
        </Badge>
      </div>
      <CopyValue label="Nome" value={record.name} />
      <CopyValue label="Valor" value={record.value} />
      <p className="text-fg-subtle text-xs sm:col-span-3">{record.purpose}</p>
    </div>
  );
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="min-w-0">
      <span className="text-fg-subtle block text-xs">{label}</span>
      <div className="flex items-center gap-1">
        <code className="min-w-0 flex-1 truncate font-mono text-sm" title={value}>
          {value}
        </code>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Copiar ${label.toLowerCase()}: ${value}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setDone(true);
              toast.success(`${label} copiado.`);
              setTimeout(() => setDone(false), 1600);
            } catch {
              toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
            }
          }}
        >
          {done ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

function AddDomainSheet({
  open,
  onClose,
  tenant,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  tenant: string;
  onAdded: () => void;
}) {
  const router = useRouter();
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const r = await addDomain({ tenant, hostname });
      if (!r.ok) {
        setError(r.fieldErrors?.hostname ?? r.error);
        return;
      }
      toast.success(`${r.data.hostname} cadastrado. Agora crie os registros no DNS.`);
      setHostname("");
      onClose();
      router.refresh();
      onAdded();
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Adicionar domínio"
      description="Um endereço da empresa do cliente para convites, inscrições e portais."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={pending}>
            Adicionar
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field
          label="Domínio"
          error={error}
          hint="Recomendamos um subdomínio, como eventos.suaempresa.com.br. Sem https:// nem barras."
        >
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="eventos.suaempresa.com.br"
              className="font-mono"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="url"
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              autoFocus
            />
          )}
        </Field>
        <p className="text-fg-muted text-sm">
          Depois de adicionar, mostramos os dois registros que precisam ser criados no DNS do
          domínio. Até a verificação terminar, os links continuam usando o endereço atual.
        </p>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
