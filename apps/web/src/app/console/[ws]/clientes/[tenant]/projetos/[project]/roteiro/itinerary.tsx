"use client";

import { CalendarRange, Check, MapPin, Plus, Trash2, User, Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { SegmentAudience, TaskStatus } from "@mais/core";
import { Badge, Button, EmptyState } from "@/components/ui";
import { ConfirmDialog, Sheet } from "@/components/ui/overlay";
import {
  AudiencePicker,
  audienceLabel,
  type AudienceOptions,
} from "@/components/travel/audience-picker";
import { TextField, useRunAction } from "@/components/travel/kit";
import { cn } from "@/lib/cn";
import { deleteItineraryItem, saveItineraryItem, setItineraryStatus } from "./actions";

export type ItineraryRow = {
  id: string;
  date: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  title: string;
  location: string;
  responsible: string;
  notes: string;
  status: TaskStatus;
  audience: SegmentAudience;
  audienceId: string | null;
};

type Edit = Omit<ItineraryRow, "id" | "dayLabel" | "status">;

export function ItineraryManager({
  tenant,
  projectId,
  canEdit,
  items,
  options,
  defaultDate,
}: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  items: ItineraryRow[];
  options: AudienceOptions;
  defaultDate: string;
}) {
  const [edit, setEdit] = useState<{ id: string | null; data: Edit } | null>(null);
  const { run } = useRunAction();
  const days = useMemo(() => {
    const m = new Map<string, ItineraryRow[]>();
    for (const i of items) m.set(i.dayLabel, [...(m.get(i.dayLabel) ?? []), i]);
    return [...m];
  }, [items]);

  const blank = (date = defaultDate): Edit => ({
    date,
    startTime: "",
    endTime: "",
    title: "",
    location: "",
    responsible: "",
    notes: "",
    audience: "ALL",
    audienceId: null,
  });

  if (!items.length)
    return (
      <>
        <EmptyState
          icon={<CalendarRange />}
          title="Monte o roteiro dia a dia"
          description="Tempos e movimentos da viagem: traslados, atividades, jantares. Cada item pode ser para todos, só a equipe ou um grupo — o viajante vê só o que é dele."
          action={
            canEdit && (
              <Button onClick={() => setEdit({ id: null, data: blank() })}>
                <Plus /> Nova atividade
              </Button>
            )
          }
        />
        {edit && (
          <ItemSheet
            tenant={tenant}
            projectId={projectId}
            edit={edit}
            options={options}
            onClose={() => setEdit(null)}
          />
        )}
      </>
    );

  return (
    <div className="flex flex-col gap-8">
      {canEdit && (
        <div className="flex justify-end">
          <Button
            onClick={() => setEdit({ id: null, data: blank(items.at(-1)?.date || defaultDate) })}
          >
            <Plus /> Nova atividade
          </Button>
        </div>
      )}
      {days.map(([day, list], di) => (
        <section key={day} className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)] md:gap-8">
          <header className="md:sticky md:top-6 md:self-start">
            <div className="text-fg-subtle text-xs font-semibold">Dia {di + 1}</div>
            <div className="text-md font-semibold capitalize">{day}</div>
            {canEdit && list[0]?.date && (
              <Button
                variant="link"
                size="sm"
                className="mt-1"
                onClick={() => setEdit({ id: null, data: blank(list[0]!.date) })}
              >
                <Plus /> Adicionar neste dia
              </Button>
            )}
          </header>
          <ol className="border-border relative flex flex-col gap-1 border-l pl-5">
            {list.map((i) => {
              const done = i.status === "DONE";
              const canceled = i.status === "CANCELED";
              return (
                <li key={i.id} className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-4 -left-[25px] size-2.5 rounded-full border-2",
                      done ? "border-success bg-success" : "border-border-strong bg-surface",
                    )}
                  />
                  <div
                    className={cn(
                      "group hover:bg-hover flex gap-4 rounded-md px-3 py-2.5",
                      canceled && "opacity-50",
                    )}
                  >
                    <div className="w-16 shrink-0 pt-0.5 text-sm font-medium tabular-nums">
                      {i.startTime || "—"}
                      {i.endTime && <div className="text-fg-subtle text-xs">{i.endTime}</div>}
                    </div>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left disabled:cursor-default"
                      disabled={!canEdit}
                      onClick={() => setEdit({ id: i.id, data: i })}
                    >
                      <div className={cn("font-medium", canceled && "line-through")}>{i.title}</div>
                      <div className="text-fg-subtle mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                        {i.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5" />
                            {i.location}
                          </span>
                        )}
                        {i.responsible && (
                          <span className="inline-flex items-center gap-1">
                            <User className="size-3.5" />
                            {i.responsible}
                          </span>
                        )}
                        {i.audience !== "ALL" && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="size-3.5" />
                            {audienceLabel(i.audience, i.audienceId, options)}
                          </span>
                        )}
                      </div>
                      {i.notes && (
                        <p className="text-fg-muted mt-1 text-sm whitespace-pre-line">{i.notes}</p>
                      )}
                    </button>
                    {canEdit && !canceled && (
                      <Button
                        variant={done ? "subtle" : "ghost"}
                        size="icon-sm"
                        aria-label={done ? "Marcar como pendente" : "Marcar como concluída"}
                        onClick={() =>
                          run(() =>
                            setItineraryStatus({
                              tenant,
                              projectId,
                              id: i.id,
                              status: done ? "PENDING" : "DONE",
                            }),
                          )
                        }
                      >
                        <Check />
                      </Button>
                    )}
                    {canceled && <Badge size="sm">Cancelada</Badge>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {edit && (
        <ItemSheet
          tenant={tenant}
          projectId={projectId}
          edit={edit}
          options={options}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

function ItemSheet({
  tenant,
  projectId,
  edit,
  options,
  onClose,
}: {
  tenant: string;
  projectId: string;
  edit: { id: string | null; data: Edit };
  options: AudienceOptions;
  onClose: () => void;
}) {
  const [f, setF] = useState<Edit>(edit.data);
  const [del, setDel] = useState(false);
  const { run, pending, errors } = useRunAction();
  const set = (k: keyof Edit) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={edit.id ? "Editar atividade" : "Nova atividade"}
      footer={
        <>
          {edit.id && (
            <>
              <Button variant="danger-ghost" className="md:mr-auto" onClick={() => setDel(true)}>
                <Trash2 /> Excluir
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              run(() => saveItineraryItem({ tenant, projectId, id: edit.id, ...f }), {
                success: "Roteiro atualizado.",
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
          label="Atividade"
          value={f.title}
          onChange={set("title")}
          error={errors.title}
          placeholder="Traslado aeroporto → hotel"
        />
        <div className="grid grid-cols-[minmax(0,1fr)_96px_96px] gap-3">
          <TextField
            label="Dia"
            type="date"
            value={f.date}
            onChange={set("date")}
            error={errors.date}
          />
          <TextField label="Início" type="time" value={f.startTime} onChange={set("startTime")} />
          <TextField
            label="Fim"
            type="time"
            value={f.endTime}
            onChange={set("endTime")}
            error={errors.endTime}
          />
        </div>
        <TextField label="Local" optional value={f.location} onChange={set("location")} />
        <TextField
          label="Responsável"
          optional
          value={f.responsible}
          onChange={set("responsible")}
        />
        <AudiencePicker
          audience={f.audience}
          audienceId={f.audienceId}
          options={options}
          error={errors.audience}
          onChange={(audience, audienceId) => setF((s) => ({ ...s, audience, audienceId }))}
        />
        <TextField
          label="Detalhes"
          optional
          multiline
          value={f.notes}
          onChange={set("notes")}
          hint="O viajante vê este texto no portal."
        />
        {edit.id && (
          <Button
            variant="secondary"
            onClick={() =>
              run(
                () => setItineraryStatus({ tenant, projectId, id: edit.id!, status: "CANCELED" }),
                {
                  success: "Atividade marcada como cancelada.",
                  onSuccess: onClose,
                },
              )
            }
          >
            Marcar como cancelada
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        tone="danger"
        title="Excluir esta atividade?"
        confirmLabel="Excluir"
        loading={pending}
        onConfirm={() =>
          run(() => deleteItineraryItem({ tenant, projectId, id: edit.id! }), {
            success: "Atividade excluída.",
            onSuccess: onClose,
          })
        }
      />
    </Sheet>
  );
}
