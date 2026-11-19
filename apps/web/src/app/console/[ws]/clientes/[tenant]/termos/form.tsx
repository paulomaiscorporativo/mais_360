"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { updateTerms } from "@/app/console/[ws]/actions";
import { TermsFields } from "../../_components/terms-fields";

export function TermsForm({
  tenant,
  initial,
  canEdit,
}: {
  tenant: string;
  initial: Record<string, string>;
  canEdit: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(saved) !== JSON.stringify(value);

  function save() {
    start(async () => {
      const r = await updateTerms({ tenant, terms: value });
      if (r.ok) {
        setSaved(value);
        toast.success("Nomenclatura salva.");
      } else toast.error(r.error);
    });
  }

  return (
    <div className="max-w-3xl">
      <p className="text-fg-muted mb-6 text-base">
        Estes nomes substituem os termos genéricos em todas as telas, e-mails e documentos do
        cliente. Exemplo: “{value["member.plural"] || "Membros"} cadastrados”.
      </p>
      <fieldset disabled={!canEdit}>
        <TermsFields value={value} onChange={setValue} />
      </fieldset>
      {canEdit && (
        <div className="border-border mt-8 flex justify-end gap-2 border-t pt-5">
          <Button variant="ghost" onClick={() => setValue(saved)} disabled={!dirty || pending}>
            Descartar
          </Button>
          <Button onClick={save} disabled={!dirty} loading={pending}>
            Salvar nomenclatura
          </Button>
        </div>
      )}
    </div>
  );
}
