"use client";

import { Eye, EyeOff, Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { Checkbox } from "@/components/ui/controls";
import { login } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await login({
        email: String(fd.get("email") ?? ""),
        password: String(fd.get("password") ?? ""),
        remember,
        next,
      });
      if (r && !r.ok) {
        setError(r.error);
        setFields(r.fieldErrors ?? {});
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5" noValidate>
      {error && <Notice tone="danger" title={error} />}
      <Field label="E-mail" error={fields.email}>
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
      <Field label="Senha" error={fields.password}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className="h-11"
            trailing={
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="text-fg-subtle hover:bg-hover hover:text-fg grid size-8 place-items-center rounded-sm"
                aria-label={show ? "Ocultar senha" : "Mostrar senha"}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
          />
        )}
      </Field>
      <label className="text-fg-muted flex cursor-pointer items-center gap-2.5 text-base">
        <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
        Manter conectado neste dispositivo
      </label>
      <Button type="submit" size="lg" block loading={pending}>
        Entrar
      </Button>
    </form>
  );
}
