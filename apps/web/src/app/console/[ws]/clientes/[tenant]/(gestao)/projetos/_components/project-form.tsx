"use client";

import { Lock } from "lucide-react";
import { PROJECT_FEATURE_LABELS, type ProjectFeature } from "@mais/core";
import { Field, Input, Textarea } from "@/components/ui";
import { Select, Switch } from "@/components/ui/controls";
import { TIMEZONES } from "@/config/terms";
import { cn } from "@/lib/cn";

export type ProjectFormValue = {
  name: string;
  code: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venueName: string;
  venueAddress: string;
  destination: string;
};

export function emptyProjectForm(timezone: string): ProjectFormValue {
  return {
    name: "",
    code: "",
    description: "",
    startsAt: "",
    endsAt: "",
    timezone,
    venueName: "",
    venueAddress: "",
    destination: "",
  };
}

export function ProjectFields({
  value,
  onChange,
  errors = {},
  travel,
}: {
  value: ProjectFormValue;
  onChange: (v: ProjectFormValue) => void;
  errors?: Record<string, string>;
  /** Mostra "Destino" (viagens) além de local/endereço. */
  travel: boolean;
}) {
  const set = (k: keyof ProjectFormValue) => (e: { target: { value: string } }) =>
    onChange({ ...value, [k]: e.target.value });
  const err = (k: string) => errors[`data.${k}`] ?? errors[k];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nome do projeto" error={err("name")} className="sm:col-span-2">
        {(f) => (
          <Input
            id={f.id}
            aria-describedby={f.describedBy}
            aria-invalid={f.invalid}
            value={value.name}
            onChange={set("name")}
            placeholder="Convenção Nacional 2026"
            autoFocus
            maxLength={120}
          />
        )}
      </Field>
      <Field label="Início" error={err("startsAt")} optional>
        {(f) => (
          <Input id={f.id} type="date" value={value.startsAt} onChange={set("startsAt")} aria-invalid={f.invalid} />
        )}
      </Field>
      <Field label="Fim" error={err("endsAt")} optional>
        {(f) => (
          <Input
            id={f.id}
            type="date"
            value={value.endsAt}
            min={value.startsAt || undefined}
            onChange={set("endsAt")}
            aria-invalid={f.invalid}
            aria-describedby={f.describedBy}
          />
        )}
      </Field>
      <Field
        label="Fuso horário"
        hint="Horários de mensagens, crachás e roteiro seguem este fuso."
        className="sm:col-span-2"
      >
        {(f) => (
          <Select
            id={f.id}
            value={value.timezone}
            onValueChange={(tz) => onChange({ ...value, timezone: tz })}
            options={TIMEZONES.map((t) => ({ value: t.value, label: t.label }))}
          />
        )}
      </Field>
      {travel && (
        <Field label="Destino" optional className="sm:col-span-2">
          {(f) => (
            <Input id={f.id} value={value.destination} onChange={set("destination")} placeholder="Lisboa, Portugal" />
          )}
        </Field>
      )}
      <Field label="Local" optional>
        {(f) => <Input id={f.id} value={value.venueName} onChange={set("venueName")} placeholder="Casa Bizutt" />}
      </Field>
      <Field label="Endereço" optional>
        {(f) => (
          <Input id={f.id} value={value.venueAddress} onChange={set("venueAddress")} placeholder="Rua do Ator, 577 · São Paulo" />
        )}
      </Field>
      <Field label="Código interno" hint="Ordem de serviço, centro de custo…" optional>
        {(f) => <Input id={f.id} value={value.code} onChange={set("code")} className="font-mono" maxLength={40} />}
      </Field>
      <Field label="Descrição" optional className="sm:col-span-2">
        {(f) => (
          <Textarea id={f.id} value={value.description} onChange={set("description")} rows={3} />
        )}
      </Field>
    </div>
  );
}

/** Lista de recursos com switches; recurso sem módulo contratado aparece travado com explicação. */
export function FeatureList({
  features,
  enabled,
  available,
  requires,
  onToggle,
  disabled,
}: {
  features: readonly ProjectFeature[];
  enabled: ReadonlySet<ProjectFeature>;
  available: ReadonlySet<ProjectFeature>;
  requires: Partial<Record<ProjectFeature, string>>;
  onToggle: (f: ProjectFeature, on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="border-border divide-border bg-surface divide-y overflow-hidden rounded-md border">
      {features.map((f) => {
        const ok = available.has(f);
        const id = `feat-${f}`;
        return (
          <li key={f} className={cn("flex items-center gap-4 px-4 py-3", !ok && "bg-surface-muted")}>
            <label htmlFor={id} className={cn("min-w-0 flex-1", ok ? "cursor-pointer" : "cursor-default")}>
              <span className={cn("block text-base font-medium", !ok && "text-fg-subtle")}>
                {PROJECT_FEATURE_LABELS[f].label}
              </span>
              <span className="text-fg-subtle block text-sm">
                {ok ? (
                  PROJECT_FEATURE_LABELS[f].summary
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Lock className="size-3" /> Requer o módulo {requires[f] ?? "correspondente"}
                  </span>
                )}
              </span>
            </label>
            <Switch
              id={id}
              checked={ok && enabled.has(f)}
              disabled={!ok || disabled}
              onCheckedChange={(on) => onToggle(f, on)}
              aria-label={PROJECT_FEATURE_LABELS[f].label}
            />
          </li>
        );
      })}
    </ul>
  );
}
