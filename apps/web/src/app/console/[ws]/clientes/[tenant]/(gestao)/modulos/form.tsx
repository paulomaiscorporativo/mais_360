"use client";

import { Info } from "lucide-react";
import { useState, useTransition } from "react";
import { MODULES, type ModuleKey } from "@mais/core";
import { Button, Notice } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { updateModules } from "@/app/console/[ws]/actions";
import { ModulePicker } from "../../../_components/module-picker";

export function ModulesForm({
  tenant,
  allowed,
  initial,
  canEdit,
  expired,
}: {
  tenant: string;
  allowed: ModuleKey[];
  initial: ModuleKey[];
  canEdit: boolean;
  expired: ModuleKey[];
}) {
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = value.length !== saved.length || value.some((m) => !saved.includes(m));

  const removed = saved.filter((m) => !value.includes(m));

  function save() {
    start(async () => {
      const r = await updateModules({ tenant, modules: value });
      if (r.ok) {
        setSaved(r.data.modules);
        setValue(r.data.modules);
        toast.success("Módulos atualizados.");
      } else toast.error(r.error);
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      {!canEdit && (
        <Notice tone="info" icon={<Info />} title="Somente leitura">
          A liberação de módulos é feita por quem administra o assinante.
        </Notice>
      )}
      {expired.length > 0 && (
        <Notice tone="warning" title="Vigência encerrada">
          {expired.map((m) => MODULES[m].name).join(", ")} venceu e está desligado até a renovação.
        </Notice>
      )}
      <ModulePicker value={value} onChange={setValue} allowed={allowed} disabled={!canEdit} />
      {canEdit && dirty && (
        <div className="border-border bg-surface-raised shadow-pop sticky bottom-16 z-10 flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between md:bottom-4">
          <p className="text-fg-muted px-1 text-sm">
            {removed.length > 0
              ? `Ao salvar, ${removed.map((m) => MODULES[m].name).join(", ")} deixa de aparecer para o cliente. Os dados são preservados.`
              : "Alterações não salvas."}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setValue(saved)} disabled={pending}>
              Descartar
            </Button>
            <Button onClick={save} loading={pending}>
              Salvar módulos
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
