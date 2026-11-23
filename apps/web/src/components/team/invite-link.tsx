"use client";

import { Check, Copy, MailCheck } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Convite enviado: confirma o e-mail e oferece o link para copiar — útil
 * quando o e-mail demora, cai no spam ou o worker está parado.
 */
export function InviteLinkPanel({
  email,
  link,
  expiresAt,
  className,
}: {
  email: string;
  link: string;
  expiresAt: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const inputId = useId();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link do convite copiado.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  };
  return (
    <div className={cn("flex flex-col gap-4 text-left", className)}>
      <div className="flex gap-3">
        <MailCheck className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
        <p className="text-fg-muted text-base">
          Enviamos um convite para <span className="text-fg font-medium">{email}</span>. A pessoa
          cria a própria senha pelo link, que vale até {dateFmt.format(new Date(expiresAt))}.
        </p>
      </div>
      <div>
        <label htmlFor={inputId} className="text-fg-subtle mb-1.5 block text-sm">
          Se o e-mail não chegar, copie o link e envie por outro canal:
        </label>
        <div className="border-border bg-surface-muted flex items-center gap-2 rounded-sm border p-1 pl-3">
          <input
            id={inputId}
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="text-fg min-w-0 flex-1 truncate bg-transparent font-mono text-sm outline-none"
          />
          <Button variant="secondary" size="sm" onClick={copy}>
            {copied ? <Check /> : <Copy />} Copiar
          </Button>
        </div>
        <p className="text-fg-faint mt-1.5 text-xs">
          O link é pessoal e de uso único. Reenviar o convite gera um novo e invalida este.
        </p>
      </div>
    </div>
  );
}
