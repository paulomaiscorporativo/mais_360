"use client";

import { ListChecks, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { TASK_STATUS_LABEL, type TaskStatus } from "@mais/core";
import { Badge, Button, EmptyState, Panel } from "@/components/ui";
import { Checkbox, Select } from "@/components/ui/controls";
import { ConfirmDialog, Sheet } from "@/components/ui/overlay";
import { TextField, useRunAction } from "@/components/travel/kit";
import { cn } from "@/lib/cn";
import { deleteChecklistItem, saveChecklistItem, setChecklistStatus } from "./actions";

export type ChecklistRow = {
  id: string;
  subject: string;
  category: string;
  responsible: string;
  startDate: string;
  dueDate: string;
  dueLabel: string;
  status: TaskStatus;
  effective: TaskStatus;
  notes: string;
  history: { at: string; by: string; from: TaskStatus; to: TaskStatus }[];
};

const TONE: Record<TaskStatus, "neutral" | "info" | "success" | "danger" | "warning"> = {
  PENDING: "neutral",
  IN_PROGRESS: "info",
  DONE: "success",
  LATE: "danger",
  CANCELED: "neutral",
};

type Filter = "OPEN" | "LATE" | "DONE" | "ALL";

export function ChecklistManager({
  tenant,
  projectId,
  canEdit,
  items,
}: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  items: ChecklistRow[];
}) {
  const [filter, setFilter] = useState<Filter>("OPEN");
  const [cat, setCat] = useState("ALL");
  const [edit, setEdit] = useState<ChecklistRow | "new" | null>(null);
  const { run } = useRunAction();

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(),
    [items],
  );
  const counts = {
    OPEN: items.filter((i) => !["DONE", "CANCELED"].includes(i.effective)).length,
    LATE: items.filter((i) => i.effective === "LATE").length,
    DONE: items.filter((i) => i.effective === "DONE").length,
    ALL: items.length,
  };
  const shown = items.filter(
    (i) =>
      (cat === "ALL" || i.category === cat) &&
      (filter === "ALL" ||
        (filter === "OPEN" && !["DONE", "CANCELED"].includes(i.effective)) ||
        (filter === "LATE" && i.effective === "LATE") ||
        (filter === "DONE" && i.effective === "DONE")),
  );
  const pct = items.length ? Math.round((counts.DONE / items.length) * 100) : 0;

  if (!items.length)
    return (
      <>
        <EmptyState
          icon={<ListChecks />}
          title="Crie o checklist operacional"
          description="Emissões, reservas, seguros, vistos, briefings: tudo com responsável e prazo. O que passar do prazo aparece como atrasado."
          action={
            canEdit && (
              <Button onClick={() => setEdit("new")}>
                <Plus /> Nova tarefa
              </Button>
            )
          }
        />
        {edit && (
          <TaskSheet
            tenant={tenant}
            projectId={projectId}
            item={null}
            categories={categories}
            onClose={() => setEdit(null)}
          />
        )}
      </>
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="bg-surface-sunken h-2 w-40 overflow-hidden rounded-full">
            <div className="bg-success h-full rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-fg-muted tabular text-sm">
            {counts.DONE}/{items.length} concluídas
          </span>
          {counts.LATE > 0 && (
            <Badge tone="danger" dot>
              {counts.LATE} atrasada{counts.LATE === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        {canEdit && (
          <Button onClick={() => setEdit("new")}>
            <Plus /> Nova tarefa
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["OPEN", "Em aberto"],
            ["LATE", "Atrasadas"],
            ["DONE", "Concluídas"],
            ["ALL", "Todas"],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              filter === k
                ? "border-brand bg-brand-subtle text-brand-subtle-fg"
                : "border-border text-fg-muted hover:bg-hover",
            )}
          >
            {label} <span className="tabular opacity-70">{counts[k]}</span>
          </button>
        ))}
        {categories.length > 0 && (
          <div className="ml-auto w-48">
            <Select
              value={cat}
              onValueChange={setCat}
              options={[
                { value: "ALL", label: "Todas as categorias" },
                ...categories.map((c) => ({ value: c, label: c })),
              ]}
            />
          </div>
        )}
      </div>

      <Panel>
        {shown.length === 0 ? (
          <p className="text-fg-subtle px-5 py-8 text-center text-sm">
            Nada por aqui neste filtro.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {shown.map((i) => {
              const done = i.effective === "DONE";
              return (
                <li key={i.id} className="flex items-start gap-3 px-5 py-3">
                  <Checkbox
                    className="mt-0.5"
                    disabled={!canEdit || i.effective === "CANCELED"}
                    checked={done}
                    aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
                    onCheckedChange={(c) =>
                      run(() =>
                        setChecklistStatus({
                          tenant,
                          projectId,
                          id: i.id,
                          status: c === true ? "DONE" : "PENDING",
                        }),
                      )
                    }
                  />
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setEdit(i)}
                    className="min-w-0 flex-1 text-left disabled:cursor-default"
                  >
                    <div className={cn("text-base", done && "text-fg-subtle line-through")}>
                      {i.subject}
                    </div>
                    <div className="text-fg-subtle mt-0.5 flex flex-wrap gap-x-3 text-sm">
                      {i.category && <span>{i.category}</span>}
                      {i.responsible && <span>{i.responsible}</span>}
                      {i.dueLabel && (
                        <span className={cn(i.effective === "LATE" && "text-danger font-medium")}>
                          até {i.dueLabel}
                        </span>
                      )}
                    </div>
                  </button>
                  {!done && i.effective !== "PENDING" && (
                    <Badge tone={TONE[i.effective]} size="sm">
                      {TASK_STATUS_LABEL[i.effective]}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {edit && (
        <TaskSheet
          tenant={tenant}
          projectId={projectId}
          item={edit === "new" ? null : edit}
          categories={categories}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

function TaskSheet({
  tenant,
  projectId,
  item,
  categories,
  onClose,
}: {
  tenant: string;
  projectId: string;
  item: ChecklistRow | null;
  categories: string[];
  onClose: () => void;
}) {
  const [f, setF] = useState({
    subject: item?.subject ?? "",
    category: item?.category ?? "",
    responsible: item?.responsible ?? "",
    startDate: item?.startDate ?? "",
    dueDate: item?.dueDate ?? "",
    status: (item?.status ?? "PENDING") as TaskStatus,
    notes: item?.notes ?? "",
  });
  const [del, setDel] = useState(false);
  const { run, pending, errors } = useRunAction();
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={item ? "Editar tarefa" : "Nova tarefa"}
      footer={
        <>
          {item && (
            <Button variant="danger-ghost" className="md:mr-auto" onClick={() => setDel(true)}>
              <Trash2 /> Excluir
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              run(() => saveChecklistItem({ tenant, projectId, id: item?.id ?? null, ...f }), {
                success: "Tarefa salva.",
                onSuccess: onClose,
              })
            }
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Tarefa"
          value={f.subject}
          onChange={set("subject")}
          error={errors.subject}
          placeholder="Emitir seguro viagem do grupo"
        />
        <datalist id="checklist-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Categoria"
            optional
            value={f.category}
            onChange={set("category")}
            list="checklist-categories"
            placeholder="Aéreo, Hotel, Docs…"
          />
          <TextField
            label="Responsável"
            optional
            value={f.responsible}
            onChange={set("responsible")}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Início"
            optional
            type="date"
            value={f.startDate}
            onChange={set("startDate")}
          />
          <TextField
            label="Prazo"
            optional
            type="date"
            value={f.dueDate}
            onChange={set("dueDate")}
            error={errors.dueDate}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Status</span>
          <Select
            value={f.status === "LATE" ? "PENDING" : f.status}
            onValueChange={(v) => setF((s) => ({ ...s, status: v as TaskStatus }))}
            options={(["PENDING", "IN_PROGRESS", "DONE", "CANCELED"] as TaskStatus[]).map((s) => ({
              value: s,
              label: TASK_STATUS_LABEL[s],
            }))}
          />
        </div>
        <TextField label="Observações" optional multiline value={f.notes} onChange={set("notes")} />
        {item && item.history.length > 0 && (
          <div>
            <span className="text-sm font-medium">Histórico</span>
            <ul className="text-fg-subtle mt-2 flex flex-col gap-1 text-sm">
              {item.history.map((h, i) => (
                <li key={i}>
                  {h.at} · {h.by}: {TASK_STATUS_LABEL[h.from]} → {TASK_STATUS_LABEL[h.to]}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        tone="danger"
        title="Excluir esta tarefa?"
        confirmLabel="Excluir"
        loading={pending}
        onConfirm={() =>
          run(() => deleteChecklistItem({ tenant, projectId, id: item!.id }), {
            success: "Tarefa excluída.",
            onSuccess: onClose,
          })
        }
      />
    </Sheet>
  );
}
