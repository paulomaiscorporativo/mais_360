"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { Select, type SelectOption } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { InviteLinkPanel } from "./invite-link";

export type InviteResult = {
  email: string;
  invite: { link: string; expiresAt: string } | null;
};

type SubmitResult =
  | { ok: true; data: InviteResult }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Convidar para a equipe: nome, e-mail e papel. Conta nova recebe convite por
 * e-mail (e o link aparece para copiar); quem já tem conta recebe só o acesso.
 */
export function InviteSheet<R extends string>({
  open,
  onOpenChange,
  title,
  description,
  roles,
  defaultRole,
  contextLabel,
  submit,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  roles: (SelectOption & { value: R })[];
  defaultRole: R;
  /** "a este cliente", "ao assinante" — usado na mensagem de quem já tem conta. */
  contextLabel: string;
  submit: (input: { name: string; email: string; role: R }) => Promise<SubmitResult>;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<R>(defaultRole);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<InviteResult | null>(null);
  const [pending, start] = useTransition();

  const reset = () => {
    setName("");
    setEmail("");
    setRole(defaultRole);
    setErrors({});
    setResult(null);
  };

  function send() {
    start(async () => {
      const r = await submit({ name, email, role });
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
      title={result ? (result.invite ? "Convite enviado" : "Acesso adicionado") : title}
      description={result ? undefined : description}
      footer={
        result ? (
          <Button onClick={() => onOpenChange(false)}>Concluir</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={send} loading={pending}>
              Enviar convite
            </Button>
          </>
        )
      }
    >
      {result ? (
        result.invite ? (
          <InviteLinkPanel
            email={result.email}
            link={result.invite.link}
            expiresAt={result.invite.expiresAt}
          />
        ) : (
          <Notice tone="success" title={`${result.email} já tinha conta`}>
            O acesso {contextLabel} foi adicionado. A pessoa entra com a senha que já usa e recebeu
            um aviso por e-mail.
          </Notice>
        )
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Field label="Nome" error={errors.name}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                autoComplete="off"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <Field
            label="E-mail"
            error={errors.email}
            hint="O convite chega neste endereço. Vale por 7 dias."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <Field label="Papel" error={errors.role}>
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={role}
                onValueChange={(v) => setRole(v as R)}
                options={roles}
              />
            )}
          </Field>
          <button type="submit" hidden />
        </form>
      )}
    </Sheet>
  );
}

/** Resultado de reenvio de convite, num painel próprio. */
export function ResentInviteSheet({
  result,
  onClose,
}: {
  result: { email: string; link: string; expiresAt: string } | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={!!result}
      onOpenChange={(o) => !o && onClose()}
      title="Convite reenviado"
      description="O link anterior deixou de valer."
      footer={<Button onClick={onClose}>Concluir</Button>}
    >
      {result && (
        <InviteLinkPanel email={result.email} link={result.link} expiresAt={result.expiresAt} />
      )}
    </Sheet>
  );
}
