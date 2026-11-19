"use client";

import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { CABIN_CLASS_LABELS, CABIN_CLASSES } from "@mais/core";
import {
  APPROVAL_MODE_HINTS,
  APPROVAL_MODE_LABELS,
  APPROVAL_MODES,
  type ApprovalMode,
} from "@mais/core/corporate-travel";
import { ChoiceCards } from "@/components/communication/choice";
import { SectionTitle, TextField, useRunAction } from "@/components/travel/kit";
import { Badge, Button, EmptyState, Field, Panel } from "@/components/ui";
import { Checkbox, Select, Switch } from "@/components/ui/controls";
import { ConfirmDialog, Sheet } from "@/components/ui/overlay";
import { deletePolicy, savePolicy, setApprovalMode } from "../actions";

type Rule = {
  serviceType: "AIR" | "HOTEL";
  unit: "trecho" | "viagem" | "noite" | "diaria" | "pessoa";
  scope: "ANY" | "DOMESTIC" | "INTERNATIONAL";
  destination: string;
  maxAmount: string;
  currency: "BRL" | "USD" | "EUR";
  maxCabin: "" | (typeof CABIN_CLASSES)[number];
  maxHotelStars: "" | "3" | "4" | "5";
};

export type PolicyRow = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  priority: number;
  memberTypes: string[];
  jobTitles: string[];
  minAdvanceDays: string;
  requireInsuranceInternational: boolean;
  requireJustification: boolean;
  summary: string[];
  rules: Rule[];
};

type Draft = Omit<PolicyRow, "id" | "summary"> & {
  id?: string;
  memberTypesText: string;
  jobTitlesText: string;
};

const RULE_PRESETS: { label: string; rule: Rule }[] = [
  {
    label: "Aéreo por trecho",
    rule: {
      serviceType: "AIR",
      unit: "trecho",
      scope: "ANY",
      destination: "",
      maxAmount: "",
      currency: "BRL",
      maxCabin: "ECONOMY",
      maxHotelStars: "",
    },
  },
  {
    label: "Aéreo por viagem",
    rule: {
      serviceType: "AIR",
      unit: "viagem",
      scope: "ANY",
      destination: "",
      maxAmount: "",
      currency: "BRL",
      maxCabin: "",
      maxHotelStars: "",
    },
  },
  {
    label: "Hotel por noite",
    rule: {
      serviceType: "HOTEL",
      unit: "noite",
      scope: "ANY",
      destination: "",
      maxAmount: "",
      currency: "BRL",
      maxCabin: "",
      maxHotelStars: "4",
    },
  },
];

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  active: true,
  priority: 0,
  memberTypes: [],
  jobTitles: [],
  memberTypesText: "",
  jobTitlesText: "",
  minAdvanceDays: "7",
  requireInsuranceInternational: true,
  requireJustification: true,
  rules: [RULE_PRESETS[0]!.rule, RULE_PRESETS[2]!.rule],
});

const splitList = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Política de viagem como DADO do cliente: limites por trecho/viagem/noite,
 * classe e categoria por público (tipo de membro, cargo), antecedência e
 * seguro. Fora da política não bloqueia — sinaliza, pede justificativa e,
 * conforme o modo de aprovação, vai para o aprovador.
 */
export function PolicyBoard({
  tenant,
  canEdit,
  policies,
  approvalMode,
  memberTypes,
}: {
  tenant: string;
  canEdit: boolean;
  policies: PolicyRow[];
  approvalMode: ApprovalMode;
  memberTypes: string[];
}) {
  const { run, pending, errors } = useRunAction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<PolicyRow | null>(null);
  const [mode, setMode] = useState<ApprovalMode>(approvalMode);

  const edit = (p?: PolicyRow) =>
    setDraft(
      p
        ? {
            ...p,
            memberTypesText: p.memberTypes.join(", "),
            jobTitlesText: p.jobTitles.join(", "),
          }
        : emptyDraft(),
    );
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setRule = (i: number, patch: Partial<Rule>) =>
    setDraft((d) =>
      d ? { ...d, rules: d.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : d,
    );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="flex min-w-0 flex-col gap-4">
        <SectionTitle
          action={
            canEdit ? (
              <Button size="sm" variant="secondary" onClick={() => edit()}>
                <Plus /> Nova política
              </Button>
            ) : undefined
          }
        >
          Políticas
        </SectionTitle>
        {policies.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck />}
            title="Sem política, nada é sinalizado"
            description="Defina os limites do cliente: valor por trecho ou noite, classe permitida, antecedência mínima. Uma política para todos e outras para públicos específicos (ex.: diretoria)."
            action={
              canEdit ? (
                <Button onClick={() => edit()}>
                  <Plus /> Criar a política geral
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {policies.map((p) => (
              <li key={p.id}>
                <Panel className="flex flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{p.name}</h3>
                        {!p.active && <Badge size="sm">Inativa</Badge>}
                        <Badge size="sm" tone="info">
                          Prioridade {p.priority}
                        </Badge>
                      </div>
                      <p className="text-fg-muted text-sm">
                        {p.memberTypes.length || p.jobTitles.length
                          ? `Vale para ${[...p.memberTypes, ...p.jobTitles].join(", ")}`
                          : "Vale para todos do cliente"}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <Button variant="secondary" size="sm" onClick={() => edit(p)}>
                          <Pencil /> Editar
                        </Button>
                        <Button
                          variant="danger-ghost"
                          size="sm"
                          aria-label={`Excluir ${p.name}`}
                          onClick={() => setRemoving(p)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </div>
                  <ul className="text-fg-muted flex list-disc flex-col gap-1 pl-5 text-sm">
                    {p.minAdvanceDays && <li>Antecedência mínima de {p.minAdvanceDays} dias</li>}
                    {p.summary.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                    {p.requireInsuranceInternational && (
                      <li>Seguro obrigatório em viagem internacional</li>
                    )}
                    <li>
                      {p.requireJustification
                        ? "Fora da política exige justificativa"
                        : "Fora da política não exige justificativa"}
                    </li>
                  </ul>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <SectionTitle>Aprovação</SectionTitle>
        <ChoiceCards
          label="Quando a escolha vai para o aprovador"
          value={mode}
          columns={1}
          disabled={!canEdit || pending}
          onChange={(m) => {
            setMode(m);
            run(() => setApprovalMode({ tenant, mode: m }), { success: "Aprovação atualizada." });
          }}
          options={APPROVAL_MODES.map((m) => ({
            value: m,
            title: APPROVAL_MODE_LABELS[m],
            description: APPROVAL_MODE_HINTS[m],
          }))}
        />
        <p className="text-fg-subtle text-xs">
          A decisão é de quem tem o papel de aprovador no cliente (equipe). Um nível por enquanto;
          alçadas por valor e centro de custo chegam com a política completa.
        </p>
      </aside>

      <Sheet
        open={draft !== null}
        onOpenChange={(o) => !o && setDraft(null)}
        size="lg"
        title={draft?.id ? "Editar política" : "Nova política"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                draft &&
                run(
                  () =>
                    savePolicy({
                      tenant,
                      policyId: draft.id,
                      name: draft.name,
                      description: draft.description,
                      active: draft.active,
                      priority: draft.priority,
                      memberTypes: splitList(draft.memberTypesText),
                      jobTitles: splitList(draft.jobTitlesText),
                      minAdvanceDays: draft.minAdvanceDays,
                      requireInsuranceInternational: draft.requireInsuranceInternational,
                      requireJustification: draft.requireJustification,
                      rules: draft.rules,
                    }),
                  { success: "Política salva.", onSuccess: () => setDraft(null) },
                )
              }
            >
              Salvar política
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <TextField
              label="Nome"
              value={draft.name}
              onChange={(v) => set("name", v)}
              error={errors.name}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Vale para os tipos de membro"
                optional
                placeholder={
                  memberTypes.length ? memberTypes.join(", ") : "Ex.: Diretor, Associado"
                }
                hint="Separe por vírgula. Vazio = todos."
                value={draft.memberTypesText}
                onChange={(v) => set("memberTypesText", v)}
              />
              <TextField
                label="Vale para os cargos"
                optional
                hint="Separe por vírgula. Vazio = todos."
                value={draft.jobTitlesText}
                onChange={(v) => set("jobTitlesText", v)}
              />
              <TextField
                label="Prioridade"
                type="number"
                inputMode="numeric"
                hint="Maior vence quando mais de uma vale para a pessoa."
                value={String(draft.priority)}
                onChange={(v) => set("priority", Number(v) || 0)}
              />
              <TextField
                label="Antecedência mínima (dias)"
                optional
                type="number"
                inputMode="numeric"
                value={draft.minAdvanceDays}
                onChange={(v) => set("minAdvanceDays", v)}
                error={errors.minAdvanceDays}
              />
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={draft.requireInsuranceInternational}
                  onCheckedChange={(v) => set("requireInsuranceInternational", v === true)}
                />
                Seguro viagem obrigatório em viagem internacional
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={draft.requireJustification}
                  onCheckedChange={(v) => set("requireJustification", v === true)}
                />
                Fora da política exige justificativa do solicitante
              </label>
              <label className="flex items-center gap-2">
                <Switch checked={draft.active} onCheckedChange={(v) => set("active", v)} />
                Política ativa
              </label>
            </div>

            <p className="text-sm font-semibold">Limites</p>
            {draft.rules.map((r, i) => (
              <fieldset key={i} className="border-border rounded-md border p-4">
                <legend className="text-fg-muted px-1 text-xs font-semibold">
                  {r.serviceType === "AIR" ? "Aéreo" : "Hotel"}{" "}
                  {r.unit === "trecho"
                    ? "por trecho"
                    : r.unit === "noite"
                      ? "por noite"
                      : "por viagem"}
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Serviço e unidade">
                    {(a) => (
                      <Select
                        id={a.id}
                        value={`${r.serviceType}:${r.unit}`}
                        onValueChange={(v) => {
                          const [serviceType, unit] = v.split(":") as [
                            Rule["serviceType"],
                            Rule["unit"],
                          ];
                          setRule(i, {
                            serviceType,
                            unit,
                            maxCabin: serviceType === "AIR" ? r.maxCabin : "",
                            maxHotelStars: serviceType === "HOTEL" ? r.maxHotelStars : "",
                          });
                        }}
                        options={[
                          { value: "AIR:trecho", label: "Aéreo por trecho" },
                          { value: "AIR:viagem", label: "Aéreo por viagem" },
                          { value: "HOTEL:noite", label: "Hotel por noite" },
                        ]}
                      />
                    )}
                  </Field>
                  <TextField
                    label="Valor máximo por passageiro"
                    optional
                    inputMode="decimal"
                    placeholder="Ex.: 1.500,00"
                    value={r.maxAmount}
                    onChange={(v) => setRule(i, { maxAmount: v })}
                    error={errors[`rules.${i}.maxAmount`]}
                  />
                  {r.serviceType === "AIR" ? (
                    <Field label="Classe máxima">
                      {(a) => (
                        <Select
                          id={a.id}
                          value={r.maxCabin || "NONE"}
                          onValueChange={(v) =>
                            setRule(i, { maxCabin: v === "NONE" ? "" : (v as Rule["maxCabin"]) })
                          }
                          options={[
                            { value: "NONE", label: "Sem limite de classe" },
                            ...CABIN_CLASSES.map((c) => ({
                              value: c,
                              label: CABIN_CLASS_LABELS[c],
                            })),
                          ]}
                        />
                      )}
                    </Field>
                  ) : (
                    <Field label="Categoria máxima">
                      {(a) => (
                        <Select
                          id={a.id}
                          value={r.maxHotelStars || "NONE"}
                          onValueChange={(v) =>
                            setRule(i, {
                              maxHotelStars: v === "NONE" ? "" : (v as Rule["maxHotelStars"]),
                            })
                          }
                          options={[
                            { value: "NONE", label: "Sem limite de categoria" },
                            { value: "3", label: "Até 3 estrelas" },
                            { value: "4", label: "Até 4 estrelas" },
                            { value: "5", label: "Até 5 estrelas" },
                          ]}
                        />
                      )}
                    </Field>
                  )}
                  <Field label="Abrangência">
                    {(a) => (
                      <Select
                        id={a.id}
                        value={r.scope}
                        onValueChange={(v) => setRule(i, { scope: v as Rule["scope"] })}
                        options={[
                          { value: "ANY", label: "Nacional e internacional" },
                          { value: "DOMESTIC", label: "Só nacional" },
                          { value: "INTERNATIONAL", label: "Só internacional" },
                        ]}
                      />
                    )}
                  </Field>
                  <TextField
                    label="Só para o destino"
                    optional
                    placeholder="Ex.: São Paulo"
                    value={r.destination}
                    onChange={(v) => setRule(i, { destination: v })}
                  />
                </div>
                <Button
                  variant="danger-ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    set(
                      "rules",
                      draft.rules.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 /> Remover limite
                </Button>
              </fieldset>
            ))}
            <div className="flex flex-wrap gap-2">
              {RULE_PRESETS.map((p) => (
                <Button
                  key={p.label}
                  variant="secondary"
                  size="sm"
                  onClick={() => set("rules", [...draft.rules, p.rule])}
                >
                  <Plus /> {p.label}
                </Button>
              ))}
            </div>
            <TextField
              label="Observações"
              optional
              multiline
              rows={2}
              value={draft.description}
              onChange={(v) => set("description", v)}
            />
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Excluir esta política?"
        description={`"${removing?.name ?? ""}" deixa de valer para novas solicitações. As já avaliadas mantêm o registro.`}
        confirmLabel="Excluir política"
        tone="danger"
        loading={pending}
        onConfirm={() =>
          removing &&
          run(() => deletePolicy({ tenant, policyId: removing.id }), {
            success: "Política excluída.",
            onSuccess: () => setRemoving(null),
          })
        }
      />
    </div>
  );
}
