"use client";

import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ProjectSettings } from "@mais/core";
import { Button, Field, FormSection, Panel, Textarea } from "@/components/ui";
import { Select, Switch } from "@/components/ui/controls";
import { toast } from "@/components/ui/toast";
import { updateFormSettings } from "../../../(gestao)/projetos/actions";
import { CopyButton } from "../copy-button";

type Form = ProjectSettings["form"];

export function FormSettings(props: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  url: string;
  qrSvg: string;
  networking: boolean;
  initial: Form;
  categories: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(props.initial);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(props.initial);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  function save() {
    start(async () => {
      const r = await updateFormSettings({ tenant: props.tenant, projectId: props.projectId, form });
      if (r.ok) {
        toast.success("Formulário atualizado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const toggle = (k: "askCpf" | "requireCpf" | "askCompany" | "askJobTitle" | "askCity" | "askContactSharing", label: string, hint?: string) => (
    <label className="flex items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-base font-medium">{label}</span>
        {hint && <span className="text-fg-subtle block text-sm">{hint}</span>}
      </span>
      <Switch checked={form[k]} onCheckedChange={(v) => set(k, v)} disabled={!props.canEdit} />
    </label>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <FormSection title="Disponibilidade" description="Fechado, o link mostra um aviso em vez do formulário.">
          <label className="flex items-center justify-between gap-4">
            <span className="text-base font-medium">{form.open ? "Inscrições abertas" : "Inscrições fechadas"}</span>
            <Switch checked={form.open} onCheckedChange={(v) => set("open", v)} disabled={!props.canEdit} />
          </label>
        </FormSection>

        <FormSection title="Campos" description="Nome, e-mail e WhatsApp são sempre pedidos.">
          <div className="divide-border divide-y">
            {toggle("askCpf", "CPF", "Evita inscrição duplicada e permite login no totem.")}
            {form.askCpf && toggle("requireCpf", "CPF obrigatório")}
            {toggle("askCompany", "Empresa")}
            {toggle("askJobTitle", "Cargo")}
            {toggle("askCity", "Cidade e UF")}
            {props.networking &&
              toggle("askContactSharing", "Autorização de networking", "Pergunta se a pessoa autoriza compartilhar o contato ao ler o crachá (LGPD).")}
          </div>
        </FormSection>

        <FormSection title="Textos e categoria">
          <Field label="Boas-vindas" hint="Aparece no topo do formulário." optional>
            {(f) => (
              <Textarea id={f.id} rows={3} value={form.welcome} onChange={(e) => set("welcome", e.target.value)} disabled={!props.canEdit} />
            )}
          </Field>
          <Field label="Mensagem de confirmação" hint="Mostrada junto com o QR depois da inscrição." optional>
            {(f) => (
              <Textarea id={f.id} rows={2} value={form.successMessage} onChange={(e) => set("successMessage", e.target.value)} disabled={!props.canEdit} />
            )}
          </Field>
          <Field label="Categoria de quem se inscreve pelo link">
            {(f) => (
              <Select
                id={f.id}
                value={form.defaultCategoryId ?? "none"}
                onValueChange={(v) => set("defaultCategoryId", v === "none" ? null : v)}
                options={[{ value: "none", label: "Sem categoria" }, ...props.categories]}
                disabled={!props.canEdit}
              />
            )}
          </Field>
        </FormSection>

        {props.canEdit && (
          <div className="border-border sticky bottom-0 -mx-1 flex justify-end border-t bg-canvas/90 px-1 py-4 backdrop-blur">
            <Button onClick={save} loading={pending} disabled={!dirty}>
              Salvar formulário
            </Button>
          </div>
        )}
      </div>

      <Panel className="h-fit p-5 lg:sticky lg:top-6">
        <p className="text-sm font-semibold">Divulgação</p>
        <p className="text-fg-subtle mt-1 text-sm">Use o link em e-mails e o QR em cartazes e telas do evento.</p>
        <div
          className="mx-auto mt-5 w-44 rounded-md bg-white p-3 [&_svg]:h-auto [&_svg]:w-full"
          aria-label="QR code do formulário"
          role="img"
          dangerouslySetInnerHTML={{ __html: props.qrSvg }}
        />
        <code className="bg-surface-muted text-fg-muted mt-5 block truncate rounded-sm px-3 py-2 font-mono text-xs">
          {props.url}
        </code>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton value={props.url} />
          <Button variant="ghost" size="sm" asChild>
            <a href={props.url} target="_blank" rel="noreferrer">
              <ExternalLink /> Abrir
            </a>
          </Button>
        </div>
      </Panel>
    </div>
  );
}
