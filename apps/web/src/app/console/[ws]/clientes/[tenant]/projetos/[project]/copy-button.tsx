"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { toast } from "@/components/ui/toast";

export function CopyButton({ value, label = "Copiar link" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          toast.success("Link copiado.");
          setTimeout(() => setDone(false), 1600);
        } catch {
          toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
        }
      }}
    >
      {done ? <Check /> : <Copy />} {label}
    </Button>
  );
}
