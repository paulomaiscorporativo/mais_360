"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { describeSortSpec, type SortRow, type SortSpec } from "@mais/core/sorting";
import { Button, Notice } from "@/components/ui";
import { Switch } from "@/components/ui/controls";
import { toast } from "@/components/ui/toast";
import { saveProjectSorting, saveTenantSorting } from "@/server/sorting-actions";
import { SortPicker, SortPreview, type SortOptions } from "./sort-picker";

/**
 * "Ordenação das listas" nas configurações do cliente e do projeto. No projeto,
 * "usar o padrão do cliente" apaga a escolha própria e volta a herdar.
 */
export function SortingSettings(props: {
  tenant: string;
  /** Presente = configurações do projeto. */
  projectId?: string;
  /** Escolha própria deste nível (null = herda). */
  own: SortSpec | null;
  /** O que vale se não houver escolha própria. */
  inherited: SortSpec;
  inheritedFrom: string;
  inheritedWarnings?: string[];
  options: SortOptions;
  sample: readonly SortRow[];
  customLabels?: Record<string, string>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const isProject = !!props.projectId;
  const [inherit, setInherit] = useState(props.own === null);
  const [spec, setSpec] = useState<SortSpec>(props.own ?? props.inherited);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const change = (s: SortSpec) => {
    setSpec(s);
    setDirty(true);
  };

  function save() {
    start(async () => {
      const payload = { tenant: props.tenant, spec: inherit ? null : spec };
      const r = props.projectId
        ? await saveProjectSorting({ ...payload, projectId: props.projectId })
        : await saveTenantSorting(payload);
      if (r.ok) {
        setError(null);
        setDirty(false);
        toast.success("Ordenação salva.");
        router.refresh();
      } else {
        setError(r.error);
        toast.error(r.error);
      }
    });
  }

  const label = (f: SortSpec["levels"][number]["field"]) =>
    props.options.fields.find((x) => x.value === f)?.label ?? f;

  return (
    <div className="flex flex-col gap-4">
      <label className="border-border flex items-center justify-between gap-4 rounded-md border px-3 py-3">
        <span>
          <span className="text-sm font-medium">
            {isProject ? "Usar o padrão do cliente" : "Usar o padrão da plataforma"}
          </span>
          <span className="text-fg-subtle block text-xs">
            {props.inheritedFrom}: {describeSortSpec(props.inherited, props.customLabels)}
          </span>
        </span>
        <Switch
          checked={inherit}
          disabled={!props.canEdit}
          onCheckedChange={(v) => {
            setInherit(v);
            if (!v) setSpec(props.own ?? props.inherited);
            setDirty(true);
          }}
          aria-label={isProject ? "Usar o padrão do cliente" : "Usar o padrão da plataforma"}
        />
      </label>

      {inherit ? (
        <>
          {props.inheritedWarnings && props.inheritedWarnings.length > 0 && (
            <Notice tone="warning" title="O padrão herdado foi ajustado a este projeto">
              <ul className="list-disc pl-4">
                {props.inheritedWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Notice>
          )}
          <SortPreview spec={props.inherited} sample={props.sample} label={label} />
        </>
      ) : (
        <SortPicker
          value={spec}
          onChange={change}
          options={props.options}
          sample={props.sample}
          customLabels={props.customLabels}
          disabled={!props.canEdit}
        />
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      {props.canEdit ? (
        <div className="flex items-center gap-3">
          <Button onClick={save} loading={pending} disabled={!dirty}>
            Salvar ordenação
          </Button>
          {dirty && <span className="text-warning text-sm">Alterações não salvas</span>}
        </div>
      ) : (
        <p className="text-fg-subtle text-sm">Só gestores do cliente alteram a ordenação.</p>
      )}
    </div>
  );
}
