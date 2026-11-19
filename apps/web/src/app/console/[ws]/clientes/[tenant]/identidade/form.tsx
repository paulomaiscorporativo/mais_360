"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { updateBranding } from "@/app/console/[ws]/actions";
import { BrandFields, BrandPreview, type BrandValue } from "../../_components/brand-editor";

export function BrandForm({
  tenant,
  name,
  initial,
  canEdit,
  whiteLabel,
}: {
  tenant: string;
  name: string;
  initial: BrandValue;
  canEdit: boolean;
  whiteLabel: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(saved) !== JSON.stringify(value);

  function save() {
    start(async () => {
      const r = await updateBranding({ tenant, branding: value });
      if (r.ok) {
        setSaved(value);
        toast.success("Identidade visual salva.", {
          description: "Já vale para portal, convites e e-mails.",
        });
      } else toast.error(r.error);
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] xl:gap-12">
      <fieldset disabled={!canEdit} className="min-w-0">
        <BrandFields value={value} onChange={setValue} allowProductToggle={!whiteLabel} />
        {canEdit && (
          <div className="border-border mt-8 flex justify-end gap-2 border-t pt-5">
            <Button variant="ghost" onClick={() => setValue(saved)} disabled={!dirty || pending}>
              Descartar
            </Button>
            <Button onClick={save} disabled={!dirty} loading={pending}>
              Salvar identidade
            </Button>
          </div>
        )}
      </fieldset>
      <aside>
        <div className="sticky top-10 flex flex-col gap-3">
          <span className="text-fg-subtle text-xs font-medium">Pré-visualização</span>
          <BrandPreview name={name} value={value} />
        </div>
      </aside>
    </div>
  );
}
