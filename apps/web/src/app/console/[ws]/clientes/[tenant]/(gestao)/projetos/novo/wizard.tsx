"use client";

import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  CircleDashed,
  GraduationCap,
  PartyPopper,
  Plane,
  Store,
  Trophy,
  Medal,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  PROJECT_FEATURES,
  PROJECT_TEMPLATES,
  projectTemplate,
  type ProjectFeature,
  type ProjectType,
} from "@mais/core";
import { Button, Notice } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { createProject } from "../actions";
import {
  emptyProjectForm,
  FeatureList,
  ProjectFields,
  type ProjectFormValue,
} from "../_components/project-form";

const ICONS: Record<ProjectType, LucideIcon> = {
  INCENTIVE_TRIP: Plane,
  CORPORATE_EVENT: PartyPopper,
  TRADE_SHOW: Store,
  TECHNICAL_IMMERSION: GraduationCap,
  SPORTS_EXPERIENCE: Medal,
  CORPORATE_TRAVEL: Briefcase,
  INCENTIVE_CAMPAIGN: Trophy,
  OTHER: CircleDashed,
};

const TRAVEL_TYPES = new Set<ProjectType>([
  "INCENTIVE_TRIP",
  "TECHNICAL_IMMERSION",
  "SPORTS_EXPERIENCE",
  "CORPORATE_TRAVEL",
]);

const STEPS = ["Tipo", "Dados", "Recursos"] as const;

export function ProjectWizard({
  ws,
  tenant,
  timezone,
  available,
  requires,
}: {
  ws: string;
  tenant: string;
  timezone: string;
  available: ProjectFeature[];
  requires: Partial<Record<ProjectFeature, string>>;
}) {
  const router = useRouter();
  const avail = useMemo(() => new Set(available), [available]);
  const [step, setStep] = useState(0);
  const [type, setType] = useState<ProjectType | null>(null);
  const [data, setData] = useState<ProjectFormValue>(() => emptyProjectForm(timezone));
  const [features, setFeatures] = useState<Set<ProjectFeature>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pickType(t: ProjectType) {
    setType(t);
    setFeatures(new Set(projectTemplate(t).features.filter((f) => avail.has(f))));
    setStep(1);
  }

  const dataValid =
    data.name.trim().length > 1 && (!data.startsAt || !data.endsAt || data.endsAt >= data.startsAt);

  function submit() {
    if (!type) return;
    setError(null);
    start(async () => {
      const r = await createProject({ tenant, type, data, features: [...features] });
      if (!r.ok) {
        setError(r.error);
        setErrors(r.fieldErrors ?? {});
        if (r.fieldErrors && Object.keys(r.fieldErrors).some((k) => k.startsWith("data.")))
          setStep(1);
        return;
      }
      toast.success("Projeto criado.");
      router.push(`/console/${ws}/clientes/${tenant}/projetos/${r.data.slug}`);
    });
  }

  // Recursos do modelo primeiro, depois os demais disponíveis, por último os travados
  const ordered = useMemo(() => {
    const tpl = type ? projectTemplate(type).features : [];
    return [...PROJECT_FEATURES].sort((a, b) => {
      const rank = (f: ProjectFeature) => (!avail.has(f) ? 2 : tpl.includes(f) ? 0 : 1);
      return rank(a) - rank(b);
    });
  }, [type, avail]);

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-8 flex items-center gap-2" aria-label="Etapas">
        {STEPS.map((label, i) => (
          <li key={label} className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              disabled={i >= step}
              onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-medium transition-colors",
                i === step && "bg-surface text-fg ring-border shadow-sm ring-1",
                i < step && "text-fg-muted hover:text-fg",
                i > step && "text-fg-faint",
              )}
            >
              <span
                className={cn(
                  "tabular grid size-6 place-items-center rounded-full text-xs",
                  i === step && "bg-brand text-brand-fg",
                  i < step && "bg-brand-subtle text-brand-subtle-fg",
                  i > step && "bg-surface-sunken",
                )}
              >
                {i < step ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
              </span>
              <span className="truncate">{label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <span aria-hidden className="bg-border-strong h-px w-5 shrink-0" />
            )}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">Que tipo de projeto?</h2>
          <p className="text-fg-muted mt-1 text-base">
            O modelo já liga os recursos certos. Você ajusta tudo depois.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {PROJECT_TEMPLATES.map((t) => {
              const Icon = ICONS[t.type];
              const usable = t.features.filter((f) => avail.has(f)).length;
              return (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => pickType(t.type)}
                  className={cn(
                    "group border-border bg-surface flex items-start gap-3 rounded-md border p-4 text-left shadow-sm transition-[border-color,box-shadow]",
                    "hover:border-brand-ring focus-visible:border-brand-ring focus-visible:ring-brand-ring/20 focus-visible:ring-3 focus-visible:outline-none",
                    type === t.type && "border-brand-ring ring-brand-ring/20 ring-3",
                  )}
                >
                  <span className="bg-brand-subtle text-brand-subtle-fg grid size-9 shrink-0 place-items-center rounded-sm [&_svg]:size-[18px]">
                    <Icon />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-medium">{t.name}</span>
                    <span className="text-fg-subtle mt-0.5 block text-sm">{t.summary}</span>
                    {t.features.length > 0 && (
                      <span className="text-fg-faint mt-2 block text-xs">
                        {usable} de {t.features.length} recursos disponíveis no contrato
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === 1 && type && (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">{projectTemplate(type).name}</h2>
          <p className="text-fg-muted mt-1 mb-6 text-base">
            O essencial para começar. Datas podem ficar para depois.
          </p>
          <ProjectFields
            value={data}
            onChange={setData}
            errors={errors}
            travel={TRAVEL_TYPES.has(type)}
          />
        </section>
      )}

      {step === 2 && (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">Recursos do projeto</h2>
          <p className="text-fg-muted mt-1 mb-6 text-base">
            Ligue só o que este projeto usa — o menu do projeto mostra exatamente isso.
          </p>
          <FeatureList
            features={ordered}
            enabled={features}
            available={avail}
            requires={requires}
            onToggle={(f, on) =>
              setFeatures((s) => {
                const n = new Set(s);
                if (on) n.add(f);
                else n.delete(f);
                return n;
              })
            }
          />
        </section>
      )}

      {error && (
        <Notice tone="danger" className="mt-6">
          {error}
        </Notice>
      )}

      {step > 0 && (
        <div className="border-border mt-8 flex items-center justify-between border-t pt-6">
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            <ArrowLeft /> Voltar
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep(2)} disabled={!dataValid}>
              Continuar <ArrowRight />
            </Button>
          ) : (
            <Button onClick={submit} loading={pending}>
              Criar projeto
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
