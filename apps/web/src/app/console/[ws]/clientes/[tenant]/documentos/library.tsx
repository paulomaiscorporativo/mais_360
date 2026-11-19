"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Copy, Download, FilePlus2, MoreHorizontal, Pencil, Star, Trash2 } from "lucide-react";
import type { DocumentDefinition, DocumentKind } from "@mais/core";
import { Badge, Button, EmptyState, Field, Input } from "@/components/ui";
import {
  ConfirmDialog,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Sheet,
} from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { KIND_ORDER, KIND_UI, formatSize } from "@/components/documents/kinds";
import { PagePreview } from "@/components/documents/page-preview";
import { cn } from "@/lib/cn";
import {
  archiveTemplate,
  createTemplate,
  duplicateTemplate,
  setDefaultTemplate,
} from "./actions";

export type LibraryItem = {
  id: string;
  name: string;
  kind: DocumentKind;
  version: number;
  isDefault: boolean;
  visibleToPerson: boolean;
  project: string | null;
  updatedAt: string;
  definition: DocumentDefinition;
};

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

export function Library({
  tenant,
  base,
  items,
  canEdit,
}: {
  tenant: string;
  base: string;
  items: LibraryItem[];
  canEdit: boolean;
}) {
  const [filter, setFilter] = useState<DocumentKind | "ALL">("ALL");
  const [creating, setCreating] = useState(false);
  const counts = useMemo(() => {
    const c = new Map<DocumentKind, number>();
    for (const i of items) c.set(i.kind, (c.get(i.kind) ?? 0) + 1);
    return c;
  }, [items]);
  const visible = filter === "ALL" ? items : items.filter((i) => i.kind === filter);
  const kinds = KIND_ORDER.filter((k) => counts.has(k));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Modelos de documento</h2>
          <p className="text-fg-muted mt-1 max-w-xl text-base">
            Crachás, etiquetas, vouchers e certificados com a marca deste cliente. O balcão, o
            totem e o portal do viajante usam o modelo marcado como padrão.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setCreating(true)}>
            <FilePlus2 /> Novo modelo
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<FilePlus2 />}
          title="Comece pelo crachá ou pela etiqueta"
          description="Os modelos prontos já vêm com a marca do cliente, QR code e faixa de categoria. Ajuste no editor e imprima."
          action={
            canEdit ? (
              <Button onClick={() => setCreating(true)}>
                <FilePlus2 /> Criar o primeiro modelo
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {kinds.length > 1 && (
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
              <FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")}>
                Todos <span className="text-fg-subtle tabular-nums">{items.length}</span>
              </FilterChip>
              {kinds.map((k) => (
                <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)}>
                  {KIND_UI[k].plural}{" "}
                  <span className="text-fg-subtle tabular-nums">{counts.get(k)}</span>
                </FilterChip>
              ))}
            </div>
          )}
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((item) => (
              <TemplateCard
                key={item.id}
                item={item}
                tenant={tenant}
                href={`${base}/${item.id}`}
                canEdit={canEdit}
              />
            ))}
          </ul>
        </>
      )}

      <CreateSheet
        open={creating}
        onOpenChange={setCreating}
        tenant={tenant}
        base={base}
        initialKind={filter === "ALL" ? "BADGE" : filter}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "focus-visible:outline-brand-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2",
        active
          ? "border-fg bg-fg text-surface"
          : "border-border-strong text-fg-muted hover:bg-hover hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

const THUMB_W = 260;
const THUMB_H = 190;

function TemplateCard({
  item,
  tenant,
  href,
  canEdit,
}: {
  item: LibraryItem;
  tenant: string;
  href: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const { page } = item.definition;
  const scale = Math.min(THUMB_W / page.width, THUMB_H / page.height);
  const K = KIND_UI[item.kind];

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(ok);
        router.refresh();
      } else toast.error(r.error ?? "Não foi possível concluir.");
    });

  return (
    <li className="group border-border bg-surface hover:border-border-strong relative flex flex-col overflow-hidden rounded-lg border transition-colors">
      <Link
        href={href}
        className="bg-surface-muted focus-visible:outline-brand-ring relative grid place-items-center outline-offset-[-2px] focus-visible:outline-2"
        style={{ height: THUMB_H + 40 }}
        aria-label={`Abrir ${item.name}`}
      >
        <div className="shadow-sm ring-1 ring-black/5 transition-transform duration-200 ease-out group-hover:-translate-y-0.5">
          <PagePreview tenant={tenant} definition={item.definition} scale={scale} lazy />
        </div>
      </Link>
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href={href} className="truncate font-medium hover:underline">
              {item.name}
            </Link>
            {item.isDefault && (
              <Badge tone="brand" size="sm">
                Padrão
              </Badge>
            )}
          </div>
          <p className="text-fg-subtle mt-1 flex flex-wrap items-center gap-x-2 text-sm">
            <span className="inline-flex items-center gap-1">
              <K.icon className="size-3.5" aria-hidden />
              {K.label}
            </span>
            <span aria-hidden>·</span>
            <span className="font-mono text-xs">{formatSize(page.width, page.height)}</span>
            <span aria-hidden>·</span>
            <span>
              v{item.version} · {dateFmt.format(new Date(item.updatedAt))}
            </span>
          </p>
          {item.project && <p className="text-fg-subtle mt-1 truncate text-xs">{item.project}</p>}
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Ações do modelo" loading={pending}>
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => router.push(href)}>
              <Pencil /> {canEdit ? "Editar" : "Ver"}
            </MenuItem>
            <MenuItem
              onSelect={() =>
                window.open(`/api/documents/${item.id}/render?format=pdf&download=1`, "_blank")
              }
            >
              <Download /> Baixar PDF de exemplo
            </MenuItem>
            {canEdit && (
              <>
                <MenuItem
                  onSelect={() =>
                    run(() => duplicateTemplate({ tenant, templateId: item.id }), "Modelo duplicado.")
                  }
                >
                  <Copy /> Duplicar
                </MenuItem>
                {!item.isDefault && (
                  <MenuItem
                    onSelect={() =>
                      run(
                        () => setDefaultTemplate({ tenant, templateId: item.id }),
                        `Agora é o ${K.label.toLowerCase()} padrão.`,
                      )
                    }
                  >
                    <Star /> Usar como padrão
                  </MenuItem>
                )}
                <MenuSeparator />
                <MenuItem tone="danger" onSelect={() => setConfirm(true)}>
                  <Trash2 /> Arquivar
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Arquivar “${item.name}”?`}
        description="O modelo some da biblioteca e deixa de ser usado no balcão e no totem. Os documentos já emitidos continuam registrados."
        confirmLabel="Arquivar modelo"
        tone="danger"
        loading={pending}
        onConfirm={() => {
          setConfirm(false);
          run(() => archiveTemplate({ tenant, templateId: item.id }), "Modelo arquivado.");
        }}
      />
    </li>
  );
}

function CreateSheet({
  open,
  onOpenChange,
  tenant,
  base,
  initialKind,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenant: string;
  base: string;
  initialKind: DocumentKind;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<DocumentKind>(initialKind);
  const [name, setName] = useState("");
  const [blank, setBlank] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const K = KIND_UI[kind];
  const start_ = K.starter && !blank ? K.starter : "BLANK";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await createTemplate({
        tenant,
        kind,
        name: name.trim() || `${K.label} ${new Date().getFullYear()}`,
        start: start_ as "BLANK",
      });
      if (r.ok) {
        onOpenChange(false);
        router.push(`${base}/${r.data.id}`);
      } else setError(r.fieldErrors?.name ?? r.error);
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Novo modelo"
      description="Escolha o tipo. Os modelos prontos já trazem a marca do cliente."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="new-template" loading={pending}>
            Criar e abrir o editor
          </Button>
        </div>
      }
    >
      <form id="new-template" onSubmit={submit} className="flex flex-col gap-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Tipo de documento</legend>
          <div className="grid grid-cols-2 gap-2">
            {KIND_ORDER.map((k) => {
              const it = KIND_UI[k];
              const active = k === kind;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setKind(k)}
                  className={cn(
                    "focus-visible:outline-brand-ring flex min-h-[72px] flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors focus-visible:outline-2",
                    active
                      ? "border-brand bg-brand-subtle"
                      : "border-border hover:border-border-strong hover:bg-hover",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <it.icon className={cn("size-4", active ? "text-brand-text" : "text-fg-subtle")} />
                    {it.label}
                  </span>
                  <span className="text-fg-subtle line-clamp-2 text-xs">{it.hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
        {K.starter && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Ponto de partida</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { blank: false, label: "Modelo pronto", hint: "Layout profissional para ajustar" },
                { blank: true, label: "Em branco", hint: "Página vazia no mesmo tamanho" },
              ].map((o) => (
                <button
                  key={String(o.blank)}
                  type="button"
                  aria-pressed={blank === o.blank}
                  onClick={() => setBlank(o.blank)}
                  className={cn(
                    "focus-visible:outline-brand-ring rounded-md border p-3 text-left transition-colors focus-visible:outline-2",
                    blank === o.blank
                      ? "border-brand bg-brand-subtle"
                      : "border-border hover:border-border-strong hover:bg-hover",
                  )}
                >
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="text-fg-subtle text-xs">{o.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <Field label="Nome do modelo" error={error}>
          {(ids) => (
          <Input
            id={ids.id}
            aria-describedby={ids.describedBy}
            aria-invalid={ids.invalid || undefined}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder={`${K.label} ${new Date().getFullYear()}`}
            maxLength={120}
          />
          )}
        </Field>
      </form>
    </Sheet>
  );
}
