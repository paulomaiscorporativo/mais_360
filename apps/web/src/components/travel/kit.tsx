"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Field, Input, Textarea } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

type Result<T> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Executa uma Server Action com o contrato {ok,data}|{ok,error}: mostra o
 * aviso, guarda os erros de campo e atualiza a página no sucesso.
 */
export function useRunAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const run = useCallback(
    <T,>(
      fn: () => Promise<Result<T>>,
      opts: { success?: string; onSuccess?: (data: T) => void; refresh?: boolean } = {},
    ) =>
      new Promise<boolean>((resolve) => {
        start(async () => {
          const r = await fn();
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            toast.error(r.error);
            resolve(false);
            return;
          }
          setErrors({});
          if (opts.success) toast.success(opts.success);
          opts.onSuccess?.(r.data);
          if (opts.refresh !== false) router.refresh();
          resolve(true);
        });
      }),
    [router],
  );

  return { run, pending, errors, setErrors };
}

/** Campo de texto com rótulo, dica e erro. */
export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  optional,
  type = "text",
  placeholder,
  className,
  inputClassName,
  multiline,
  rows = 3,
  ...rest
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
  type?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  list?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <Field label={label} error={error} hint={hint} optional={optional} className={className}>
      {({ id, describedBy, invalid }) =>
        multiline ? (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            value={value}
            rows={rows}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={inputClassName}
            maxLength={rest.maxLength}
          />
        ) : (
          <Input
            id={id}
            type={type}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={inputClassName}
            {...rest}
          />
        )
      }
    </Field>
  );
}

/** Título de bloco dentro das telas operacionais. */
export function SectionTitle({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-fg-muted text-xs font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/** Ponto colorido (grupo/categoria). */
export function Dot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}

/** Estado local de formulário com set por campo. */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [form, setForm] = useState<T>(initial);
  const set = useCallback(
    <K extends keyof T>(key: K) =>
      (value: T[K]) =>
        setForm((f) => ({ ...f, [key]: value })),
    [],
  );
  return { form, setForm, set };
}
