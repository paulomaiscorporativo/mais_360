"use client";

import { FileText, Printer, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BatchSortBar } from "@/components/sorting/batch-sort-bar";
import type { SortOptions } from "@/components/sorting/sort-picker";
import { Button, EmptyState, Field } from "@/components/ui";
import { Select } from "@/components/ui/controls";
import type { SortRow, SortSpec } from "@mais/core/sorting";

type Scope = "ACTIVE" | "CONFIRMED" | "ALL";

const SCOPE_LABEL: Record<Scope, string> = {
  ACTIVE: "Inscrições ativas (sem as canceladas)",
  CONFIRMED: "Só confirmadas",
  ALL: "Todas, inclusive canceladas",
};

export function BatchDocuments(props: {
  generateHref: string;
  libraryHref: string;
  registrationsHref: string;
  templates: { id: string; label: string }[];
  counts: Record<Scope, number>;
  sorting: {
    defaultSpec: SortSpec;
    sourceLabel: string;
    warnings: string[];
    options: SortOptions;
    customLabels: Record<string, string>;
    sample: SortRow[];
  };
}) {
  const [template, setTemplate] = useState(props.templates[0]?.id ?? "");
  const [scope, setScope] = useState<Scope>("ACTIVE");
  const [format, setFormat] = useState<"model" | "pdf" | "thermal">("model");

  if (!props.templates.length)
    return (
      <EmptyState
        icon={<FileText />}
        title="Crie um modelo de crachá ou etiqueta"
        description="Os documentos em lote usam os modelos da biblioteca do cliente (crachá, etiqueta, certificado)."
        action={
          <Button asChild>
            <Link href={props.libraryHref}>Abrir a biblioteca de documentos</Link>
          </Button>
        }
      />
    );

  if (!props.counts.ALL)
    return (
      <EmptyState
        icon={<Users />}
        title="Ainda não há inscrições"
        description="Importe uma planilha ou adicione pessoas para gerar crachás, etiquetas e o relatório de QR Code."
        action={
          <Button asChild>
            <Link href={props.registrationsHref}>Ir para as inscrições</Link>
          </Button>
        }
      />
    );

  const count = props.counts[scope];
  const qs = new URLSearchParams({ modelo: template, situacao: scope });
  if (format !== "model") qs.set("formato", format);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h2 className="text-md font-semibold">Documentos em lote</h2>
        <p className="text-fg-subtle mt-1 text-sm">
          Crachás, etiquetas e relatório de QR Code de várias inscrições num arquivo só, na ordem
          escolhida.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Modelo">
          {({ id }) => (
            <Select
              id={id}
              value={template}
              onValueChange={setTemplate}
              options={props.templates.map((t) => ({ value: t.id, label: t.label }))}
            />
          )}
        </Field>
        <Field label="Quem entra" hint={`${count} ${count === 1 ? "inscrição" : "inscrições"}`}>
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={scope}
              onValueChange={(v) => setScope(v as Scope)}
              options={(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => ({
                value: s,
                label: SCOPE_LABEL[s],
              }))}
            />
          )}
        </Field>
        <Field label="Formato">
          {({ id }) => (
            <Select
              id={id}
              value={format}
              onValueChange={(v) => setFormat(v as typeof format)}
              options={[
                { value: "model", label: "O do modelo" },
                { value: "pdf", label: "PDF" },
                { value: "thermal", label: "Impressora térmica (HTML)" },
              ]}
            />
          )}
        </Field>
      </div>

      {count > 1000 && (
        <p className="text-warning text-sm" role="status">
          São mais de 1.000 inscrições: o arquivo leva só as 1.000 primeiras na ordem escolhida.
        </p>
      )}

      <BatchSortBar
        {...props.sorting}
        links={
          count
            ? [
                {
                  label: "Gerar documentos",
                  href: `${props.generateHref}?${qs.toString()}`,
                  icon: <Printer />,
                  variant: "primary",
                  newTab: true,
                },
              ]
            : []
        }
      />
      {!count && (
        <p className="text-fg-subtle text-sm">Nenhuma inscrição nesta situação. Escolha outra.</p>
      )}
    </div>
  );
}
