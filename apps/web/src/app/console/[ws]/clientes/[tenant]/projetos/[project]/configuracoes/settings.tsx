"use client";

import { Archive, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  PROJECT_FEATURES,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectFeature,
  type ProjectStatus,
} from "@mais/core";
import { Button, FormSection, Input, Notice } from "@/components/ui";
import { Select } from "@/components/ui/controls";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import {
  archiveProject,
  saveCategories,
  setProjectFeature,
  updateProject,
} from "../../../(gestao)/projetos/actions";
import { FeatureList, ProjectFields, type ProjectFormValue } from "../../../(gestao)/projetos/_components/project-form";
import { ImageUpload } from "../../../(gestao)/identidade/image-upload";

type Item = { id?: string; name: string; color: string };

const SWATCHES = ["#0f766e", "#1d4ed8", "#0369a1", "#65a30d", "#b45309", "#b91c1c", "#7c3aed", "#334155"];

export function ProjectSettingsForm(props: {
  ws: string;
  tenant: string;
  projectId: string;
  canEdit: boolean;
  canArchive: boolean;
  travel: boolean;
  status: ProjectStatus;
  bannerUrl: string | null;
  data: ProjectFormValue;
  enabled: ProjectFeature[];
  available: ProjectFeature[];
  requires: Partial<Record<ProjectFeature, string>>;
  categories: Item[];
  groups: Item[];
}) {
  const router = useRouter();
  const { tenant, projectId, canEdit } = props;
  const [data, setData] = useState(props.data);
  const [status, setStatus] = useState(props.status);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(() => new Set(props.enabled));
  const available = useMemo(() => new Set(props.available), [props.available]);
  const [archiving, setArchiving] = useState(false);
  const [pending, start] = useTransition();

  function saveData() {
    start(async () => {
      const r = await updateProject({ tenant, projectId, data, status });
      if (r.ok) {
        setErrors({});
        toast.success("Projeto atualizado.");
        router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
      }
    });
  }

  function toggle(f: ProjectFeature, on: boolean) {
    setEnabled((s) => {
      const n = new Set(s);
      if (on) n.add(f);
      else n.delete(f);
      return n;
    });
    start(async () => {
      const r = await setProjectFeature({ tenant, projectId, feature: f, enabled: on });
      if (r.ok) router.refresh();
      else {
        toast.error(r.error);
        setEnabled((s) => {
          const n = new Set(s);
          if (on) n.delete(f);
          else n.add(f);
          return n;
        });
      }
    });
  }

  return (
    <div className="max-w-4xl">
      <FormSection title="Dados do projeto" description="Nome, datas, fuso e local. O fuso vale para mensagens e crachás.">
        <ProjectFields value={data} onChange={setData} errors={errors} travel={props.travel} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Status</span>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as ProjectStatus)}
              options={PROJECT_STATUSES.filter((s) => s !== "ARCHIVED").map((s) => ({
                value: s,
                label: PROJECT_STATUS_LABELS[s],
              }))}
              disabled={!canEdit}
            />
          </div>
        </div>
        {canEdit && (
          <div>
            <Button onClick={saveData} loading={pending}>
              Salvar dados
            </Button>
          </div>
        )}
      </FormSection>

      <FormSection title="Arte do projeto" description="Banner exibido no formulário de inscrição e na área do participante.">
        <ImageUpload
          tenant={tenant}
          target="projectBanner"
          projectId={projectId}
          label="Banner"
          hint="Imagem horizontal, ao menos 1600 × 600 px."
          current={props.bannerUrl}
          aspect="banner"
          disabled={!canEdit}
        />
      </FormSection>

      <FormSection
        title={<span id="recursos">Recursos</span>}
        description="O menu do projeto mostra só o que está ligado. Desligar não apaga dados."
      >
        <FeatureList
          features={PROJECT_FEATURES}
          enabled={enabled}
          available={available}
          requires={props.requires}
          onToggle={toggle}
          disabled={!canEdit}
        />
      </FormSection>

      <FormSection
        title="Categorias de inscrição"
        description="Visitante, expositor, palestrante… A cor aparece no crachá e nos relatórios."
      >
        <LabelEditor tenant={tenant} projectId={projectId} kind="category" initial={props.categories} canEdit={canEdit} />
      </FormSection>

      <FormSection title="Grupos" description="Segmentação operacional: ônibus, turmas, cores de pulseira.">
        <LabelEditor tenant={tenant} projectId={projectId} kind="group" initial={props.groups} canEdit={canEdit} />
      </FormSection>

      {props.canArchive && (
        <FormSection title="Arquivar projeto" description="Some das listas e do menu. Os dados ficam guardados.">
          <div>
            <Button variant="danger-ghost" onClick={() => setArchiving(true)}>
              <Archive /> Arquivar projeto
            </Button>
          </div>
        </FormSection>
      )}

      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={`Arquivar “${props.data.name}”?`}
        description="O projeto sai das listas e o link de inscrição deixa de funcionar. Os dados são preservados."
        confirmLabel="Arquivar"
        tone="danger"
        loading={pending}
        onConfirm={() =>
          start(async () => {
            const r = await archiveProject({ tenant, projectId });
            if (r.ok) {
              toast.success("Projeto arquivado.");
              router.push(`/console/${props.ws}/clientes/${tenant}/projetos`);
            } else toast.error(r.error);
          })
        }
      />
    </div>
  );
}

function LabelEditor({
  tenant,
  projectId,
  kind,
  initial,
  canEdit,
}: {
  tenant: string;
  projectId: string;
  kind: "category" | "group";
  initial: Item[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(items) !== JSON.stringify(initial);

  const update = (i: number, patch: Partial<Item>) =>
    setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  function save() {
    setError(null);
    start(async () => {
      const r = await saveCategories({
        tenant,
        projectId,
        kind,
        items: items.filter((i) => i.name.trim()),
      });
      if (r.ok) {
        toast.success(kind === "category" ? "Categorias salvas." : "Grupos salvos.");
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && (
        <p className="text-fg-subtle text-sm">
          {kind === "category" ? "Nenhuma categoria ainda." : "Nenhum grupo ainda."}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={it.id ?? `new-${i}`} className="flex items-center gap-2">
            <ColorPicker value={it.color} onChange={(c) => update(i, { color: c })} disabled={!canEdit} />
            <Input
              value={it.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder={kind === "category" ? "Ex.: Expositor" : "Ex.: Ônibus 1"}
              maxLength={60}
              disabled={!canEdit}
              aria-label="Nome"
            />
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover ${it.name || "item"}`}
                onClick={() => setItems((l) => l.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && <Notice tone="danger">{error}</Notice>}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setItems((l) => [...l, { name: "", color: SWATCHES[l.length % SWATCHES.length]! }])}
          >
            <Plus /> Adicionar
          </Button>
          {dirty && (
            <Button size="sm" onClick={save} loading={pending}>
              Salvar
            </Button>
          )}
        </div>
      )}
      {dirty && initial.some((x) => !items.find((y) => y.id === x.id)) && (
        <p className="text-fg-subtle text-xs">
          Inscrições de itens removidos ficam sem {kind === "category" ? "categoria" : "grupo"}.
        </p>
      )}
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (c: string) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className="ring-border-strong relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-sm ring-1 ring-inset"
      style={{ background: value }}
    >
      <span className="sr-only">Cor</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}
