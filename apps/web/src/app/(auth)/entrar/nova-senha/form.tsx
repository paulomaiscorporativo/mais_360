"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { cn } from "@/lib/cn";
import { changePassword } from "../../actions";

export function NewPasswordForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pwd, setPwd] = useState("");

  const rules = [
    { ok: pwd.length >= 10, label: "10 caracteres ou mais" },
    { ok: /[A-Za-zÀ-ÿ]/.test(pwd) && /\d/.test(pwd), label: "Letras e números" },
  ];

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await changePassword({
        current: String(fd.get("current") ?? ""),
        password: String(fd.get("password") ?? ""),
        confirm: String(fd.get("confirm") ?? ""),
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
      <Field label="Senha atual" error={fields.current}>
        {({ id, invalid }) => (
          <Input id={id} name="current" type="password" autoComplete="current-password" aria-invalid={invalid || undefined} className="h-11" />
        )}
      </Field>
      <Field label="Nova senha" error={fields.password}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="password"
            type="password"
            autoComplete="new-password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className="h-11"
          />
        )}
      </Field>
      <ul className="-mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {rules.map((r) => (
          <li key={r.label} className={cn("flex items-center gap-1.5 transition-colors", r.ok ? "text-success" : "text-fg-subtle")}>
            <Check className={cn("size-3.5", !r.ok && "opacity-30")} strokeWidth={2.5} />
            {r.label}
          </li>
        ))}
      </ul>
      <Field label="Confirme a nova senha" error={fields.confirm}>
        {({ id, invalid }) => (
          <Input id={id} name="confirm" type="password" autoComplete="new-password" aria-invalid={invalid || undefined} className="h-11" />
        )}
      </Field>
      <Button type="submit" size="lg" block loading={pending}>
        Salvar e continuar
      </Button>
    </form>
  );
}
