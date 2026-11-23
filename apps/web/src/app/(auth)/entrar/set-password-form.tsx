"use client";

import { Check, Eye, EyeOff } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { cn } from "@/lib/cn";
import { completeAccessLink } from "../access-actions";

/** Formulário de nova senha a partir de um link (convite ou redefinição). */
export function SetPasswordForm({
  token,
  purpose,
  email,
  submitLabel,
}: {
  token: string;
  purpose: "INVITE" | "PASSWORD_RESET";
  email: string;
  submitLabel: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);

  const rules = [
    { ok: pwd.length >= 10, label: "10 caracteres ou mais" },
    { ok: /[A-Za-zÀ-ÿ]/.test(pwd) && /\d/.test(pwd), label: "Letras e números" },
  ];

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await completeAccessLink({
        token,
        purpose,
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
      {/* Ajuda gerenciadores de senha a associar a senha nova à conta certa */}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <Field label="Nova senha" error={fields.password}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            autoFocus
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
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
      <ul className="-mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Requisitos da senha">
        {rules.map((r) => (
          <li
            key={r.label}
            className={cn(
              "flex items-center gap-1.5 transition-colors",
              r.ok ? "text-success" : "text-fg-subtle",
            )}
          >
            <Check className={cn("size-3.5", !r.ok && "opacity-30")} strokeWidth={2.5} />
            {r.label}
            <span className="sr-only">{r.ok ? "(atendido)" : "(pendente)"}</span>
          </li>
        ))}
      </ul>
      <Field label="Confirme a nova senha" error={fields.confirm}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="confirm"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className="h-11"
          />
        )}
      </Field>
      <Button type="submit" size="lg" block loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
