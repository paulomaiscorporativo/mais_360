"use client";

import {
  ArrowLeft,
  Copy,
  Eye,
  FlaskConical,
  Mail,
  MessageCircle,
  PenLine,
  Send,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Badge,
  Button,
  Field,
  Input,
  Notice,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/ui";
import { Select, Switch } from "@/components/ui/controls";
import { toast } from "@/components/ui/toast";
import {
  previewTemplateAction,
  saveTemplate,
  sendTestAction,
} from "@/app/console/[ws]/clientes/[tenant]/comunicacao/actions";
import { FieldEditor, FieldPicker, type FieldEditorHandle } from "./field-editor";
import { PURPOSE_LABEL } from "./labels";
import { MessagePreview, type PreviewData } from "./message-preview";
import { STARTERS, type Starter } from "./starters";
import { cn } from "@/lib/cn";

export type TemplateDraft = {
  id: string | null;
  projectId: string | null;
  purpose: string;
  name: string;
  emailSubject: string;
  emailBody: string;
  whatsappBody: string;
  includeActions: boolean;
};

const EMPTY: TemplateDraft = {
  id: null,
  projectId: null,
  purpose: "CUSTOM",
  name: "",
  emailSubject: "",
  emailBody: "",
  whatsappBody: "",
  includeActions: true,
};

/** Converte a marcação do e-mail (**negrito**) para a do WhatsApp (*negrito*). */
const emailToWhatsapp = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "*$1*");

export function TemplateEditor({
  tenant,
  base,
  initial,
  projects,
  fromLabel,
  defaultTestEmail,
  canEdit,
}: {
  tenant: string;
  base: string;
  initial: TemplateDraft | null;
  projects: { id: string; name: string }[];
  fromLabel: string;
  defaultTestEmail: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [t, setT] = useState<TemplateDraft>(initial ?? EMPTY);
  const [chosen, setChosen] = useState<boolean>(!!initial);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [mobileView, setMobileView] = useState<"write" | "preview">("write");
  const [saving, startSave] = useTransition();
  const subjectRef = useRef<FieldEditorHandle>(null);
  const emailRef = useRef<FieldEditorHandle>(null);
  const waRef = useRef<FieldEditorHandle>(null);
  const lastFocused = useRef<"subject" | "email" | "wa">("email");

  const set = <K extends keyof TemplateDraft>(k: K, v: TemplateDraft[K]) => {
    setT((s) => ({ ...s, [k]: v }));
    setDirty(true);
  };

  // Pré-visualização ao vivo (com atraso para não chamar o servidor a cada tecla)
  const previewKey = useMemo(
    () =>
      JSON.stringify([
        t.projectId,
        t.emailSubject,
        t.emailBody,
        t.whatsappBody,
        t.includeActions,
        t.name,
      ]),
    [t],
  );
  useEffect(() => {
    if (!chosen) return;
    setPreviewing(true);
    const handle = setTimeout(async () => {
      const r = await previewTemplateAction({
        tenant,
        projectId: t.projectId,
        template: {
          name: t.name,
          emailSubject: t.emailSubject,
          emailBody: t.emailBody,
          whatsappBody: t.whatsappBody,
          includeActions: t.includeActions,
        },
      });
      if (r.ok) setPreview(r.data);
      setPreviewing(false);
    }, 380);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, chosen, tenant]);

  // Aviso ao sair com alterações não salvas
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const pickStarter = (s: Starter) => {
    setT({
      ...EMPTY,
      purpose: s.purpose,
      name: s.id === "blank" ? "" : s.name,
      emailSubject: s.emailSubject,
      emailBody: s.emailBody,
      whatsappBody: s.whatsappBody,
      includeActions: s.includeActions,
    });
    setChosen(true);
    setDirty(s.id !== "blank");
  };

  const insert = (key: string) => {
    const target = { subject: subjectRef, email: emailRef, wa: waRef }[lastFocused.current];
    target.current?.insertField(key);
  };

  const save = () =>
    startSave(async () => {
      const r = await saveTemplate({
        tenant,
        id: t.id,
        projectId: t.projectId,
        purpose: t.purpose as never,
        template: {
          name: t.name,
          emailSubject: t.emailSubject,
          emailBody: t.emailBody,
          whatsappBody: t.whatsappBody,
          includeActions: t.includeActions,
        },
      });
      if (!r.ok) {
        setErrors(
          Object.fromEntries(
            Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k.replace(/^template\./, ""), v]),
          ),
        );
        toast.error(r.error);
        return;
      }
      setDirty(false);
      setErrors({});
      toast.success(t.id ? "Modelo atualizado." : "Modelo criado.");
      if (!t.id) router.replace(`${base}/modelos/${r.data.id}`);
      else router.refresh();
    });

  if (!chosen) return <StarterGallery onPick={pickStarter} base={base} />;

  const unknown = preview?.unknownFields ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon-sm" aria-label="Voltar aos modelos">
            <Link href={`${base}/modelos`}>
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold tracking-tight">
              {t.name || (t.id ? "Modelo sem nome" : "Novo modelo")}
            </h3>
            <p className="text-fg-subtle text-sm">
              {PURPOSE_LABEL[t.purpose] ?? "Mensagem"}
              {dirty && <span className="text-warning"> · alterações não salvas</span>}
            </p>
          </div>
        </div>
        {canEdit && (
          <Button onClick={save} loading={saving} disabled={!dirty && !!t.id}>
            {t.id ? "Salvar alterações" : "Criar modelo"}
          </Button>
        )}
      </div>

      {/* Alternância no celular: escrever × ver */}
      <div className="bg-surface-sunken grid grid-cols-2 gap-1 rounded-md p-1 lg:hidden">
        {(
          [
            ["write", PenLine, "Escrever"],
            ["preview", Eye, "Pré-visualizar"],
          ] as const
        ).map(([v, Icon, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setMobileView(v)}
            aria-pressed={mobileView === v}
            className={cn(
              "flex h-9 items-center justify-center gap-2 rounded-sm text-sm font-medium transition-colors",
              mobileView === v ? "bg-surface text-fg shadow-sm" : "text-fg-subtle",
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div
          className={cn(
            "flex min-w-0 flex-col gap-5",
            mobileView === "preview" && "hidden lg:flex",
          )}
        >
          <Panel>
            <PanelBody className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
                <Field
                  label="Nome do modelo"
                  error={errors.name}
                  hint="Só a equipe vê. Ex.: “Lembrete D-1”."
                >
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={invalid}
                      disabled={!canEdit}
                      value={t.name}
                      onChange={(e) => set("name", e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Finalidade">
                  {({ id }) => (
                    <Select
                      id={id}
                      disabled={!canEdit}
                      value={t.purpose}
                      onValueChange={(v) => set("purpose", v)}
                      options={Object.entries(PURPOSE_LABEL).map(([value, label]) => ({
                        value,
                        label,
                      }))}
                    />
                  )}
                </Field>
              </div>
              <Field
                label="Disponível em"
                hint="Um modelo do cliente pode ser usado em qualquer evento ou viagem."
              >
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    disabled={!canEdit}
                    value={t.projectId ?? "all"}
                    onValueChange={(v) => set("projectId", v === "all" ? null : v)}
                    options={[
                      { value: "all", label: "Todos os eventos e viagens do cliente" },
                      ...projects.map((p) => ({ value: p.id, label: `Só em ${p.name}` })),
                    ]}
                  />
                )}
              </Field>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title={
                <span className="flex items-center gap-2">
                  <Mail className="text-fg-subtle size-4" /> E-mail
                </span>
              }
              actions={canEdit && <FieldPicker onPick={insert} />}
            />
            <PanelBody className="flex flex-col gap-4">
              <Field label="Assunto" error={errors.emailSubject}>
                {({ id, invalid }) => (
                  <div onFocus={() => (lastFocused.current = "subject")}>
                    <FieldEditor
                      ref={subjectRef}
                      id={id}
                      multiline={false}
                      invalid={invalid}
                      value={t.emailSubject}
                      onChange={(v) => set("emailSubject", v)}
                      placeholder="Ex.: Falta uma semana para o evento"
                    />
                  </div>
                )}
              </Field>
              <Field
                label="Mensagem"
                error={errors.emailBody}
                hint="**texto** deixa em negrito · linha em branco separa parágrafos · links viram clicáveis."
              >
                {({ id, describedBy, invalid }) => (
                  <div onFocus={() => (lastFocused.current = "email")}>
                    <FieldEditor
                      ref={emailRef}
                      id={id}
                      describedBy={describedBy}
                      invalid={invalid}
                      value={t.emailBody}
                      onChange={(v) => set("emailBody", v)}
                      placeholder="Olá, Nome! …"
                    />
                  </div>
                )}
              </Field>
              <label className="flex items-center justify-between gap-4">
                <span>
                  <span className="text-sm font-medium">Botões de ação</span>
                  <span className="text-fg-subtle block text-xs">
                    “Confirmar presença” (para quem ainda não confirmou) e “Abrir meu convite”.
                  </span>
                </span>
                <Switch
                  disabled={!canEdit}
                  checked={t.includeActions}
                  onCheckedChange={(v) => set("includeActions", v)}
                />
              </label>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title={
                <span className="flex items-center gap-2">
                  <MessageCircle className="text-fg-subtle size-4" /> WhatsApp
                </span>
              }
              description="Mais curto e direto. Em branco, usamos o texto do e-mail."
              actions={
                canEdit && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => set("whatsappBody", emailToWhatsapp(t.emailBody))}
                      disabled={!t.emailBody.trim()}
                    >
                      <Copy /> Copiar do e-mail
                    </Button>
                    <FieldPicker onPick={insert} className="hidden sm:inline-flex" />
                  </>
                )
              }
            />
            <PanelBody className="flex flex-col gap-2">
              <div onFocus={() => (lastFocused.current = "wa")}>
                <FieldEditor
                  ref={waRef}
                  ariaLabel="Mensagem de WhatsApp"
                  value={t.whatsappBody}
                  onChange={(v) => set("whatsappBody", v)}
                  placeholder="Olá, Nome! 👋 …"
                  className="min-h-32"
                />
              </div>
              <p className="text-fg-subtle flex justify-between text-xs">
                <span>*negrito* · _itálico_ · links entram como estão</span>
                <span className={cn("tabular", t.whatsappBody.length > 3500 && "text-warning")}>
                  {t.whatsappBody.length}/4000
                </span>
              </p>
            </PanelBody>
          </Panel>

          {unknown.length > 0 && (
            <Notice tone="warning" title="Campos que não existem">
              {unknown.map((u) => `{{${u}}}`).join(", ")} ficarão em branco. Use o botão “Inserir
              campo”.
            </Notice>
          )}
        </div>

        <div
          className={cn(
            "flex min-w-0 flex-col gap-4 lg:sticky lg:top-6",
            mobileView === "write" && "hidden lg:flex",
          )}
        >
          <MessagePreview data={preview} loading={previewing} fromLabel={fromLabel} />
          {canEdit && <TestSend tenant={tenant} draft={t} defaultEmail={defaultTestEmail} />}
        </div>
      </div>
    </div>
  );
}

function TestSend({
  tenant,
  draft,
  defaultEmail,
}: {
  tenant: string;
  draft: TemplateDraft;
  defaultEmail: string;
}) {
  const [channel, setChannel] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [to, setTo] = useState(defaultEmail);
  const [phone, setPhone] = useState("");
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      const r = await sendTestAction({
        tenant,
        projectId: draft.projectId,
        channel,
        to: channel === "EMAIL" ? to : phone,
        template: {
          name: draft.name || "Teste",
          emailSubject: draft.emailSubject,
          emailBody: draft.emailBody,
          whatsappBody: draft.whatsappBody,
          includeActions: draft.includeActions,
        },
      });
      if (r.ok)
        toast.success(`Teste enviado para ${r.data.to}, com os dados de ${r.data.sampleName}.`);
      else toast.error(r.error);
    });
  return (
    <Panel>
      <PanelBody className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="text-fg-subtle size-4" />
          <span className="text-sm font-semibold">Enviar um teste</span>
          <Badge size="sm">não conta nos envios</Badge>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            className="sm:w-36"
            value={channel}
            onValueChange={(v) => setChannel(v as "EMAIL" | "WHATSAPP")}
            options={[
              { value: "EMAIL", label: "E-mail" },
              { value: "WHATSAPP", label: "WhatsApp" },
            ]}
          />
          {channel === "EMAIL" ? (
            <Input
              aria-label="E-mail para o teste"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="voce@empresa.com.br"
            />
          ) : (
            <Input
              aria-label="WhatsApp para o teste"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-8888"
            />
          )}
          <Button variant="secondary" onClick={send} loading={pending} className="shrink-0">
            <Send /> Enviar
          </Button>
        </div>
      </PanelBody>
    </Panel>
  );
}

function StarterGallery({ onPick, base }: { onPick: (s: Starter) => void; base: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Voltar aos modelos">
          <Link href={`${base}/modelos`}>
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Como você quer começar?</h3>
          <p className="text-fg-subtle text-sm">
            Escolha um ponto de partida já escrito — você ajusta tudo antes de salvar.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {STARTERS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            className={cn(
              "group border-border bg-surface hover:border-border-strong flex flex-col gap-3 rounded-md border p-5 text-left shadow-sm transition-[border-color,box-shadow,transform] duration-150",
              "hover:shadow-pop focus-visible:outline-brand-ring focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px",
              s.id === "blank" && "border-dashed bg-transparent shadow-none",
            )}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="font-semibold">{s.name}</span>
              {s.id === "blank" ? (
                <PenLine className="text-fg-faint size-4" />
              ) : (
                <Sparkles className="text-fg-faint group-hover:text-brand-text size-4 transition-colors" />
              )}
            </span>
            <span className="text-fg-subtle text-sm">{s.description}</span>
            {s.emailSubject && (
              <span className="border-border bg-surface-muted text-fg-muted mt-auto line-clamp-2 rounded-sm border px-3 py-2 text-xs leading-relaxed">
                {s.emailSubject.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
                  k === "projeto" ? "Convenção 2026" : k === "primeiro_nome" ? "Maria" : "…",
                )}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
