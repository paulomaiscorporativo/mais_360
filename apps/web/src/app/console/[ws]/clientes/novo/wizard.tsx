"use client";

import { ArrowLeft, ArrowRight, Check, CircleCheck, Copy, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MODULES, withDependencies, type ModuleKey } from "@mais/core";
import { Badge, Button, Field, Input, Notice, Panel } from "@/components/ui";
import { Select } from "@/components/ui/controls";
import { toast } from "@/components/ui/toast";
import { MODULE_UI } from "@/config/modules-ui";
import { RESERVED_SLUGS, TERM_DEFS, TIMEZONES } from "@/config/terms";
import { cn } from "@/lib/cn";
import { checkSlug, createTenant } from "@/app/console/[ws]/actions";
import { BrandFields, BrandPreview, type BrandValue } from "../_components/brand-editor";
import { ModulePicker } from "../_components/module-picker";
import { TermsFields } from "../_components/terms-fields";

const STEPS = [
  { key: "dados", label: "Dados" },
  { key: "marca", label: "Identidade visual" },
  { key: "termos", label: "Nomenclatura" },
  { key: "modulos", label: "Módulos" },
  { key: "equipe", label: "Equipe" },
] as const;

function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

type Created = {
  href: string;
  slug: string;
  admin: { email: string; tempPassword: string | null } | null;
};

export function TenantWizard({
  ws,
  allowed,
  rootDomain,
  whiteLabel,
}: {
  ws: string;
  allowed: ModuleKey[];
  rootDomain: string;
  whiteLabel: boolean;
}) {
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<Created | null>(null);

  // Dados
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [document, setDocument] = useState("");
  const [customSlug, setCustomSlug] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string>("America/Sao_Paulo");
  const [lastCheck, setLastCheck] = useState<{ slug: string; available: boolean } | null>(null);

  // Marca, termos, módulos, equipe
  const [brand, setBrand] = useState<BrandValue>({
    primaryColor: "#002042",
    accentColor: "#a0bf27",
    fontFamily: "Instrument Sans",
    showMaisBrand: !whiteLabel,
  });
  const [terms, setTerms] = useState<Record<string, string>>(
    Object.fromEntries(TERM_DEFS.map((d) => [d.key, d.default])),
  );
  const [modules, setModules] = useState<ModuleKey[]>(() => [
    ...withDependencies(allowed.filter((m) => m === "EVENTS_INVITES" || m === "ACCREDITATION")),
  ]);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  // Endereço segue o nome até a pessoa editá-lo
  const slug = customSlug ?? slugify(name);
  const slugCheckable = !!slug && SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
  const slugState: "idle" | "checking" | "free" | "taken" = !slugCheckable
    ? "idle"
    : lastCheck?.slug !== slug
      ? "checking"
      : lastCheck.available
        ? "free"
        : "taken";

  // Disponibilidade do endereço (com atraso para não consultar a cada tecla)
  const seq = useRef(0);
  useEffect(() => {
    if (!slugCheckable) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const r = await checkSlug({ slug });
      if (id === seq.current) setLastCheck({ slug, available: r.ok && r.data.available });
    }, 350);
    return () => clearTimeout(t);
  }, [slug, slugCheckable]);

  const slugError = !slug
    ? null
    : RESERVED_SLUGS.has(slug)
      ? "Este endereço é reservado. Escolha outro."
      : !SLUG_RE.test(slug)
        ? "Use só letras minúsculas, números e hífen."
        : slugState === "taken"
          ? "Este endereço já está em uso."
          : null;

  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return name.trim().length > 1 && slug.length > 1 && !slugError && slugState !== "checking";
      case 1:
        return (
          /^#[0-9a-f]{6}$/i.test(brand.primaryColor) && /^#[0-9a-f]{6}$/i.test(brand.accentColor)
        );
      case 3:
        return modules.length > 0;
      case 4:
        return (
          (!adminName && !adminEmail) ||
          (adminName.trim().length > 1 && /\S+@\S+\.\S+/.test(adminEmail))
        );
      default:
        return true;
    }
  }, [step, name, slug, slugError, slugState, brand, modules, adminName, adminEmail]);

  function next() {
    if (!stepValid) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError(null);
    start(async () => {
      const r = await createTenant({
        ws,
        name,
        legalName,
        document,
        slug,
        timezone,
        branding: brand,
        terms,
        modules,
        admin: adminEmail ? { name: adminName, email: adminEmail } : null,
      });
      if (r.ok) setCreated(r.data);
      else {
        setError(r.error);
        setFieldErrors(r.fieldErrors ?? {});
        if (r.fieldErrors?.slug || r.fieldErrors?.name) setStep(0);
      }
    });
  }

  if (created)
    return (
      <Success
        created={created}
        name={name}
        address={`${created.slug}.${rootDomain}`}
        brand={brand}
      />
    );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] xl:gap-12">
      <div className="min-w-0">
        <Stepper step={step} onGo={(i) => i < step && setStep(i)} />

        <div key={step} className="animate-rise mt-8">
          {error && <Notice tone="danger" title={error} className="mb-6" />}

          {step === 0 && (
            <div className="flex flex-col gap-5">
              <StepTitle
                title="Quem é o cliente"
                description="Nome de exibição, dados cadastrais e o endereço onde os participantes vão acessar."
              />
              <Field label="Nome do cliente" error={fieldErrors.name}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: ABIEC"
                    autoFocus
                    aria-invalid={invalid || undefined}
                  />
                )}
              </Field>
              <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_200px]">
                <Field label="Razão social" optional>
                  {({ id }) => (
                    <Input
                      id={id}
                      value={legalName}
                      onChange={(e) => setLegalName(e.target.value)}
                    />
                  )}
                </Field>
                <Field label="CNPJ" optional>
                  {({ id }) => (
                    <Input
                      id={id}
                      value={document}
                      inputMode="numeric"
                      onChange={(e) => setDocument(e.target.value)}
                      placeholder="00.000.000/0000-00"
                    />
                  )}
                </Field>
              </div>
              <Field
                label="Endereço"
                error={slugError ?? fieldErrors.slug}
                hint="Os participantes acessam por este endereço. Domínio próprio pode ser configurado depois."
              >
                {({ id, describedBy, invalid }) => (
                  <div
                    className={cn(
                      "border-border-strong bg-surface focus-within:border-brand-ring focus-within:ring-brand-ring/20 flex h-9 items-center overflow-hidden rounded-sm border shadow-sm focus-within:ring-3",
                      invalid && "border-danger",
                    )}
                  >
                    <input
                      id={id}
                      value={slug}
                      onChange={(e) =>
                        setCustomSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))
                      }
                      aria-describedby={describedBy}
                      aria-invalid={invalid || undefined}
                      spellCheck={false}
                      className="h-full min-w-0 flex-1 bg-transparent pl-3 font-mono text-base outline-none"
                    />
                    <span className="border-border bg-surface-muted text-fg-subtle flex h-full items-center gap-2 border-l px-3 font-mono text-sm">
                      .{rootDomain}
                      {slugState === "checking" && <Loader2 className="size-3.5 animate-spin" />}
                      {slugState === "free" && (
                        <Check className="text-success size-3.5" strokeWidth={2.5} />
                      )}
                      {slugState === "taken" && (
                        <X className="text-danger size-3.5" strokeWidth={2.5} />
                      )}
                    </span>
                  </div>
                )}
              </Field>
              <Field
                label="Fuso horário"
                hint="Usado em lembretes, janelas de envio e horários exibidos."
              >
                {({ id }) => (
                  <Select
                    id={id}
                    value={timezone}
                    onValueChange={setTimezone}
                    options={TIMEZONES.map((t) => ({ value: t.value, label: t.label }))}
                  />
                )}
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-5">
              <StepTitle
                title="Identidade visual"
                description="Aplicada no portal, convites, e-mails, vouchers e crachás deste cliente."
              />
              <BrandFields value={brand} onChange={setBrand} allowProductToggle={!whiteLabel} />
              <BrandPreview name={name} value={brand} className="lg:hidden" />
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-5">
              <StepTitle
                title="Nomenclatura"
                description="Como este cliente chama as pessoas e empresas que atende. Os textos da plataforma se adaptam."
              />
              <TermsFields value={terms} onChange={setTerms} />
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-5">
              <StepTitle
                title="Módulos contratados"
                description="Só o que for ligado aqui aparece para o cliente. Dependências são ligadas automaticamente."
              />
              <ModulePicker value={modules} onChange={setModules} allowed={allowed} />
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-5">
              <StepTitle
                title="Administrador do cliente"
                description="Opcional. Esta pessoa administra o cliente e recebe uma senha provisória, trocada no primeiro acesso."
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Nome" optional>
                  {({ id }) => (
                    <Input
                      id={id}
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      autoComplete="off"
                    />
                  )}
                </Field>
                <Field label="E-mail" optional error={fieldErrors["admin.email"]}>
                  {({ id, invalid }) => (
                    <Input
                      id={id}
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      autoComplete="off"
                      aria-invalid={invalid || undefined}
                    />
                  )}
                </Field>
              </div>
              <Review
                name={name}
                address={`${slug}.${rootDomain}`}
                modules={modules}
                terms={terms}
              />
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="border-border bg-canvas/90 sticky bottom-16 z-10 -mx-4 mt-10 flex items-center justify-between gap-3 border-t px-4 py-3 backdrop-blur-md md:static md:mx-0 md:bg-transparent md:px-0 md:pt-6 md:backdrop-blur-none">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={pending}>
              <ArrowLeft /> Voltar
            </Button>
          ) : (
            <Button variant="ghost" asChild>
              <Link href={`/console/${ws}`}>Cancelar</Link>
            </Button>
          )}
          <Button
            onClick={next}
            disabled={!stepValid}
            loading={pending}
            size="md"
            className="min-w-36"
          >
            {step === STEPS.length - 1 ? (
              <>
                <Check /> Criar cliente
              </>
            ) : (
              <>
                Continuar <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Pré-visualização (desktop) */}
      <aside className="hidden lg:block">
        <div className="sticky top-10 flex flex-col gap-3">
          <span className="text-fg-subtle text-xs font-medium">Pré-visualização</span>
          <BrandPreview name={name} value={brand} />
        </div>
      </aside>
    </div>
  );
}

function StepTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-1">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-fg-muted mt-1 text-base">{description}</p>
    </div>
  );
}

function Stepper({ step, onGo }: { step: number; onGo: (i: number) => void }) {
  return (
    <>
      {/* Mobile: etapa atual + barra de progresso */}
      <div className="md:hidden">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">{STEPS[step]!.label}</span>
          <span className="tabular text-fg-subtle">
            Etapa {step + 1} de {STEPS.length}
          </span>
        </div>
        <div className="bg-surface-sunken mt-2 h-1 overflow-hidden rounded-full">
          <div
            className="bg-brand h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>
      {/* Desktop */}
      <ol className="hidden items-center gap-2 md:flex">
        {STEPS.map((s, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={s.key} className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => onGo(i)}
                disabled={!done}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-medium transition-colors",
                  current && "bg-surface text-fg ring-border shadow-sm ring-1",
                  done && "text-fg-muted hover:text-fg",
                  !done && !current && "text-fg-faint",
                )}
              >
                <span
                  className={cn(
                    "tabular grid size-6 place-items-center rounded-full text-xs",
                    current && "bg-brand text-brand-fg",
                    done && "bg-brand-subtle text-brand-subtle-fg",
                    !done && !current && "bg-surface-sunken",
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
                </span>
                <span className="truncate">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <span aria-hidden className="bg-border-strong h-px w-5 shrink-0" />
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Review({
  name,
  address,
  modules,
  terms,
}: {
  name: string;
  address: string;
  modules: ModuleKey[];
  terms: Record<string, string>;
}) {
  return (
    <Panel className="mt-2">
      <div className="border-border text-fg-subtle border-b px-5 py-3 text-sm font-medium">
        Resumo
      </div>
      <dl className="divide-border divide-y text-base">
        <div className="flex justify-between gap-4 px-5 py-3">
          <dt className="text-fg-subtle">Cliente</dt>
          <dd className="truncate font-medium">{name}</dd>
        </div>
        <div className="flex justify-between gap-4 px-5 py-3">
          <dt className="text-fg-subtle">Endereço</dt>
          <dd className="truncate font-mono text-sm">{address}</dd>
        </div>
        <div className="flex justify-between gap-4 px-5 py-3">
          <dt className="text-fg-subtle">Membros</dt>
          <dd>{terms["member.plural"]}</dd>
        </div>
        <div className="flex flex-col gap-2 px-5 py-3">
          <dt className="text-fg-subtle">Módulos ({modules.length})</dt>
          <dd className="flex flex-wrap gap-1.5">
            {modules.map((m) => {
              const Icon = MODULE_UI[m].icon;
              return (
                <Badge key={m} tone="brand">
                  <Icon className="size-3" /> {MODULES[m].name}
                </Badge>
              );
            })}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

function Success({
  created,
  name,
  address,
  brand,
}: {
  created: Created;
  name: string;
  address: string;
  brand: BrandValue;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copiado.");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="animate-rise mx-auto max-w-xl py-6 text-center">
      <span className="bg-success-bg text-success mx-auto grid size-14 place-items-center rounded-full">
        <CircleCheck className="size-7" />
      </span>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">{name} está pronto</h2>
      <p className="text-fg-muted mt-2 text-base">
        Endereço <span className="text-fg font-mono text-sm">{address}</span>
      </p>

      {created.admin?.tempPassword && (
        <Panel className="mt-8 text-left">
          <div className="px-5 py-4">
            <p className="text-sm font-medium">Acesso do administrador</p>
            <p className="text-fg-subtle mt-0.5 text-sm">
              Envie para {created.admin.email}. A senha é exibida só agora e será trocada no
              primeiro acesso.
            </p>
            <div className="border-border bg-surface-muted mt-4 flex items-center gap-2 rounded-sm border p-1 pl-3">
              <code className="text-md flex-1 font-mono tracking-wider">
                {created.admin.tempPassword}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copy(created.admin!.tempPassword!)}
              >
                {copied ? <Check /> : <Copy />} Copiar
              </Button>
            </div>
          </div>
        </Panel>
      )}
      {created.admin && !created.admin.tempPassword && (
        <Notice
          tone="info"
          className="mt-8 text-left"
          title={`${created.admin.email} já tinha conta`}
        >
          O acesso a este cliente foi adicionado à conta existente.
        </Notice>
      )}

      <div className="mt-8 flex flex-col-reverse justify-center gap-2 sm:flex-row">
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Cadastrar outro
        </Button>
        <Button asChild style={{ background: brand.primaryColor }}>
          <Link href={created.href}>
            Abrir {name} <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}
