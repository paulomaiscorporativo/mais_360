"use client";

import { ArrowLeft, Mail, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { requestPasswordReset } from "../../access-actions";

export function ForgotForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setError(null);
    setFieldError(undefined);
    start(async () => {
      const r = await requestPasswordReset({ email });
      if (r.ok) setSentTo(email.trim().toLowerCase());
      else {
        setFieldError(r.fieldErrors?.email);
        if (!r.fieldErrors) setError(r.error);
      }
    });
  }

  if (sentTo) {
    return (
      <div className="mt-8 flex flex-col gap-6" role="status">
        <div className="border-border bg-surface flex gap-3 rounded-md border p-4 shadow-sm">
          <MailCheck className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="text-base">
            <p className="font-medium">Confira sua caixa de entrada</p>
            <p className="text-fg-muted mt-1">
              Se <span className="text-fg font-medium">{sentTo}</span> tiver uma conta ativa, o link
              chega em instantes. Ele vale por 1 hora. Olhe também a caixa de spam.
            </p>
          </div>
        </div>
        <Button asChild variant="secondary" size="lg" block>
          <Link href="/entrar">
            <ArrowLeft /> Voltar ao login
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5" noValidate>
      {error && <Notice tone="danger" title={error} />}
      <Field label="E-mail" error={fieldError}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoFocus
            required
            placeholder="voce@empresa.com.br"
            leading={<Mail />}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className="h-11"
          />
        )}
      </Field>
      <Button type="submit" size="lg" block loading={pending}>
        Enviar link
      </Button>
      <Link
        href="/entrar"
        className="text-fg-muted hover:text-fg self-center rounded-sm text-sm underline-offset-4 hover:underline"
      >
        Lembrei a senha
      </Link>
    </form>
  );
}
