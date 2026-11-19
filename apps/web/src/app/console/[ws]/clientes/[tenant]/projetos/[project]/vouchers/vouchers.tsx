"use client";

import { CheckCircle2, ExternalLink, Eye, FileText, Loader2, Send, Ticket } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, EmptyState, Notice, Panel } from "@/components/ui";
import { Checkbox, Select, Switch } from "@/components/ui/controls";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Dot, useRunAction } from "@/components/travel/kit";
import { issueVouchers, setVoucherInPortal } from "./actions";

export type VoucherTraveler = {
  id: string;
  name: string;
  shortCode: string;
  group: { name: string; color: string } | null;
  fileId: string | null;
  issuedLabel: string;
};

type TemplateOption = {
  id: string;
  name: string;
  scope: "project" | "tenant";
  visibleToPerson: boolean;
};

type JobView = {
  id: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "DEAD";
  total: number;
  done: number;
  failed: number;
  lastError: string;
  updatedLabel: string;
};

export function VouchersManager({
  tenant,
  projectId,
  canEdit,
  templates,
  selectedId,
  travelers,
  jobs,
  libraryHref,
}: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  templates: TemplateOption[];
  selectedId: string | null;
  travelers: VoucherTraveler[];
  jobs: JobView[];
  libraryHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notify, setNotify] = useState(true);
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const { run, pending } = useRunAction();
  const template = templates.find((t) => t.id === selectedId) ?? null;
  const running = jobs.find((j) => j.status === "PENDING" || j.status === "RUNNING");
  const lastDone = jobs.find((j) => j.status === "DONE" || j.status === "DEAD");

  // Acompanha o lote em segundo plano
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [running, router]);

  if (!template)
    return (
      <EmptyState
        icon={<Ticket />}
        title="Crie o modelo do voucher"
        description="Desenhe o voucher na biblioteca de documentos (tipo Voucher): nome, voo com localizador, hotel e quarto entram sozinhos. Depois volte aqui para emitir para o grupo."
        action={
          <Button asChild>
            <Link href={libraryHref}>
              <FileText /> Abrir a biblioteca de documentos
            </Link>
          </Button>
        }
      />
    );

  if (!travelers.length)
    return (
      <EmptyState
        icon={<Ticket />}
        title="Ainda não há viajantes"
        description="Inclua as pessoas em Inscrições para emitir os vouchers."
      />
    );

  const issuedCount = travelers.filter((t) => t.fileId).length;
  const allSelected = selected.size === travelers.length;
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const issue = (ids: string[]) =>
    run(
      () =>
        issueVouchers({ tenant, projectId, templateId: template.id, registrationIds: ids, notify }),
      {
        onSuccess: () => {
          setSelected(new Set());
          setConfirm(null);
        },
        success:
          ids.length > 10
            ? "Emissão iniciada. Você pode sair desta tela: ela continua em segundo plano."
            : "Vouchers emitidos e publicados no portal.",
      },
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex w-full flex-col gap-1.5 sm:w-72">
          <label htmlFor="voucher-template" className="text-sm font-medium">
            Modelo
          </label>
          <Select
            id="voucher-template"
            value={template.id}
            onValueChange={(v) => router.push(`${pathname}?modelo=${v}`)}
            options={templates.map((t) => ({
              value: t.id,
              label: t.name,
              description: t.scope === "project" ? "Deste projeto" : "Do cliente",
            }))}
          />
        </div>
        <label className="flex items-center gap-3 pb-2 text-sm">
          <Switch
            disabled={!canEdit || pending}
            checked={template.visibleToPerson}
            onCheckedChange={(v) =>
              run(
                () =>
                  setVoucherInPortal({ tenant, projectId, templateId: template.id, visible: v }),
                { success: v ? "Voucher disponível no portal." : "Voucher retirado do portal." },
              )
            }
          />
          <span>
            <span className="font-medium">Sempre atualizado no portal</span>
            <span className="text-fg-subtle block text-xs">
              O viajante baixa gerado na hora, com os dados do momento
              {template.scope === "tenant" && " (vale para todos os projetos com este modelo)"}.
            </span>
          </span>
        </label>
        <Button variant="link" asChild className="ml-auto pb-2">
          <Link href={libraryHref}>
            Editar modelos <ExternalLink />
          </Link>
        </Button>
      </div>

      {running && (
        <Notice tone="info" icon={<Loader2 className="animate-spin" />} title="Emitindo vouchers">
          <span className="tabular">
            {running.done} de {running.total}
          </span>{" "}
          prontos. A emissão segue em segundo plano; esta tela se atualiza sozinha.
        </Notice>
      )}
      {!running && lastDone && lastDone.failed > 0 && (
        <Notice tone="warning" title="Alguns vouchers não foram emitidos">
          {lastDone.failed} de {lastDone.total} falharam no lote de {lastDone.updatedLabel}. Confira
          os dados dessas pessoas e emita de novo.
        </Notice>
      )}
      {!running && lastDone?.status === "DEAD" && (
        <Notice tone="danger" title="O lote de vouchers parou">
          {lastDone.lastError || "Tente emitir de novo."}
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-fg-muted text-sm">
          <span className="tabular text-fg font-medium">{issuedCount}</span> de{" "}
          <span className="tabular">{travelers.length}</span> com voucher publicado.
        </p>
        {canEdit && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={notify} onCheckedChange={(c) => setNotify(c === true)} />
              Avisar por e-mail e WhatsApp
            </label>
            {selected.size > 0 ? (
              <Button
                loading={pending}
                disabled={!!running}
                onClick={() => setConfirm([...selected])}
              >
                <Send /> Emitir para {selected.size}
              </Button>
            ) : (
              <Button
                loading={pending}
                disabled={!!running}
                onClick={() => setConfirm(travelers.map((t) => t.id))}
              >
                <Send /> Emitir para todos
              </Button>
            )}
          </div>
        )}
      </div>

      <Panel>
        <div className="border-border flex items-center gap-3 border-b px-5 py-2.5">
          {canEdit && (
            <Checkbox
              aria-label={allSelected ? "Desmarcar todos" : "Selecionar todos"}
              checked={allSelected ? true : selected.size ? "indeterminate" : false}
              onCheckedChange={(c) =>
                setSelected(c === true ? new Set(travelers.map((t) => t.id)) : new Set())
              }
            />
          )}
          <span className="text-fg-subtle text-xs font-semibold">Viajante</span>
        </div>
        <ul className="divide-border divide-y">
          {travelers.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
              {canEdit && (
                <Checkbox
                  aria-label={`Selecionar ${t.name}`}
                  checked={selected.has(t.id)}
                  onCheckedChange={(c) => toggle(t.id, c === true)}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {t.group && <Dot color={t.group.color} />}
                  <span className="truncate font-medium">{t.name}</span>
                  <span className="text-fg-subtle font-mono text-xs">{t.shortCode}</span>
                </div>
              </div>
              {t.fileId ? (
                <Badge tone="success" size="sm">
                  <CheckCircle2 className="size-3" /> Publicado em {t.issuedLabel}
                </Badge>
              ) : (
                <Badge size="sm">Não emitido</Badge>
              )}
              <Button variant="ghost" size="icon-sm" asChild>
                <a
                  href={`/api/documents/${template.id}/render?format=pdf&registration=${t.id}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Pré-visualizar o voucher de ${t.name}`}
                >
                  <Eye />
                </a>
              </Button>
              {t.fileId && (
                <Button variant="ghost" size="icon-sm" asChild>
                  <a
                    href={`/api/files/${t.fileId}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Abrir o voucher publicado de ${t.name}`}
                  >
                    <FileText />
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Emitir ${confirm?.length ?? 0} voucher${confirm?.length === 1 ? "" : "s"}?`}
        description={
          <>
            Gera o PDF de “{template.name}” para cada pessoa e publica no portal. Quem já tem
            voucher recebe a versão atualizada.
            {notify && " Cada viajante é avisado uma única vez por modelo."}
          </>
        }
        confirmLabel="Emitir"
        loading={pending}
        onConfirm={() => confirm && void issue(confirm)}
      />
    </div>
  );
}
