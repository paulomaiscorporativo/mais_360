"use client";

import { Check, Copy, MoreHorizontal, Trash2, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar, Badge, Button, EmptyState, Field, Input, Notice } from "@/components/ui";
import { Select } from "@/components/ui/controls";
import {
  ConfirmDialog,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Sheet,
} from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { addMember, removeMember, updateMemberRole } from "@/app/console/[ws]/actions";

const ROLES = [
  {
    value: "ADMIN",
    label: "Administrador",
    description: "Tudo do cliente, inclusive equipe e identidade.",
  },
  { value: "MANAGER", label: "Gestor", description: "Cria e opera projetos." },
  { value: "OPERATOR", label: "Operador", description: "Opera os projetos atribuídos." },
  { value: "APPROVER", label: "Aprovador", description: "Aprova solicitações de viagem." },
  { value: "DESK", label: "Balcão", description: "Credenciamento e impressão no evento." },
  {
    value: "SCANNER",
    label: "Leitor de acesso",
    description: "Registra entradas e saídas por área.",
  },
  { value: "SALES", label: "Vendas", description: "Reserva stands e cotas." },
  { value: "VIEWER", label: "Visualizador", description: "Somente leitura." },
] as const;

type Role = (typeof ROLES)[number]["value"];

const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

type Member = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  pending: boolean;
  lastLoginAt: string | null;
};

const since = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
function lastSeen(iso: string | null) {
  if (!iso) return "Nunca acessou";
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return days === 0 ? "Acessou hoje" : `Acessou ${since.format(days, "day")}`;
}

export function TeamManager({
  tenant,
  members,
  canEdit,
  currentUserId,
}: {
  tenant: string;
  members: Member[];
  canEdit: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [pending, start] = useTransition();

  const changeRole = (m: Member, role: Role) =>
    start(async () => {
      const r = await updateMemberRole({ tenant, membershipId: m.id, role });
      if (r.ok) {
        toast.success(`${m.name} agora é ${roleLabel(role)}.`);
        router.refresh();
      } else toast.error(r.error);
    });

  const confirmRemove = () =>
    start(async () => {
      if (!removing) return;
      const r = await removeMember({ tenant, membershipId: removing.id });
      if (r.ok) {
        toast.success(`${removing.name} não tem mais acesso a este cliente.`);
        setRemoving(null);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-fg-muted text-base">Quem opera este cliente e com qual papel.</p>
        {canEdit && members.length > 0 && (
          <Button onClick={() => setOpen(true)}>
            <UserPlus /> Adicionar pessoa
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Monte a equipe do cliente"
          description="Adicione quem vai operar: administradores, gestores, balcão de credenciamento e leitores de acesso."
          action={
            canEdit && (
              <Button onClick={() => setOpen(true)}>
                <UserPlus /> Adicionar pessoa
              </Button>
            )
          }
        />
      ) : (
        <ul className="divide-border border-border bg-surface divide-y overflow-hidden rounded-md border shadow-sm">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar name={m.name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{m.name}</span>
                  {m.userId === currentUserId && <Badge size="sm">Você</Badge>}
                  {m.pending && (
                    <Badge size="sm" tone="warning">
                      Aguardando 1º acesso
                    </Badge>
                  )}
                </div>
                <div className="text-fg-subtle mt-0.5 flex flex-wrap gap-x-3 text-sm">
                  <span className="truncate">{m.email}</span>
                  <span className="hidden sm:inline">{lastSeen(m.lastLoginAt)}</span>
                </div>
              </div>
              <Badge tone="brand" className="hidden sm:inline-flex">
                {roleLabel(m.role)}
              </Badge>
              {canEdit && (
                <Menu>
                  <MenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Ações para ${m.name}`}
                      disabled={pending}
                    >
                      <MoreHorizontal />
                    </Button>
                  </MenuTrigger>
                  <MenuContent className="w-64">
                    <MenuLabel>Papel</MenuLabel>
                    {ROLES.map((r) => (
                      <MenuItem
                        key={r.value}
                        onSelect={() => r.value !== m.role && changeRole(m, r.value)}
                      >
                        <span className="flex-1">{r.label}</span>
                        {m.role === r.value && <Check className="!text-brand-text" />}
                      </MenuItem>
                    ))}
                    {m.userId !== currentUserId && (
                      <>
                        <MenuSeparator />
                        <MenuItem tone="danger" onSelect={() => setRemoving(m)}>
                          <Trash2 /> Remover acesso
                        </MenuItem>
                      </>
                    )}
                  </MenuContent>
                </Menu>
              )}
            </li>
          ))}
        </ul>
      )}

      <AddMemberSheet
        tenant={tenant}
        open={open}
        onOpenChange={setOpen}
        onDone={() => router.refresh()}
      />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remover ${removing?.name ?? ""}?`}
        description="A pessoa perde o acesso a este cliente imediatamente. A conta e o histórico são preservados."
        confirmLabel="Remover acesso"
        tone="danger"
        loading={pending}
        onConfirm={confirmRemove}
      />
    </>
  );
}

function AddMemberSheet({
  tenant,
  open,
  onOpenChange,
  onDone,
}: {
  tenant: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("OPERATOR");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ email: string; tempPassword: string | null } | null>(null);
  const [pending, start] = useTransition();

  const reset = () => {
    setName("");
    setEmail("");
    setRole("OPERATOR");
    setErrors({});
    setResult(null);
  };

  function submit() {
    start(async () => {
      const r = await addMember({ tenant, name, email, role });
      if (r.ok) {
        setResult(r.data);
        onDone();
      } else {
        setErrors(r.fieldErrors ?? {});
        if (!r.fieldErrors) toast.error(r.error);
      }
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTimeout(reset, 250);
      }}
      title={result ? "Pessoa adicionada" : "Adicionar pessoa"}
      description={
        result ? undefined : "Se a pessoa ainda não tem conta, criamos uma com senha provisória."
      }
      footer={
        result ? (
          <Button onClick={() => onOpenChange(false)}>Concluir</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} loading={pending}>
              Adicionar
            </Button>
          </>
        )
      }
    >
      {result ? (
        result.tempPassword ? (
          <div className="flex flex-col gap-4">
            <p className="text-fg-muted text-base">
              Envie a senha provisória para{" "}
              <span className="text-fg font-medium">{result.email}</span>. Ela aparece só agora e
              será trocada no primeiro acesso.
            </p>
            <div className="border-border bg-surface-muted flex items-center gap-2 rounded-sm border p-1 pl-3">
              <code className="text-md flex-1 font-mono tracking-wider">{result.tempPassword}</code>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(result.tempPassword!);
                  toast.success("Senha copiada.");
                }}
              >
                <Copy /> Copiar
              </Button>
            </div>
          </div>
        ) : (
          <Notice tone="success" title={`${result.email} já tinha conta`}>
            O acesso a este cliente foi adicionado. A pessoa entra com a senha que já usa.
          </Notice>
        )
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Nome" error={errors.name}>
            {({ id, invalid }) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <Field label="E-mail" error={errors.email}>
            {({ id, invalid }) => (
              <Input
                id={id}
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <Field label="Papel">
            {({ id }) => (
              <Select
                id={id}
                value={role}
                onValueChange={(v) => setRole(v as Role)}
                options={ROLES.map((r) => ({ ...r }))}
              />
            )}
          </Field>
          <button type="submit" hidden />
        </form>
      )}
    </Sheet>
  );
}
