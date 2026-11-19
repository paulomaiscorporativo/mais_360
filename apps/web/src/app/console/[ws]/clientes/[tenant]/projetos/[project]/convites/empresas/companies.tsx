"use client";

import {
  Building2,
  Copy,
  Hourglass,
  KeyRound,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Button, EmptyState, Field, Input, Notice } from "@/components/ui";
import { Switch } from "@/components/ui/controls";
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
import {
  addCompany,
  deleteCompany,
  processExpiration,
  regenerateCompanyPassword,
  revealCompanyPassword,
  sendInvites,
  updateCompany,
} from "../actions";

export type CompanyRow = {
  id: string;
  name: string;
  contactName: string;
  contactRole: string;
  email: string;
  phone: string;
  quota: number;
  used: number;
  login: string;
  passwordChanged: boolean;
  lastLoginAt: string | null;
  locked: boolean;
  returned: number;
  responsibleId: string | null;
};

type Access = { company: string; login: string; password: string };

export function CompaniesManager(props: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  rows: CompanyRow[];
  defaultQuota: number;
  portalUrl: string;
  deadline: string | null;
  deadlinePassed: boolean;
  expiredAt: string | null;
  pool: number;
}) {
  const { rows, canEdit, tenant, projectId } = props;
  const router = useRouter();
  const [editing, setEditing] = useState<CompanyRow | "new" | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [removing, setRemoving] = useState<CompanyRow | null>(null);
  const [expiring, setExpiring] = useState(false);
  const [pending, start] = useTransition();

  const totals = rows.reduce(
    (t, r) => ({ quota: t.quota + r.quota, used: t.used + r.used }),
    { quota: 0, used: 0 },
  );

  function showAccess(row: CompanyRow, regenerate: boolean) {
    start(async () => {
      const r = regenerate
        ? await regenerateCompanyPassword({ tenant, projectId, id: row.id })
        : await revealCompanyPassword({ tenant, projectId, id: row.id });
      if (r.ok) {
        setAccess({ company: row.name, ...r.data });
        router.refresh();
      } else toast.error(r.error);
    });
  }

  if (rows.length === 0) {
    return (
      <>
        <EmptyState
          icon={<Building2 />}
          title="Cadastre as empresas convidadas"
          description="Cada empresa recebe uma cota de convites, login e senha próprios. O responsável já entra inscrito e as empresas inscrevem os convidados pelo portal."
          action={
            canEdit && (
              <Button onClick={() => setEditing("new")}>
                <Plus /> Nova empresa
              </Button>
            )
          }
        />
        <CompanySheet
          target={editing}
          onClose={() => setEditing(null)}
          defaultQuota={props.defaultQuota}
          {...{ tenant, projectId }}
          onCreated={setAccess}
        />
        <AccessDialog access={access} portalUrl={props.portalUrl} onClose={() => setAccess(null)} />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
        <div className="grid flex-1 grid-cols-3 gap-px overflow-hidden rounded-md border [&>*]:bg-surface">
          <Stat label="Empresas" value={String(rows.length)} />
          <Stat label="Convites usados" value={`${totals.used} / ${totals.quota}`} />
          <Stat
            label="Ocupação"
            value={totals.quota ? `${Math.round((totals.used / totals.quota) * 100)}%` : "—"}
          />
        </div>
        <div className="border-border bg-surface flex flex-col justify-center gap-1 rounded-md border px-4 py-3 md:w-80">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Hourglass className="size-4" /> Data-limite das cotas
          </p>
          {props.expiredAt ? (
            <p className="text-fg-subtle text-sm">
              Processada em {props.expiredAt}. {props.pool} convite(s) no pool individual.
            </p>
          ) : (
            <>
              <p className="text-fg-subtle text-sm">
                {props.deadline ?? "Não definida — configure na aba Evento."}
              </p>
              {canEdit && (
                <Button
                  size="sm"
                  variant={props.deadlinePassed ? "primary" : "secondary"}
                  className="mt-1 self-start"
                  onClick={() => setExpiring(true)}
                >
                  <Lock /> Processar expiração
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-fg-subtle text-sm">
          Portal das empresas:{" "}
          <button
            type="button"
            className="text-brand-text font-medium hover:underline"
            onClick={() => {
              void navigator.clipboard.writeText(props.portalUrl);
              toast.success("Endereço do portal copiado.");
            }}
          >
            {props.portalUrl.replace(/^https?:\/\//, "")}
          </button>
        </p>
        {canEdit && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> Empresa
          </Button>
        )}
      </div>

      <DataTable
        caption="Empresas convidadas"
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          {
            key: "name",
            header: "Empresa",
            mobile: "primary",
            cell: (r) => (
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.name}</span>
                <span className="text-fg-subtle block truncate text-sm">
                  {r.contactName || "Sem responsável"}
                  {r.contactRole ? ` · ${r.contactRole}` : ""}
                </span>
              </span>
            ),
          },
          {
            key: "quota",
            header: "Cota",
            mobile: "secondary",
            cell: (r) => <QuotaBar used={r.used} quota={r.quota} />,
          },
          {
            key: "login",
            header: "Acesso",
            mobile: "desktopOnly",
            cell: (r) => (
              <span className="text-sm">
                <span className="font-mono">{r.login}</span>
                <span className="text-fg-subtle block text-xs">
                  {r.lastLoginAt
                    ? `Último acesso ${new Date(r.lastLoginAt).toLocaleDateString("pt-BR")}`
                    : r.passwordChanged
                      ? "Senha trocada"
                      : "Ainda não acessou"}
                </span>
              </span>
            ),
          },
          {
            key: "status",
            header: "Situação",
            mobile: "meta",
            cell: (r) =>
              r.locked ? (
                <Badge size="sm" tone="neutral">
                  Encerrada{r.returned ? ` · ${r.returned} ao pool` : ""}
                </Badge>
              ) : r.used >= r.quota ? (
                <Badge size="sm" tone="success" dot>
                  Cota completa
                </Badge>
              ) : (
                <Badge size="sm" tone="info" dot>
                  Inscrevendo
                </Badge>
              ),
          },
          ...(canEdit
            ? [
                {
                  key: "actions",
                  header: <span className="sr-only">Ações</span>,
                  className: "w-12",
                  align: "right" as const,
                  mobile: "meta" as const,
                  cell: (r: CompanyRow) => (
                    <Menu>
                      <MenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${r.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </MenuTrigger>
                      <MenuContent align="end">
                        <MenuItem onSelect={() => setEditing(r)}>
                          <Pencil /> Editar e ajustar cota
                        </MenuItem>
                        {!r.passwordChanged && (
                          <MenuItem onSelect={() => showAccess(r, false)}>
                            <KeyRound /> Ver acesso (login e senha)
                          </MenuItem>
                        )}
                        <MenuItem onSelect={() => showAccess(r, true)}>
                          <KeyRound /> Gerar nova senha
                        </MenuItem>
                        {r.responsibleId && (
                          <MenuItem
                            onSelect={() =>
                              start(async () => {
                                const res = await sendInvites({
                                  tenant,
                                  projectId,
                                  ids: [r.responsibleId!],
                                  channels: ["EMAIL", "WHATSAPP"],
                                  resend: true,
                                });
                                if (res.ok) toast.success("Convite do responsável enviado.");
                                else toast.error(res.error);
                              })
                            }
                          >
                            <Send /> Enviar convite ao responsável
                          </MenuItem>
                        )}
                        <MenuSeparator />
                        <MenuItem tone="danger" onSelect={() => setRemoving(r)}>
                          <Trash2 /> Excluir empresa
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  ),
                },
              ]
            : []),
        ]}
      />

      <CompanySheet
        target={editing}
        onClose={() => setEditing(null)}
        defaultQuota={props.defaultQuota}
        {...{ tenant, projectId }}
        onCreated={setAccess}
      />
      <AccessDialog access={access} portalUrl={props.portalUrl} onClose={() => setAccess(null)} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Excluir ${removing?.name ?? "empresa"}?`}
        description="Só é possível enquanto a empresa não inscreveu convidados. O convite do responsável é removido junto."
        confirmLabel="Excluir"
        tone="danger"
        loading={pending}
        onConfirm={() =>
          start(async () => {
            if (!removing) return;
            const r = await deleteCompany({ tenant, projectId, id: removing.id });
            if (r.ok) {
              toast.success("Empresa excluída.");
              setRemoving(null);
              router.refresh();
            } else toast.error(r.error);
          })
        }
      />
      <ConfirmDialog
        open={expiring}
        onOpenChange={setExpiring}
        title="Processar a expiração das cotas?"
        description={
          props.deadlinePassed
            ? "As empresas param de inscrever e os convites não usados voltam ao pool individual da organização."
            : "A data-limite ainda não chegou. Processar agora encerra as inscrições das empresas antes do prazo."
        }
        confirmLabel={props.deadlinePassed ? "Processar" : "Antecipar e processar"}
        tone={props.deadlinePassed ? "primary" : "danger"}
        loading={pending}
        onConfirm={() =>
          start(async () => {
            const r = await processExpiration({ tenant, projectId, force: !props.deadlinePassed });
            if (r.ok) {
              toast.success(
                `${r.data.companies} empresa(s) encerrada(s); ${r.data.returned} convite(s) voltaram ao pool.`,
              );
              setExpiring(false);
              router.refresh();
            } else toast.error(r.error);
          })
        }
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-fg-subtle text-xs">{label}</p>
      <p className="tabular mt-0.5 text-xl font-semibold">{value}</p>
    </div>
  );
}

function QuotaBar({ used, quota }: { used: number; quota: number }) {
  const pct = quota ? Math.min(100, (used / quota) * 100) : 0;
  return (
    <span className="flex min-w-32 items-center gap-2">
      <span className="bg-surface-sunken h-1.5 flex-1 overflow-hidden rounded-full">
        <span
          className={`block h-full rounded-full ${pct >= 100 ? "bg-success" : "bg-brand"}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tabular text-fg-muted text-sm">
        {used}/{quota}
      </span>
    </span>
  );
}

function AccessDialog({
  access,
  portalUrl,
  onClose,
}: {
  access: Access | null;
  portalUrl: string;
  onClose: () => void;
}) {
  const text = access
    ? `Acesso ao portal de convites — ${access.company}\n${portalUrl}\nLogin: ${access.login}\nSenha provisória: ${access.password}`
    : "";
  return (
    <ConfirmDialog
      open={!!access}
      onOpenChange={(o) => !o && onClose()}
      title={`Acesso de ${access?.company ?? ""}`}
      description="Compartilhe com o responsável. A senha provisória fica visível aqui até a empresa trocá-la no primeiro acesso."
      confirmLabel="Copiar acesso"
      cancelLabel="Fechar"
      onConfirm={() => {
        void navigator.clipboard.writeText(text);
        toast.success("Acesso copiado.");
      }}
    >
      {access && (
        <dl className="bg-surface-sunken grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md p-4 text-sm">
          <dt className="text-fg-subtle">Portal</dt>
          <dd className="truncate">{portalUrl.replace(/^https?:\/\//, "")}</dd>
          <dt className="text-fg-subtle">Login</dt>
          <dd className="font-mono">{access.login}</dd>
          <dt className="text-fg-subtle">Senha</dt>
          <dd className="font-mono text-base font-semibold tracking-wide">{access.password}</dd>
        </dl>
      )}
      {access && (
        <a
          className="text-brand-text mt-3 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Copy className="size-3.5" /> Enviar pelo WhatsApp
        </a>
      )}
    </ConfirmDialog>
  );
}

function CompanySheet({
  target,
  onClose,
  defaultQuota,
  tenant,
  projectId,
  onCreated,
}: {
  target: CompanyRow | "new" | null;
  onClose: () => void;
  defaultQuota: number;
  tenant: string;
  projectId: string;
  onCreated: (a: Access) => void;
}) {
  const router = useRouter();
  const editing = target && target !== "new" ? target : null;
  const blank = {
    companyName: "",
    contactName: "",
    contactRole: "",
    email: "",
    phone: "",
    quota: String(defaultQuota),
  };
  const [f, setF] = useState(blank);
  const [sendInvite, setSendInvite] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Preenche ao abrir (sem efeito colateral em render repetido)
  const key = target === "new" ? "new" : (editing?.id ?? null);
  if (key !== loadedFor) {
    setLoadedFor(key);
    setErrors({});
    setF(
      editing
        ? {
            companyName: editing.name,
            contactName: editing.contactName,
            contactRole: editing.contactRole,
            email: editing.email,
            phone: editing.phone,
            quota: String(editing.quota),
          }
        : blank,
    );
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  function submit() {
    start(async () => {
      const data = { ...f, quota: Number(f.quota) };
      const r = editing
        ? await updateCompany({ tenant, projectId, id: editing.id, data })
        : await addCompany({ tenant, projectId, data, sendInvite });
      if (r.ok) {
        toast.success(editing ? "Empresa atualizada." : "Empresa cadastrada.");
        onClose();
        router.refresh();
        if (!editing && r.data) onCreated({ company: data.companyName, ...r.data });
      } else {
        const fe = r.fieldErrors ?? {};
        setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k.replace("data.", ""), v])));
        toast.error(r.error);
      }
    });
  }

  return (
    <Sheet
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={editing ? `Editar ${editing.name}` : "Nova empresa convidada"}
      description={
        editing
          ? `Já usou ${editing.used} convite(s); a cota não pode ficar abaixo disso.`
          : "O sistema gera o login e a senha do portal; o responsável já entra inscrito, ocupando uma vaga da cota."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={pending}>
            {editing ? "Salvar" : "Cadastrar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Empresa" error={errors.companyName}>
          {(a) => <Input {...a} value={f.companyName} onChange={set("companyName")} autoFocus />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="Responsável" optional error={errors.contactName}>
            {(a) => <Input {...a} value={f.contactName} onChange={set("contactName")} />}
          </Field>
          <Field label="Cota" error={errors.quota} hint="convites">
            {(a) => (
              <Input {...a} type="number" min={1} inputMode="numeric" value={f.quota} onChange={set("quota")} />
            )}
          </Field>
        </div>
        <Field label="Cargo do responsável" optional>
          {(a) => <Input {...a} value={f.contactRole} onChange={set("contactRole")} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-mail" optional error={errors.email}>
            {(a) => <Input {...a} type="email" value={f.email} onChange={set("email")} />}
          </Field>
          <Field label="WhatsApp" optional error={errors.phone}>
            {(a) => <Input {...a} inputMode="tel" value={f.phone} onChange={set("phone")} />}
          </Field>
        </div>
        {!editing && (
          <label className="border-border flex items-start justify-between gap-3 rounded-md border p-4">
            <span>
              <span className="block text-base font-medium">Enviar o convite ao responsável</span>
              <span className="text-fg-subtle block text-sm">
                Leva o convite digital, o endereço do portal e o login. A senha você compartilha em
                seguida.
              </span>
            </span>
            <Switch checked={sendInvite} onCheckedChange={setSendInvite} />
          </label>
        )}
        {!editing && (
          <Notice tone="info">
            Por segurança a senha não segue nas mensagens automáticas — ela aparece na próxima tela
            para você copiar.
          </Notice>
        )}
      </div>
    </Sheet>
  );
}
