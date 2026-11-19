"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { signIn } from "./actions";

const big = "h-12 text-md";

/** Entrada da empresa convidante com o login e a senha enviados pela organização. */
export function CompanyLogin({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await signIn({ tenantSlug, login, password });
          if (r.ok) router.refresh();
          else {
            setError(r.error);
            setFieldErrors(r.fieldErrors ?? {});
          }
        });
      }}
    >
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Área da empresa convidada</h2>
        <p className="text-fg-muted mt-1 text-base">
          Entre com o login e a senha que chegaram no convite do responsável.
        </p>
      </div>
      <Field label="Login" error={fieldErrors.login}>
        {(a) => (
          <Input
            id={a.id}
            aria-describedby={a.describedBy}
            aria-invalid={a.invalid || undefined}
            className={big}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoFocus
          />
        )}
      </Field>
      <Field label="Senha" error={fieldErrors.password}>
        {(a) => (
          <Input
            id={a.id}
            aria-describedby={a.describedBy}
            aria-invalid={a.invalid || undefined}
            className={big}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      {error && !Object.keys(fieldErrors).length && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" size="lg" block loading={pending}>
        <LogIn /> Entrar
      </Button>
      <p className="text-fg-subtle text-sm">
        Esqueceu a senha? Fale com a organização do evento: ela gera uma nova para você.
      </p>
    </form>
  );
}
