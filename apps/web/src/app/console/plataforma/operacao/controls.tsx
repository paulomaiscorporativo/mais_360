"use client";

import { RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { Select } from "@/components/ui/controls";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { discardJob, retryJob } from "./actions";

const REFRESH_MS = 30_000;

/** Atualiza o painel a cada 30 s (pausa com a aba escondida) e sob demanda. */
export function AutoRefresh({ updatedAt }: { updatedAt: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") start(() => router.refresh());
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);
  return (
    <div className="flex items-center gap-3">
      <span className="text-fg-subtle text-sm" aria-live="polite">
        Atualizado às {updatedAt}
      </span>
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() => start(() => router.refresh())}
      >
        <RefreshCw aria-hidden />
        Atualizar
      </Button>
    </div>
  );
}

const ALL = "_todas";

/** Filtros por fila e por cliente (ficam na URL: link compartilhável). */
export function JobFilters({
  queues,
  tenants,
  queue,
  tenantId,
}: {
  queues: { value: string; label: string }[];
  tenants: { id: string; label: string }[];
  queue: string | null;
  tenantId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === ALL) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:w-[480px]">
      <Select
        aria-label="Filtrar por fila"
        value={queue ?? ALL}
        onValueChange={(v) => set("fila", v)}
        options={[{ value: ALL, label: "Todas as filas" }, ...queues]}
      />
      <Select
        aria-label="Filtrar por cliente"
        value={tenantId ?? ALL}
        onValueChange={(v) => set("cliente", v)}
        options={[
          { value: ALL, label: "Todos os clientes" },
          ...tenants.map((t) => ({ value: t.id, label: t.label })),
        ]}
      />
    </div>
  );
}

/** Tentar de novo / Descartar um job com falha definitiva (só superadmin). */
export function JobActions({ jobId, queueLabel }: { jobId: string; queueLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  const run = (kind: "retry" | "discard") =>
    start(async () => {
      const r = await (kind === "retry" ? retryJob : discardJob)({ jobId });
      if (r.ok) {
        toast.success(
          kind === "retry"
            ? `Job de ${queueLabel} voltou para a fila.`
            : `Job de ${queueLabel} descartado.`,
        );
        setConfirm(false);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="secondary"
        size="sm"
        loading={pending && !confirm}
        onClick={() => run("retry")}
      >
        <RotateCcw aria-hidden />
        Tentar de novo
      </Button>
      <Button variant="danger-ghost" size="sm" disabled={pending} onClick={() => setConfirm(true)}>
        <Trash2 aria-hidden />
        Descartar
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        tone="danger"
        title={`Descartar o job de ${queueLabel}?`}
        description="Ele sai da fila e não será executado. O registro fica na auditoria com o erro e um resumo do conteúdo."
        confirmLabel="Descartar job"
        loading={pending}
        onConfirm={() => run("discard")}
      />
    </div>
  );
}
