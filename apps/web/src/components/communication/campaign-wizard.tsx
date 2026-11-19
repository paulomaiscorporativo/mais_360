"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CircleAlert,
  Clock,
  FileText,
  Gauge,
  Mail,
  MessageCircle,
  Search,
  ShieldCheck,
  Users,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { PACING_PRESETS } from "@mais/core/messaging";
import { Badge, Button, Field, Input, Notice, Panel, PanelBody, Spinner } from "@/components/ui";
import { Checkbox, Select } from "@/components/ui/controls";
import { toast } from "@/components/ui/toast";
import {
  createCampaignAction,
  previewAudienceAction,
  previewTemplateAction,
  projectAudienceOptions,
  searchRegistrations,
} from "@/app/console/[ws]/clientes/[tenant]/comunicacao/actions";
import { ChoiceCards } from "./choice";
import { fmtDuration, maskTarget, PURPOSE_LABEL, REG_STATUS_LABEL, ROLE_LABEL } from "./labels";
import { MessagePreview, type PreviewData } from "./message-preview";
import { cn } from "@/lib/cn";

type Channel = "EMAIL" | "WHATSAPP";
type TemplateOpt = {
  id: string;
  name: string;
  purpose: string;
  projectId: string | null;
  hasEmail: boolean;
  hasWhatsapp: boolean;
  excerpt: string;
  content: {
    name: string;
    emailSubject: string;
    emailBody: string;
    whatsappBody: string;
    includeActions: boolean;
  };
};
type Preset = "cauteloso" | "moderado" | "personalizado";
type CustomPacing = {
  intervalMinS: number;
  intervalMaxS: number;
  batchSize: number;
  batchPauseMinM: number;
  batchPauseMaxM: number;
  dailyLimit: number;
  windowStart: string;
  windowEnd: string;
};
type AudiencePreview = {
  matched: number;
  sendable: number;
  skippedByReason: Record<string, number>;
  skippedSample: { name: string; reason: string }[];
  sample: { name: string; target: string }[];
  estimate?: { days: number; activeMinutes: number };
};

const STEPS = ["Mensagem", "Público", "Ritmo e horário", "Revisão"] as const;
const nf = new Intl.NumberFormat("pt-BR");

function Pills<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: V; label: string; count?: number }[];
  value: V[];
  onChange: (v: V[]) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
              on
                ? "border-brand bg-brand-subtle text-brand-subtle-fg font-medium"
                : "border-border-strong text-fg-muted hover:border-fg-faint/70 hover:text-fg",
            )}
          >
            {on && <Check className="size-3.5" strokeWidth={3} />}
            {o.label}
            {o.count !== undefined && (
              <span className="tabular text-fg-subtle text-xs">{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function CampaignWizard({
  tenant,
  base,
  timezone,
  memberLabel,
  templates,
  projects,
  memberTypes,
  ready,
  activeWhatsapp,
  initialTemplateId,
  initialProjectId,
}: {
  tenant: string;
  base: string;
  timezone: string;
  memberLabel: string;
  templates: TemplateOpt[];
  projects: { id: string; name: string }[];
  memberTypes: { value: string; count: number }[];
  ready: Record<Channel, boolean>;
  activeWhatsapp: { id: string; name: string } | null;
  initialTemplateId: string | null;
  initialProjectId: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState<string | null>(
    templates.some((t) => t.id === initialTemplateId) ? initialTemplateId : null,
  );
  const [channel, setChannel] = useState<Channel>(ready.EMAIL ? "EMAIL" : "WHATSAPP");
  const [name, setName] = useState("");
  const [tq, setTq] = useState("");

  const [source, setSource] = useState<"members" | "project">(
    initialProjectId || !memberTypes.length ? "project" : "members",
  );
  const [types, setTypes] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string | null>(
    initialProjectId ?? projects[0]?.id ?? null,
  );
  const [regMode, setRegMode] = useState<"filter" | "explicit">("filter");
  const [statuses, setStatuses] = useState<string[]>(["CONFIRMED", "INVITED", "PENDING"]);
  const [roles, setRoles] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [checkedIn, setCheckedIn] = useState<"any" | "yes" | "no">("any");
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [opts, setOpts] = useState<{ categories: { id: string; name: string }[] }>({
    categories: [],
  });

  const [preset, setPreset] = useState<Preset>("cauteloso");
  const [custom, setCustom] = useState<CustomPacing>({ ...PACING_PRESETS.cauteloso });
  const [when, setWhen] = useState<"now" | "schedule">("now");
  const [scheduleAt, setScheduleAt] = useState("");
  /** Validado no momento da escolha (a data precisa estar no futuro) */
  const [scheduleOk, setScheduleOk] = useState(false);

  // Última contagem e a combinação de filtros a que ela se refere
  const [counted, setCounted] = useState<{
    key: string;
    data: AudiencePreview | null;
    error: string | null;
  } | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [creating, start] = useTransition();

  const template = templates.find((t) => t.id === templateId) ?? null;
  const pacing = useMemo(
    () => (preset === "personalizado" ? { preset, ...custom } : { preset }),
    [preset, custom],
  );

  const audiencePayload = useMemo(() => {
    if (source === "members") {
      return { kind: "members" as const, ...(types.length ? { memberTypes: types } : {}) };
    }
    if (regMode === "explicit") {
      return { kind: "explicit" as const, registrationIds: [...picked.keys()] };
    }
    return {
      kind: "registrations" as const,
      includeCanceled: false,
      ...(statuses.length ? { statuses: statuses as never } : {}),
      ...(roles.length ? { roles: roles as never } : {}),
      ...(categoryIds.length ? { categoryIds } : {}),
      ...(checkedIn !== "any" ? { checkedIn: checkedIn === "yes" } : {}),
    };
  }, [source, types, regMode, picked, statuses, roles, categoryIds, checkedIn]);

  const projectForCampaign = source === "project" ? projectId : null;

  // Contagem ao vivo do público (mesmas regras da criação)
  const audienceReady =
    step >= 1 &&
    !(source === "project" && !projectId) &&
    !(audiencePayload.kind === "explicit" && !audiencePayload.registrationIds.length);
  const audienceKey = JSON.stringify([projectForCampaign, channel, audiencePayload, pacing]);
  useEffect(() => {
    if (!audienceReady) return;
    const h = setTimeout(async () => {
      const r = await previewAudienceAction({
        tenant,
        projectId: projectForCampaign,
        channel,
        audience: audiencePayload,
        pacing: channel === "WHATSAPP" ? pacing : undefined,
      });
      setCounted(
        r.ok
          ? { key: audienceKey, data: r.data as AudiencePreview, error: null }
          : { key: audienceKey, data: null, error: r.error },
      );
    }, 300);
    return () => clearTimeout(h);
  }, [audienceReady, audienceKey, tenant, projectForCampaign, channel, audiencePayload, pacing]);
  const counting = audienceReady && counted?.key !== audienceKey;
  const audience = audienceReady ? (counted?.data ?? null) : null;
  const audienceError = audienceReady ? (counted?.error ?? null) : null;

  // Filtros do projeto (categorias)
  useEffect(() => {
    if (source !== "project" || !projectId) return;
    void projectAudienceOptions({ tenant, projectId }).then((r) => {
      if (r.ok) setOpts({ categories: r.data.categories });
    });
  }, [tenant, source, projectId]);

  // Pré-visualização da mensagem na revisão
  useEffect(() => {
    if (step !== 3 || !template) return;
    void previewTemplateAction({
      tenant,
      projectId: projectForCampaign,
      template: template.content,
    }).then((r) => r.ok && setPreview(r.data));
  }, [step, template, tenant, projectForCampaign]);

  const channelOk = (c: Channel) =>
    ready[c] && (!template || (c === "EMAIL" ? template.hasEmail : template.hasWhatsapp));
  const scheduleDate = scheduleAt ? new Date(scheduleAt) : null;

  const canNext = [
    !!template && channelOk(channel) && !(channel === "WHATSAPP" && activeWhatsapp),
    !!audience && audience.sendable > 0 && !counting,
    when === "now" || (!!scheduleDate && scheduleOk),
    true,
  ][step];

  const create = () =>
    start(async () => {
      if (!template) return;
      const r = await createCampaignAction({
        tenant,
        projectId: projectForCampaign,
        channel,
        audience: audiencePayload,
        pacing: channel === "WHATSAPP" ? pacing : undefined,
        templateId: template.id,
        name: name.trim() || undefined,
        scheduledAt: when === "schedule" && scheduleDate ? scheduleDate.toISOString() : null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        when === "schedule"
          ? `Envio agendado para ${nf.format(r.data.total)} pessoas.`
          : `Envio iniciado para ${nf.format(r.data.total)} pessoas.`,
      );
      router.push(`${base}/campanhas/${r.data.campaignId}`);
    });

  const shownTemplates = templates.filter(
    (t) => !tq || `${t.name} ${t.excerpt}`.toLowerCase().includes(tq.toLowerCase()),
  );

  if (!templates.length) {
    return (
      <Panel>
        <PanelBody className="flex flex-col items-center gap-3 py-12 text-center">
          <FileText className="text-fg-faint size-6" />
          <p className="font-semibold">Antes de enviar, escreva um modelo</p>
          <p className="text-fg-muted max-w-sm text-sm">
            O envio usa um modelo de mensagem — com o nome de cada pessoa no lugar certo.
          </p>
          <Button asChild>
            <Link href={`${base}/modelos/novo`}>Escrever modelo</Link>
          </Button>
        </PanelBody>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Voltar aos envios">
          <Link href={`${base}/campanhas`}>
            <ArrowLeft />
          </Link>
        </Button>
        <h3 className="text-lg font-semibold tracking-tight">Novo envio</h3>
      </div>

      <ol
        className="flex [scrollbar-width:none] items-center gap-2 overflow-x-auto"
        aria-label="Etapas"
      >
        {STEPS.map((s, i) => (
          <li key={s} className="flex shrink-0 items-center gap-2">
            {i > 0 && <span aria-hidden className="bg-border-strong h-px w-6" />}
            <button
              type="button"
              disabled={i > step}
              onClick={() => i < step && setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex h-8 items-center gap-2 rounded-full pr-3 pl-1 text-sm transition-colors",
                i === step
                  ? "bg-surface text-fg ring-border font-medium shadow-sm ring-1"
                  : "text-fg-subtle",
                i < step && "hover:text-fg",
              )}
            >
              <span
                className={cn(
                  "tabular grid size-6 place-items-center rounded-full text-xs font-semibold",
                  i < step
                    ? "bg-success-bg text-success"
                    : i === step
                      ? "bg-fg text-canvas"
                      : "border-border-strong border",
                )}
              >
                {i < step ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* 1. Mensagem */}
          {step === 0 && (
            <>
              <Section title="Qual mensagem?" description="Escolha um dos modelos do cliente.">
                {templates.length > 6 && (
                  <Input
                    leading={<Search />}
                    placeholder="Buscar modelo"
                    value={tq}
                    onChange={(e) => setTq(e.target.value)}
                    aria-label="Buscar modelo"
                  />
                )}
                <div role="radiogroup" aria-label="Modelo" className="grid gap-2 sm:grid-cols-2">
                  {shownTemplates.map((t) => {
                    const on = t.id === templateId;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => {
                          setTemplateId(t.id);
                          if (!t.hasEmail && t.hasWhatsapp) setChannel("WHATSAPP");
                          if (t.hasEmail && !t.hasWhatsapp) setChannel("EMAIL");
                        }}
                        className={cn(
                          "flex flex-col gap-1.5 rounded-md border p-3.5 text-left transition-[border-color,box-shadow]",
                          on
                            ? "border-brand shadow-[0_0_0_1px_var(--brand)]"
                            : "border-border-strong hover:border-fg-faint/70",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{t.name}</span>
                          {on && (
                            <Check className="text-brand-text size-4 shrink-0" strokeWidth={3} />
                          )}
                        </span>
                        <span className="text-fg-subtle text-xs">
                          {PURPOSE_LABEL[t.purpose] ?? t.purpose}
                        </span>
                        <span className="text-fg-muted line-clamp-1 text-xs">
                          {t.excerpt.replace(/\{\{\s*(\w+)\s*\}\}/g, "[$1]") || "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Section>
              <Section title="Por qual canal?">
                <ChoiceCards
                  label="Canal"
                  columns={2}
                  value={channel}
                  onChange={setChannel}
                  options={[
                    {
                      value: "EMAIL",
                      icon: <Mail />,
                      title: "E-mail",
                      description: !ready.EMAIL
                        ? "Configure um servidor em Canais."
                        : template && !template.hasEmail
                          ? "Este modelo não tem versão de e-mail."
                          : "Sai na hora, com a marca do cliente.",
                      disabled: !channelOk("EMAIL"),
                    },
                    {
                      value: "WHATSAPP",
                      icon: <MessageCircle />,
                      title: "WhatsApp",
                      description: !ready.WHATSAPP
                        ? "Conecte um número em Canais."
                        : "Em ritmo humano, para proteger o número.",
                      disabled: !channelOk("WHATSAPP"),
                    },
                  ]}
                />
                {channel === "WHATSAPP" && activeWhatsapp && (
                  <Notice
                    tone="warning"
                    icon={<CircleAlert />}
                    title="Já há um envio por WhatsApp em andamento"
                  >
                    “{activeWhatsapp.name}” precisa terminar (ou ser cancelado) antes — só um envio
                    por WhatsApp acontece por vez, para proteger o número.{" "}
                    <Link
                      className="text-fg underline"
                      href={`${base}/campanhas/${activeWhatsapp.id}`}
                    >
                      Ver envio
                    </Link>
                  </Notice>
                )}
              </Section>
              <Section title="Nome do envio" description="Opcional — para achar no histórico.">
                <Input
                  aria-label="Nome do envio"
                  placeholder={template?.name ?? "Ex.: Lembrete D-7 — confirmados"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Section>
            </>
          )}

          {/* 2. Público */}
          {step === 1 && (
            <>
              <Section title="Quem recebe?">
                <ChoiceCards
                  label="Origem do público"
                  columns={2}
                  value={source}
                  onChange={setSource}
                  options={[
                    {
                      value: "members",
                      icon: <Users />,
                      title: `Base de ${memberLabel.toLowerCase()}`,
                      description: memberTypes.length
                        ? `${nf.format(memberTypes.reduce((s, m) => s + m.count, 0))} cadastros permanentes do cliente.`
                        : "Nenhum cadastro na base ainda.",
                      disabled: !memberTypes.length,
                    },
                    {
                      value: "project",
                      icon: <CalendarClock />,
                      title: "Inscritos de um evento ou viagem",
                      description: projects.length
                        ? "Filtre por situação, papel e categoria."
                        : "Nenhum evento ou viagem criado ainda.",
                      disabled: !projects.length,
                    },
                  ]}
                />
              </Section>

              {source === "members" && memberTypes.length > 1 && (
                <Section title="Tipos" description="Sem seleção, todos recebem.">
                  <Pills
                    label="Tipos de cadastro"
                    value={types}
                    onChange={setTypes}
                    options={memberTypes.map((m) => ({
                      value: m.value,
                      label: m.value || "Sem tipo",
                      count: m.count,
                    }))}
                  />
                </Section>
              )}

              {source === "project" && (
                <>
                  <Section title="Evento ou viagem">
                    <Select
                      value={projectId ?? undefined}
                      onValueChange={(v) => {
                        setProjectId(v);
                        setPicked(new Map());
                        setCategoryIds([]);
                      }}
                      options={projects.map((p) => ({ value: p.id, label: p.name }))}
                      placeholder="Escolha"
                    />
                    <div className="bg-surface-sunken grid grid-cols-2 gap-1 rounded-md p-1">
                      {(
                        [
                          ["filter", "Por filtro"],
                          ["explicit", "Escolher pessoas"],
                        ] as const
                      ).map(([v, l]) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={regMode === v}
                          onClick={() => setRegMode(v)}
                          className={cn(
                            "h-8 rounded-sm text-sm font-medium transition-colors",
                            regMode === v ? "bg-surface text-fg shadow-sm" : "text-fg-subtle",
                          )}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </Section>
                  {regMode === "filter" ? (
                    <Section title="Filtros" description="Sem seleção em um grupo, ele não filtra.">
                      <FilterRow label="Situação">
                        <Pills
                          label="Situação"
                          value={statuses}
                          onChange={setStatuses}
                          options={Object.entries(REG_STATUS_LABEL)
                            .filter(([k]) => k !== "CANCELED")
                            .map(([value, label]) => ({ value, label }))}
                        />
                      </FilterRow>
                      <FilterRow label="Papel">
                        <Pills
                          label="Papel"
                          value={roles}
                          onChange={setRoles}
                          options={Object.entries(ROLE_LABEL).map(([value, label]) => ({
                            value,
                            label,
                          }))}
                        />
                      </FilterRow>
                      {opts.categories.length > 0 && (
                        <FilterRow label="Categoria">
                          <Pills
                            label="Categoria"
                            value={categoryIds}
                            onChange={setCategoryIds}
                            options={opts.categories.map((c) => ({ value: c.id, label: c.name }))}
                          />
                        </FilterRow>
                      )}
                      <FilterRow label="Credenciamento">
                        <Select
                          className="sm:w-64"
                          value={checkedIn}
                          onValueChange={(v) => setCheckedIn(v as typeof checkedIn)}
                          options={[
                            { value: "any", label: "Todos" },
                            { value: "no", label: "Só quem ainda não fez check-in" },
                            { value: "yes", label: "Só quem já foi credenciado" },
                          ]}
                        />
                      </FilterRow>
                    </Section>
                  ) : (
                    projectId && (
                      <PeoplePicker
                        tenant={tenant}
                        projectId={projectId}
                        picked={picked}
                        onChange={setPicked}
                      />
                    )
                  )}
                </>
              )}
            </>
          )}

          {/* 3. Ritmo e horário */}
          {step === 2 && (
            <>
              {channel === "WHATSAPP" ? (
                <Section
                  title="Ritmo do WhatsApp"
                  description="O envio imita uma pessoa: intervalos aleatórios, pausas a cada lote, limite diário e horário permitido. Isso protege o número contra bloqueio."
                >
                  <ChoiceCards
                    label="Ritmo"
                    value={preset}
                    onChange={(v) => {
                      setPreset(v);
                      if (v !== "personalizado") setCustom({ ...PACING_PRESETS[v] });
                    }}
                    options={[
                      {
                        value: "cauteloso",
                        icon: <ShieldCheck />,
                        title: "Cauteloso",
                        badge: (
                          <Badge size="sm" tone="brand">
                            Recomendado
                          </Badge>
                        ),
                        description: "30–60 s entre mensagens · lotes de 15 · até 100/dia.",
                      },
                      {
                        value: "moderado",
                        icon: <Gauge />,
                        title: "Moderado",
                        description: "20–40 s entre mensagens · lotes de 25 · até 200/dia.",
                      },
                      {
                        value: "personalizado",
                        icon: <Zap />,
                        title: "Personalizado",
                        description: "Você define — com limites de segurança.",
                      },
                    ]}
                  />
                  {preset === "personalizado" && (
                    <div className="border-border bg-surface-muted grid gap-4 rounded-md border p-4 sm:grid-cols-2">
                      <NumberPair
                        label="Intervalo entre mensagens (s)"
                        a={custom.intervalMinS}
                        b={custom.intervalMaxS}
                        onA={(v) => setCustom((c) => ({ ...c, intervalMinS: v }))}
                        onB={(v) => setCustom((c) => ({ ...c, intervalMaxS: v }))}
                        hint="Mínimo de 10 s."
                      />
                      <NumberPair
                        label="Pausa a cada lote (min)"
                        a={custom.batchPauseMinM}
                        b={custom.batchPauseMaxM}
                        onA={(v) => setCustom((c) => ({ ...c, batchPauseMinM: v }))}
                        onB={(v) => setCustom((c) => ({ ...c, batchPauseMaxM: v }))}
                      />
                      <Field label="Mensagens por lote">
                        {({ id }) => (
                          <Input
                            id={id}
                            inputMode="numeric"
                            value={custom.batchSize}
                            onChange={(e) =>
                              setCustom((c) => ({
                                ...c,
                                batchSize: Number(e.target.value.replace(/\D/g, "")) || 1,
                              }))
                            }
                          />
                        )}
                      </Field>
                      <Field label="Limite por dia (por número)">
                        {({ id }) => (
                          <Input
                            id={id}
                            inputMode="numeric"
                            value={custom.dailyLimit}
                            onChange={(e) =>
                              setCustom((c) => ({
                                ...c,
                                dailyLimit: Number(e.target.value.replace(/\D/g, "")) || 1,
                              }))
                            }
                          />
                        )}
                      </Field>
                      <Field label="Começa às">
                        {({ id }) => (
                          <Input
                            id={id}
                            type="time"
                            value={custom.windowStart}
                            onChange={(e) =>
                              setCustom((c) => ({ ...c, windowStart: e.target.value }))
                            }
                          />
                        )}
                      </Field>
                      <Field label="Para às">
                        {({ id }) => (
                          <Input
                            id={id}
                            type="time"
                            value={custom.windowEnd}
                            onChange={(e) =>
                              setCustom((c) => ({ ...c, windowEnd: e.target.value }))
                            }
                          />
                        )}
                      </Field>
                    </div>
                  )}
                  <div className="text-fg-muted flex items-start gap-2 text-sm">
                    <Clock className="text-fg-subtle mt-0.5 size-4 shrink-0" />
                    <p>
                      Envia só entre <strong className="text-fg">{custom.windowStart}</strong> e{" "}
                      <strong className="text-fg">{custom.windowEnd}</strong> no horário de{" "}
                      {timezone.split("/").pop()?.replace("_", " ")}. Fora disso, ou ao atingir o
                      limite do dia, o envio espera e continua sozinho no dia seguinte.
                    </p>
                  </div>
                </Section>
              ) : (
                <Section title="Ritmo do e-mail">
                  <div className="text-fg-muted flex items-start gap-2 text-sm">
                    <Mail className="text-fg-subtle mt-0.5 size-4 shrink-0" />
                    <p>
                      Os e-mails saem em sequência, com um pequeno intervalo entre eles para não
                      cair em filtros de spam. Se o servidor recusar vários seguidos, o envio pausa
                      e avisa.
                    </p>
                  </div>
                </Section>
              )}
              <Section title="Quando?">
                <ChoiceCards
                  label="Quando enviar"
                  columns={2}
                  value={when}
                  onChange={setWhen}
                  options={[
                    {
                      value: "now",
                      icon: <Zap />,
                      title: "Agora",
                      description: "Começa assim que você confirmar.",
                    },
                    {
                      value: "schedule",
                      icon: <CalendarClock />,
                      title: "Agendar",
                      description: "Escolha dia e hora.",
                    },
                  ]}
                />
                {when === "schedule" && (
                  <Field label="Data e hora" hint="No horário do seu computador.">
                    {({ id, describedBy }) => (
                      <Input
                        id={id}
                        type="datetime-local"
                        aria-describedby={describedBy}
                        className="sm:w-64"
                        value={scheduleAt}
                        onChange={(e) => {
                          setScheduleAt(e.target.value);
                          const d = e.target.value ? new Date(e.target.value) : null;
                          setScheduleOk(!!d && d.getTime() > Date.now() + 60_000);
                        }}
                      />
                    )}
                  </Field>
                )}
              </Section>
            </>
          )}

          {/* 4. Revisão */}
          {step === 3 && template && (
            <>
              <Section title="Confira antes de enviar">
                <dl className="divide-border border-border divide-y rounded-md border text-sm">
                  <ReviewRow label="Mensagem" value={template.name} onEdit={() => setStep(0)} />
                  <ReviewRow
                    label="Canal"
                    value={channel === "EMAIL" ? "E-mail" : "WhatsApp"}
                    onEdit={() => setStep(0)}
                  />
                  <ReviewRow
                    label="Público"
                    value={`${nf.format(audience?.sendable ?? 0)} pessoas${
                      audience && audience.matched > audience.sendable
                        ? ` · ${nf.format(audience.matched - audience.sendable)} serão puladas`
                        : ""
                    }`}
                    onEdit={() => setStep(1)}
                  />
                  <ReviewRow
                    label="Quando"
                    value={
                      when === "now"
                        ? "Agora"
                        : (scheduleDate?.toLocaleString("pt-BR", {
                            dateStyle: "long",
                            timeStyle: "short",
                          }) ?? "")
                    }
                    onEdit={() => setStep(2)}
                  />
                  {channel === "WHATSAPP" && audience?.estimate && (
                    <ReviewRow
                      label="Duração estimada"
                      value={
                        audience.estimate.days > 1
                          ? `cerca de ${audience.estimate.days} dias (${fmtDuration(audience.estimate.activeMinutes)} de envio)`
                          : fmtDuration(audience.estimate.activeMinutes)
                      }
                      onEdit={() => setStep(2)}
                    />
                  )}
                </dl>
              </Section>
              <MessagePreview
                data={preview}
                loading={!preview}
                fromLabel={template.name}
                channels={[channel]}
              />
            </>
          )}

          <div className="border-border flex items-center justify-between gap-3 border-t pt-5">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              <ArrowLeft /> Voltar
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                Continuar <ArrowRight />
              </Button>
            ) : (
              <Button onClick={create} loading={creating} size="lg">
                {when === "schedule"
                  ? "Agendar envio"
                  : `Enviar para ${nf.format(audience?.sendable ?? 0)} pessoas`}
              </Button>
            )}
          </div>
        </div>

        {/* Resumo do público, ao vivo */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <AudienceSummary
            step={step}
            audience={audience}
            error={audienceError}
            counting={counting}
            channel={channel}
          />
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h4 className="text-base font-semibold">{title}</h4>
        {description && <p className="text-fg-subtle mt-0.5 text-sm">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-start">
      <span className="text-fg-subtle pt-1.5 text-sm">{label}</span>
      {children}
    </div>
  );
}

function NumberPair({
  label,
  a,
  b,
  onA,
  onB,
  hint,
}: {
  label: string;
  a: number;
  b: number;
  onA: (v: number) => void;
  onB: (v: number) => void;
  hint?: string;
}) {
  const parse = (s: string) => Number(s.replace(/\D/g, "")) || 0;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <Input
          aria-label={`${label}: mínimo`}
          inputMode="numeric"
          value={a}
          onChange={(e) => onA(parse(e.target.value))}
        />
        <span className="text-fg-subtle text-sm">a</span>
        <Input
          aria-label={`${label}: máximo`}
          inputMode="numeric"
          value={b}
          onChange={(e) => onB(parse(e.target.value))}
        />
      </div>
      {hint && <span className="text-fg-subtle text-xs">{hint}</span>}
    </div>
  );
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <dt className="text-fg-subtle w-32 shrink-0">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium">{value}</dd>
      <Button variant="link" size="sm" onClick={onEdit}>
        Alterar
      </Button>
    </div>
  );
}

function AudienceSummary({
  step,
  audience,
  error,
  counting,
  channel,
}: {
  step: number;
  audience: AudiencePreview | null;
  error: string | null;
  counting: boolean;
  channel: Channel;
}) {
  if (step === 0) {
    return (
      <Panel>
        <PanelBody className="text-fg-muted flex flex-col gap-2 text-sm">
          <p className="text-fg font-semibold">Como funciona</p>
          <p>Cada pessoa recebe a mensagem com os próprios dados. Ninguém recebe duas vezes.</p>
          <p>
            Quem não tem {channel === "EMAIL" ? "e-mail" : "WhatsApp"} válido é pulado — e você vê
            quem, antes de enviar.
          </p>
        </PanelBody>
      </Panel>
    );
  }
  const skipped = audience ? audience.matched - audience.sendable : 0;
  return (
    <Panel>
      <PanelBody className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-fg-subtle text-xs font-medium">Vão receber</span>
          {counting && <Spinner className="size-3.5" />}
        </div>
        {error ? (
          <p className="text-danger text-sm">{error}</p>
        ) : (
          <>
            <p
              className={cn(
                "tabular text-[40px] leading-none font-semibold tracking-tight",
                counting && "opacity-50",
              )}
            >
              {audience ? nf.format(audience.sendable) : "—"}
            </p>
            {audience && (
              <p className="text-fg-subtle text-sm">
                de {nf.format(audience.matched)} pessoas no filtro
              </p>
            )}
          </>
        )}
        {audience && skipped > 0 && (
          <div className="border-border flex flex-col gap-2 border-t pt-4">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <X className="text-warning size-3.5" strokeWidth={3} /> {nf.format(skipped)} serão
              puladas
            </p>
            <ul className="text-fg-muted flex flex-col gap-1 text-xs">
              {Object.entries(audience.skippedByReason).map(([k, n]) => (
                <li key={k} className="flex justify-between gap-2">
                  <span>{SKIP_TEXT[k] ?? k}</span>
                  <span className="tabular">{n}</span>
                </li>
              ))}
            </ul>
            {audience.skippedSample.length > 0 && (
              <details className="text-xs">
                <summary className="text-brand-text cursor-pointer select-none">Ver quem</summary>
                <ul className="text-fg-muted mt-2 flex flex-col gap-1">
                  {audience.skippedSample.map((s, i) => (
                    <li key={i}>
                      <span className="text-fg">{s.name || "Sem nome"}</span> — {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {audience && audience.sample.length > 0 && (
          <div className="border-border flex flex-col gap-1.5 border-t pt-4">
            <p className="text-fg-subtle text-xs font-medium">Primeiros da fila</p>
            {audience.sample.map((s, i) => (
              <p key={i} className="flex justify-between gap-2 text-xs">
                <span className="truncate">{s.name}</span>
                <span className="text-fg-subtle font-mono">{maskTarget(s.target)}</span>
              </p>
            ))}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

const SKIP_TEXT: Record<string, string> = {
  NO_EMAIL: "Sem e-mail",
  INVALID_EMAIL: "E-mail inválido",
  NO_PHONE: "Sem WhatsApp",
  INVALID_PHONE: "Telefone inválido",
  DUPLICATE: "Destino repetido",
  OPT_OUT: "Não autorizou WhatsApp",
};

function PeoplePicker({
  tenant,
  projectId,
  picked,
  onChange,
}: {
  tenant: string;
  projectId: string;
  picked: Map<string, string>;
  onChange: (m: Map<string, string>) => void;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{
    key: string;
    rows: { id: string; name: string; detail: string }[];
  } | null>(null);
  const key = `${projectId}|${q}`;
  useEffect(() => {
    const h = setTimeout(async () => {
      const r = await searchRegistrations({ tenant, projectId, q });
      setFound({ key, rows: r.ok ? r.data : [] });
    }, 250);
    return () => clearTimeout(h);
  }, [tenant, projectId, q, key]);
  const rows = found?.rows ?? [];
  const loading = found?.key !== key;
  const toggle = (id: string, name: string) => {
    const m = new Map(picked);
    if (m.has(id)) m.delete(id);
    else m.set(id, name);
    onChange(m);
  };
  return (
    <Section title="Escolha as pessoas" description={`${picked.size} selecionada(s).`}>
      <Input
        leading={<Search />}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nome ou e-mail"
        aria-label="Buscar pessoa"
      />
      {picked.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {[...picked].map(([id, name]) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id, name)}
              className="bg-brand-subtle text-brand-subtle-fg inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium"
            >
              {name} <X className="size-3" aria-label="Remover" />
            </button>
          ))}
        </div>
      )}
      <ul className="divide-border border-border max-h-80 divide-y overflow-y-auto rounded-md border">
        {loading && !rows.length && (
          <li className="text-fg-subtle flex items-center gap-2 px-4 py-3 text-sm">
            <Spinner className="size-3.5" /> Buscando…
          </li>
        )}
        {!loading && !rows.length && (
          <li className="text-fg-subtle px-4 py-6 text-center text-sm">Ninguém encontrado.</li>
        )}
        {rows.map((r) => (
          <li key={r.id}>
            <label className="hover:bg-surface-muted flex cursor-pointer items-center gap-3 px-4 py-2.5">
              <Checkbox checked={picked.has(r.id)} onCheckedChange={() => toggle(r.id, r.name)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.name}</span>
                <span className="text-fg-subtle block truncate text-xs">{r.detail}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Section>
  );
}
