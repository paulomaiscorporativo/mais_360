"use client";

import { FileUp, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

const MB = 1024 * 1024;
const MAX_UPLOAD = 6 * MB;

/**
 * Escolha de arquivo (PDF ou imagem) com rótulo acessível. O tipo real é
 * conferido no servidor pelo conteúdo; aqui só filtramos o seletor.
 */
export function FilePicker({
  label,
  file,
  onChange,
  error,
  accept = "application/pdf,image/png,image/jpeg,image/webp",
  hint = "PDF, PNG, JPG ou WebP até 6 MB.",
  large,
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  accept?: string;
  hint?: string;
  /** Alvo de toque maior (portal do viajante). */
  large?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [tooBig, setTooBig] = useState(false);
  const shownError = tooBig ? "Arquivo maior que 6 MB. Envie um menor ou comprima o PDF." : error;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        aria-describedby={`${id}-hint`}
        aria-invalid={shownError ? true : undefined}
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null;
          // Limite das Server Actions (next.config.ts): evita um erro genérico no envio
          const over = !!picked && picked.size > MAX_UPLOAD;
          setTooBig(over);
          onChange(over ? null : picked);
          if (over) e.target.value = "";
        }}
      />
      {file ? (
        <div
          className={cn(
            "border-border bg-surface flex items-center gap-3 rounded-md border px-3",
            large ? "min-h-12" : "min-h-9",
          )}
        >
          <FileUp className="text-fg-subtle size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
          <span className="text-fg-subtle tabular shrink-0 text-xs">
            {(file.size / MB).toFixed(1)} MB
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remover arquivo"
            onClick={() => {
              onChange(null);
              if (input.current) input.current.value = "";
            }}
          >
            <X />
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          size={large ? "lg" : "md"}
          className="justify-start"
          onClick={() => input.current?.click()}
        >
          <FileUp /> Escolher arquivo
        </Button>
      )}
      <p
        id={`${id}-hint`}
        className={cn("text-xs", shownError ? "text-danger font-medium" : "text-fg-subtle")}
      >
        {shownError || hint}
      </p>
    </div>
  );
}
