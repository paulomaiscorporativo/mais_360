"use client";

import {
  AlertTriangle,
  Clock,
  EyeOff,
  Megaphone,
  Pin,
  PinOff,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { MURAL_STATE_LABEL, type MuralState, type SegmentAudience } from "@mais/core";
import { Badge, Button, EmptyState, Panel } from "@/components/ui";
import { Checkbox, Switch } from "@/components/ui/controls";
import { ConfirmDialog, Sheet } from "@/components/ui/overlay";
import {
  AudiencePicker,
  audienceLabel,
  type AudienceOptions,
} from "@/components/travel/audience-picker";
import { TextField, useRunAction } from "@/components/travel/kit";
import { cn } from "@/lib/cn";
import { deleteMuralPost, saveMuralPost, toggleMuralPost } from "./actions";

export type MuralRow = {
  id: string;
  title: string;
  message: string;
  audience: SegmentAudience;
  audienceId: string | null;
  urgent: boolean;
  pinned: boolean;
  active: boolean;
  publishAt: string;
  expiresAt: string;
  publishLabel: string;
  expiresLabel: string;
  author: string;
  state: MuralState;
};

type Edit = Pick<
  MuralRow,
  | "title"
  | "message"
  | "audience"
  | "audienceId"
  | "urgent"
  | "pinned"
  | "active"
  | "publishAt"
  | "expiresAt"
>;

const STATE_TONE: Record<MuralState, "success" | "info" | "neutral"> = {
  LIVE: "success",
  SCHEDULED: "info",
  EXPIRED: "neutral",
  HIDDEN: "neutral",
};

const BLANK: Edit = {
  title: "",
  message: "",
  audience: "ALL",
  audienceId: null,
  urgent: false,
  pinned: false,
  active: true,
  publishAt: "",
  expiresAt: "",
};

export function MuralManager({
  tenant,
  projectId,
  canEdit,
  posts,
  options,
}: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  posts: MuralRow[];
  options: AudienceOptions;
}) {
  const [edit, setEdit] = useState<{ id: string | null; data: Edit } | null>(null);
  const { run, pending } = useRunAction();
  const live = posts.filter((p) => p.state === "LIVE").length;

  const sheet = edit && (
    <PostSheet
      tenant={tenant}
      projectId={projectId}
      edit={edit}
      options={options}
      onClose={() => setEdit(null)}
    />
  );

  if (!posts.length)
    return (
      <>
        <EmptyState
          icon={<Megaphone />}
          title="Fale com o grupo pelo mural"
          description="Avisos de horário, troca de portão, código de vestimenta. Publique para todos, um grupo ou uma pessoa — e, se for urgente, avise também por e-mail e WhatsApp."
          action={
            canEdit && (
              <Button onClick={() => setEdit({ id: null, data: BLANK })}>
                <Plus /> Novo aviso
              </Button>
            )
          }
        />
        {sheet}
      </>
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-muted text-sm">
          <span className="tabular text-fg font-medium">{live}</span> no ar agora ·{" "}
          <span className="tabular">{posts.length}</span> no total. O viajante vê no portal só os
          avisos que são para ele.
        </p>
        {canEdit && (
          <Button onClick={() => setEdit({ id: null, data: BLANK })}>
            <Plus /> Novo aviso
          </Button>
        )}
      </div>

      <Panel>
        <ul className="divide-border divide-y">
          {posts.map((m) => (
            <li
              key={m.id}
              className={cn("flex gap-4 px-5 py-4", m.state !== "LIVE" && "bg-surface-muted/40")}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {m.pinned && <Pin className="text-brand-text size-3.5" aria-label="Fixado" />}
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setEdit({ id: m.id, data: m })}
                    className="text-left font-medium hover:underline disabled:cursor-default disabled:no-underline"
                  >
                    {m.title}
                  </button>
                  {m.urgent && (
                    <Badge tone="danger" size="sm">
                      <AlertTriangle className="size-3" /> Urgente
                    </Badge>
                  )}
                  <Badge tone={STATE_TONE[m.state]} size="sm" dot={m.state === "LIVE"}>
                    {MURAL_STATE_LABEL[m.state]}
                  </Badge>
                </div>
                <p className="text-fg-muted mt-1 line-clamp-2 text-sm whitespace-pre-line">
                  {m.message}
                </p>
                <div className="text-fg-subtle mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5" />
                    {audienceLabel(m.audience, m.audienceId, options)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {m.publishLabel}
                    {m.expiresLabel && ` até ${m.expiresLabel}`}
                  </span>
                  {m.author && <span>por {m.author}</span>}
                </div>
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-start gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending}
                    aria-label={m.pinned ? "Desafixar" : "Fixar no topo"}
                    onClick={() =>
                      run(() =>
                        toggleMuralPost({
                          tenant,
                          projectId,
                          id: m.id,
                          field: "pinned",
                          value: !m.pinned,
                        }),
                      )
                    }
                  >
                    {m.pinned ? <PinOff /> : <Pin />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending}
                    aria-label={m.active ? "Ocultar do portal" : "Mostrar no portal"}
                    onClick={() =>
                      run(
                        () =>
                          toggleMuralPost({
                            tenant,
                            projectId,
                            id: m.id,
                            field: "active",
                            value: !m.active,
                          }),
                        { success: m.active ? "Aviso ocultado." : "Aviso visível de novo." },
                      )
                    }
                  >
                    <EyeOff />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      {sheet}
    </div>
  );
}

function PostSheet({
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
  const [notify, setNotify] = useState(false);
  const [del, setDel] = useState(false);
  const { run, pending, errors } = useRunAction();
  const set = (k: "title" | "message" | "publishAt" | "expiresAt") => (v: string) =>
    setF((s) => ({ ...s, [k]: v }));
  const editId = edit.id;

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={editId ? "Editar aviso" : "Novo aviso"}
      footer={
        <>
          {editId && (
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
              run(() => saveMuralPost({ tenant, projectId, id: editId, ...f, notify }), {
                success: notify ? "Aviso publicado e enviado." : "Aviso salvo.",
                onSuccess: onClose,
              })
            }
          >
            {editId ? "Salvar" : "Publicar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Título"
          value={f.title}
          onChange={set("title")}
          error={errors.title}
          placeholder="Saída para o jantar às 19h30 no lobby"
          maxLength={140}
        />
        <TextField
          label="Mensagem"
          multiline
          rows={5}
          value={f.message}
          onChange={set("message")}
          error={errors.message}
          maxLength={4000}
        />
        <AudiencePicker
          audience={f.audience}
          audienceId={f.audienceId}
          options={options}
          error={errors.audience}
          onChange={(audience, audienceId) => setF((s) => ({ ...s, audience, audienceId }))}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Publicar em"
            optional
            type="datetime-local"
            value={f.publishAt}
            onChange={set("publishAt")}
            error={errors.publishAt}
            hint="Vazio publica agora."
          />
          <TextField
            label="Sai do ar em"
            optional
            type="datetime-local"
            value={f.expiresAt}
            onChange={set("expiresAt")}
            error={errors.expiresAt}
          />
        </div>
        <div className="border-border flex flex-col divide-y rounded-md border">
          <ToggleRow
            label="Urgente"
            hint="Destacado em vermelho no portal."
            checked={f.urgent}
            onChange={(v) => setF((s) => ({ ...s, urgent: v }))}
          />
          <ToggleRow
            label="Fixar no topo"
            checked={f.pinned}
            onChange={(v) => setF((s) => ({ ...s, pinned: v }))}
          />
          <ToggleRow
            label="Visível no portal"
            checked={f.active}
            onChange={(v) => setF((s) => ({ ...s, active: v }))}
          />
        </div>
        {f.audience !== "STAFF" && f.active && (
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={notify}
              onCheckedChange={(c) => setNotify(c === true)}
            />
            <span>
              <span className="font-medium">Avisar também por e-mail e WhatsApp</span>
              <span className="text-fg-subtle block">
                Cada pessoa recebe este aviso uma única vez, com o link do portal.
              </span>
            </span>
          </label>
        )}
      </div>
      {editId && (
        <ConfirmDialog
          open={del}
          onOpenChange={setDel}
          tone="danger"
          title={`Excluir o aviso "${f.title}"?`}
          description="Ele some do portal de todos os viajantes."
          confirmLabel="Excluir"
          loading={pending}
          onConfirm={() =>
            run(() => deleteMuralPost({ tenant, projectId, id: editId }), {
              success: "Aviso excluído.",
              onSuccess: onClose,
            })
          }
        />
      )}
    </Sheet>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-fg-subtle block">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
