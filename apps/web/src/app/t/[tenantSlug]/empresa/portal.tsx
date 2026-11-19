"use client";

import { KeyRound, LogOut, Repeat2, UserPlus, Users, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { InviteStatus } from "@mais/core";
import { Badge, Button, EmptyState, Field, Input, Notice } from "@/components/ui";
import { ConfirmDialog, Sheet } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { INVITE_STATUS_UI } from "@/components/events/labels";
import {
  addCompanyGuest,
  cancelCompanyGuest,
  changeCompanyPassword,
  replaceCompanyGuest,
  signOut,
} from "./actions";

export type PortalGuest = {
  id: string;
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  status: InviteStatus;
  responsible: boolean;
  table: string;
  changeable: boolean;
};

type GuestForm = { fullName: string; email: string; phone: string; jobTitle: string };
const emptyForm: GuestForm = { fullName: "", email: "", phone: "", jobTitle: "" };

/**
 * Portal da empresa convidante: acompanha a cota, indica, substitui e cancela
 * os próprios convidados. Pensado primeiro para o celular do responsável.
 */
export function CompanyPortalView({
  tenantSlug,
  companyName,
  contactName,
  quota,
  used,
  open,
  closedReason,
  deadline,
  provisional,
  guests,
}: {
  tenantSlug: string;
  companyName: string;
  contactName: string;
  quota: number;
  used: number;
  open: boolean;
  closedReason: string | null;
  deadline: string | null;
  provisional: boolean;
  guests: PortalGuest[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<
    { mode: "add" } | { mode: "replace"; guest: PortalGuest } | null
  >(null);
  const [canceling, setCanceling] = useState<PortalGuest | null>(null);
  const [password, setPassword] = useState(false);
  const [pending, start] = useTransition();
  const remaining = Math.max(0, quota - used);
  const pct = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const active = guests.filter((g) => g.status !== "CANCELED");
  const confirmed = active.filter((g) => g.status === "CONFIRMED" || g.status === "CHECKED_IN");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-fg-subtle text-sm">Empresa convidada</p>
          <h2 className="truncate text-xl font-semibold tracking-tight">{companyName}</h2>
          {contactName && <p className="text-fg-muted text-sm">Responsável: {contactName}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Trocar senha"
            onClick={() => setPassword(true)}
          >
            <KeyRound />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sair"
            onClick={() =>
              start(async () => {
                await signOut({ tenantSlug });
                router.refresh();
              })
            }
          >
            <LogOut />
          </Button>
        </div>
      </div>

      {provisional && (
        <Notice tone="warning" icon={<KeyRound />} title="Você está com a senha provisória">
          <button
            type="button"
            className="text-brand-text font-medium underline underline-offset-4"
            onClick={() => setPassword(true)}
          >
            Crie uma senha sua
          </button>{" "}
          para proteger a área da empresa.
        </Notice>
      )}

      <section aria-labelledby="cota" className="border-border rounded-lg border p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="cota" className="text-base font-semibold">
            Convites da cota
          </h3>
          <span className="tabular text-fg-muted text-sm">
            {used} de {quota} usados
          </span>
        </div>
        <div
          className="bg-surface-sunken mt-3 h-2.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={quota}
          aria-valuenow={used}
          aria-label="Uso da cota"
        >
          <div
            className="bg-brand h-full rounded-full transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <dt className="text-fg-subtle text-xs">Disponíveis</dt>
            <dd className="tabular text-2xl font-semibold">{remaining}</dd>
          </div>
          <div>
            <dt className="text-fg-subtle text-xs">Convidados</dt>
            <dd className="tabular text-2xl font-semibold">{active.length}</dd>
          </div>
          <div>
            <dt className="text-fg-subtle text-xs">Confirmaram</dt>
            <dd className="tabular text-2xl font-semibold">{confirmed.length}</dd>
          </div>
        </dl>
        {open ? (
          deadline && (
            <p className="text-fg-subtle mt-4 text-sm">
              Você pode indicar e substituir convidados até{" "}
              <strong className="text-fg">{deadline}</strong>.
            </p>
          )
        ) : (
          <Notice tone="info" className="mt-4">
            {closedReason}
          </Notice>
        )}
        {open && remaining > 0 && (
          <Button size="lg" block className="mt-4" onClick={() => setEditing({ mode: "add" })}>
            <UserPlus /> Indicar convidado
          </Button>
        )}
      </section>

      <section aria-labelledby="convidados" className="flex flex-col gap-3">
        <h3 id="convidados" className="text-base font-semibold">
          Seus convidados
        </h3>
        {guests.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="Nenhum convidado ainda"
            description="Indique quem vai representar a empresa. O convite chega por e-mail e WhatsApp, com o QR da entrada."
          />
        ) : (
          <ul className="divide-border border-border divide-y rounded-lg border">
            {guests.map((g) => {
              const ui = INVITE_STATUS_UI[g.status];
              return (
                <li
                  key={g.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          g.status === "CANCELED" ? "text-fg-subtle line-through" : "font-medium"
                        }
                      >
                        {g.name}
                      </span>
                      {g.responsible && (
                        <Badge tone="neutral" size="sm">
                          Responsável
                        </Badge>
                      )}
                    </p>
                    <p className="text-fg-subtle truncate text-sm">
                      {[g.jobTitle, g.email || g.phone, g.table].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={ui.tone} size="md">
                      {ui.label}
                    </Badge>
                    {open && g.changeable && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-10"
                          onClick={() => setEditing({ mode: "replace", guest: g })}
                        >
                          <Repeat2 /> Substituir
                        </Button>
                        <Button
                          variant="danger-ghost"
                          size="icon"
                          aria-label={`Cancelar o convite de ${g.name}`}
                          onClick={() => setCanceling(g)}
                        >
                          <XCircle />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <GuestSheet
        key={editing ? (editing.mode === "add" ? "add" : editing.guest.id) : "none"}
        tenantSlug={tenantSlug}
        state={editing}
        onClose={() => setEditing(null)}
      />
      <PasswordSheet tenantSlug={tenantSlug} open={password} onOpenChange={setPassword} />
      <ConfirmDialog
        open={!!canceling}
        onOpenChange={(o) => !o && setCanceling(null)}
        title={`Cancelar o convite de ${canceling?.name ?? ""}?`}
        description="A pessoa recebe o aviso de cancelamento e a vaga volta para a sua cota."
        confirmLabel="Cancelar convite"
        tone="danger"
        loading={pending}
        onConfirm={() => {
          const g = canceling;
          if (!g) return;
          start(async () => {
            const r = await cancelCompanyGuest({ tenantSlug, registrationId: g.id });
            if (r.ok) {
              toast.success("Convite cancelado.");
              setCanceling(null);
              router.refresh();
            } else toast.error(r.error);
          });
        }}
      />
    </div>
  );
}

function GuestSheet({
  tenantSlug,
  state,
  onClose,
}: {
  tenantSlug: string;
  state: { mode: "add" } | { mode: "replace"; guest: PortalGuest } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState<GuestForm>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof GuestForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });
  const replacing = state?.mode === "replace" ? state.guest : null;

  function submit() {
    setError(null);
    start(async () => {
      const r = replacing
        ? await replaceCompanyGuest({ tenantSlug, registrationId: replacing.id, ...f })
        : await addCompanyGuest({ tenantSlug, ...f });
      if (r.ok) {
        toast.success(
          r.data.sent
            ? "Convite enviado por e-mail e WhatsApp."
            : "Convidado indicado. A organização envia o convite.",
        );
        onClose();
        router.refresh();
      } else {
        setError(r.error);
        setErrors(r.fieldErrors ?? {});
      }
    });
  }

  const input = (
    k: keyof GuestForm,
    label: string,
    extra: React.InputHTMLAttributes<HTMLInputElement>,
    optional?: boolean,
  ) => (
    <Field label={label} error={errors[k]} optional={optional}>
      {(a) => (
        <Input
          id={a.id}
          aria-describedby={a.describedBy}
          aria-invalid={a.invalid || undefined}
          className="text-md h-12"
          value={f[k]}
          onChange={set(k)}
          {...extra}
        />
      )}
    </Field>
  );

  return (
    <Sheet
      open={!!state}
      onOpenChange={(o) => !o && onClose()}
      title={replacing ? `Substituir ${replacing.name}` : "Indicar convidado"}
      description={
        replacing
          ? "O convite atual é cancelado e a nova pessoa recebe o dela, na mesma vaga."
          : "Informe o e-mail ou o WhatsApp para o convite chegar."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Voltar
          </Button>
          <Button loading={pending} onClick={submit}>
            {replacing ? "Substituir" : "Indicar"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {input("fullName", "Nome completo", { autoComplete: "off", autoFocus: true })}
        {input("email", "E-mail", { type: "email", inputMode: "email", autoComplete: "off" })}
        {input("phone", "WhatsApp com DDD", { type: "tel", inputMode: "tel", autoComplete: "off" })}
        {input("jobTitle", "Cargo", { autoComplete: "off" }, true)}
        {error && !Object.keys(errors).length && <Notice tone="danger">{error}</Notice>}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

function PasswordSheet({
  tenantSlug,
  open,
  onOpenChange,
}: {
  tenantSlug: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Trocar senha"
      description="Use pelo menos 10 caracteres, com letras e números."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await changeCompanyPassword({ tenantSlug, current, next });
                if (r.ok) {
                  toast.success("Senha alterada.");
                  setCurrent("");
                  setNext("");
                  setErrors({});
                  onOpenChange(false);
                  router.refresh();
                } else {
                  setErrors(r.fieldErrors ?? {});
                  if (!r.fieldErrors) toast.error(r.error);
                }
              })
            }
          >
            Salvar senha
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Senha atual" error={errors.current}>
          {(a) => (
            <Input
              id={a.id}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid || undefined}
              type="password"
              className="text-md h-12"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          )}
        </Field>
        <Field label="Nova senha" error={errors.next}>
          {(a) => (
            <Input
              id={a.id}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid || undefined}
              type="password"
              className="text-md h-12"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Sheet>
  );
}
