"use client";

import { Eye, EyeOff, FileText, FolderOpen, Plus, Search, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import {
  EXPIRING_KINDS,
  PERSON_DOCUMENT_KINDS,
  PERSON_DOCUMENT_LABEL,
  PROJECT_DOCUMENT_LABEL,
  REQUIREMENT_STATUS_LABEL,
  requirementSummary,
  type DocumentRequirementStatus,
  type PersonDocumentKind,
  type ProjectDocumentCategory,
  type RequirementRow,
  type TravelSettings,
} from "@mais/core";
import { Badge, Button, EmptyState, Input, Panel } from "@/components/ui";
import { Checkbox, Select, Switch } from "@/components/ui/controls";
import { ConfirmDialog, Sheet } from "@/components/ui/overlay";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilePicker } from "@/components/travel/file-picker";
import { Dot, TextField, useRunAction } from "@/components/travel/kit";
import {
  deletePersonDocument,
  deleteProjectDocument,
  saveTravelSettings,
  setProjectDocumentVisibility,
  uploadPersonDocument,
  uploadProjectDocument,
} from "./actions";

export type TravelerDocRow = {
  registrationId: string;
  name: string;
  shortCode: string;
  group: { name: string; color: string } | null;
  requirements: RequirementRow[];
  docs: {
    id: string;
    kind: PersonDocumentKind;
    number: string;
    country: string;
    expiresLabel: string;
    fileId: string;
    fileName: string;
    uploadedBy: string;
    createdLabel: string;
  }[];
};

export type ProjectDocRow = {
  id: string;
  title: string;
  category: ProjectDocumentCategory;
  registrationId: string | null;
  travelerName: string | null;
  visibleToPerson: boolean;
  fileId: string;
  fileName: string;
  size: number;
  createdLabel: string;
};

const REQ_TONE: Record<DocumentRequirementStatus, "success" | "warning" | "danger" | "neutral"> = {
  OK: "success",
  EXPIRING: "warning",
  EXPIRED: "danger",
  MISSING: "neutral",
};

const fileHref = (id: string) => `/api/files/${id}`;

export function DocumentsManager(props: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  travelers: TravelerDocRow[];
  projectDocs: ProjectDocRow[];
  settings: TravelSettings;
  international: boolean;
  required: PersonDocumentKind[];
}) {
  const pending = props.travelers.filter((t) => !requirementSummary(t.requirements).complete);
  return (
    <Tabs defaultValue="travelers" className="flex flex-col gap-6">
      <TabsList>
        <TabsTrigger value="travelers">
          Dos viajantes
          {pending.length > 0 && (
            <Badge tone="warning" size="sm">
              {pending.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="project">Do projeto</TabsTrigger>
        <TabsTrigger value="rules">Exigências</TabsTrigger>
      </TabsList>
      <TabsContent value="travelers">
        <TravelerDocs {...props} />
      </TabsContent>
      <TabsContent value="project">
        <ProjectDocs {...props} />
      </TabsContent>
      <TabsContent value="rules">
        <Rules {...props} />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Documentos dos viajantes
// ---------------------------------------------------------------------------

function TravelerDocs({
  tenant,
  projectId,
  canEdit,
  travelers,
  required,
}: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  travelers: TravelerDocRow[];
  required: PersonDocumentKind[];
}) {
  const [q, setQ] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [upload, setUpload] = useState<TravelerDocRow | null>(null);
  const [del, setDel] = useState<{ id: string; label: string } | null>(null);
  const { run, pending } = useRunAction();

  const shown = useMemo(() => {
    const term = q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return travelers.filter(
      (t) =>
        (!onlyPending || !requirementSummary(t.requirements).complete) &&
        (!term ||
          t.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(term) ||
          t.shortCode.includes(term)),
    );
  }, [travelers, q, onlyPending]);

  if (!travelers.length)
    return (
      <EmptyState
        icon={<FolderOpen />}
        title="Ainda não há viajantes"
        description="Inclua as pessoas em Inscrições. Aqui você acompanha quem já enviou passaporte, RG, visto e seguro."
      />
    );

  const complete = travelers.filter((t) => requirementSummary(t.requirements).complete).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-fg-muted text-sm">
          <span className="tabular text-fg font-medium">{complete}</span> de{" "}
          <span className="tabular">{travelers.length}</span> com a documentação em dia · exigido:{" "}
          {required.map((k) => PERSON_DOCUMENT_LABEL[k]).join(", ")}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={onlyPending} onCheckedChange={(c) => setOnlyPending(c === true)} />
            Só pendentes
          </label>
          <div className="relative w-56">
            <Search className="text-fg-subtle pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              aria-label="Buscar viajante"
              placeholder="Buscar viajante"
              className="pl-8"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Panel>
        {shown.length === 0 ? (
          <p className="text-fg-subtle px-5 py-8 text-center text-sm">
            {onlyPending ? "Todos em dia neste filtro." : "Ninguém encontrado com essa busca."}
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {shown.map((t) => (
              <li key={t.registrationId} className="flex flex-col gap-3 px-5 py-4 md:flex-row">
                <div className="min-w-0 md:w-56 md:shrink-0">
                  <div className="flex items-center gap-2 font-medium">
                    {t.group && <Dot color={t.group.color} />}
                    <span className="truncate">{t.name}</span>
                  </div>
                  <div className="text-fg-subtle font-mono text-xs">{t.shortCode}</div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {t.requirements.map((r) => (
                      <Badge
                        key={r.kind}
                        tone={REQ_TONE[r.status]}
                        size="sm"
                        title={REQUIREMENT_STATUS_LABEL[r.status]}
                      >
                        {PERSON_DOCUMENT_LABEL[r.kind]}: {REQUIREMENT_STATUS_LABEL[r.status]}
                      </Badge>
                    ))}
                  </div>
                  {t.docs.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {t.docs.map((d) => (
                        <li key={d.id} className="flex items-center gap-2 text-sm">
                          <FileText className="text-fg-subtle size-3.5 shrink-0" />
                          <a
                            href={fileHref(d.fileId)}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {PERSON_DOCUMENT_LABEL[d.kind]}
                            {d.number && <span className="font-mono"> · {d.number}</span>}
                          </a>
                          <span className="text-fg-subtle truncate text-xs">
                            {d.expiresLabel && `vale até ${d.expiresLabel} · `}enviado em{" "}
                            {d.createdLabel}
                            {d.uploadedBy && ` por ${d.uploadedBy}`}
                          </span>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="ml-auto"
                              aria-label={`Excluir ${PERSON_DOCUMENT_LABEL[d.kind]} de ${t.name}`}
                              onClick={() =>
                                setDel({
                                  id: d.id,
                                  label: `${PERSON_DOCUMENT_LABEL[d.kind]} de ${t.name}`,
                                })
                              }
                            >
                              <Trash2 />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {canEdit && (
                  <div className="shrink-0">
                    <Button variant="secondary" size="sm" onClick={() => setUpload(t)}>
                      <Upload /> Enviar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {upload && (
        <PersonDocSheet
          tenant={tenant}
          projectId={projectId}
          traveler={upload}
          suggested={upload.requirements.find((r) => r.status !== "OK")?.kind ?? "PASSPORT"}
          onClose={() => setUpload(null)}
        />
      )}
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        tone="danger"
        title={`Excluir ${del?.label ?? "documento"}?`}
        description="O arquivo deixa de aparecer para a equipe e para o viajante."
        confirmLabel="Excluir"
        loading={pending}
        onConfirm={() => {
          if (!del) return;
          void run(() => deletePersonDocument({ tenant, projectId, id: del.id }), {
            success: "Documento excluído.",
            onSuccess: () => setDel(null),
          });
        }}
      />
    </div>
  );
}

function PersonDocSheet({
  tenant,
  projectId,
  traveler,
  suggested,
  onClose,
}: {
  tenant: string;
  projectId: string;
  traveler: TravelerDocRow;
  suggested: PersonDocumentKind;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<PersonDocumentKind>(suggested);
  const [number, setNumber] = useState("");
  const [country, setCountry] = useState(kind === "PASSPORT" ? "BR" : "");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const { run, pending, errors } = useRunAction();

  function submit() {
    const fd = new FormData();
    fd.set("tenant", tenant);
    fd.set("projectId", projectId);
    fd.set("registrationId", traveler.registrationId);
    fd.set("kind", kind);
    fd.set("number", number);
    fd.set("country", country);
    fd.set("expiresAt", expiresAt);
    if (file) fd.set("file", file);
    void run(() => uploadPersonDocument(fd), { success: "Documento enviado.", onSuccess: onClose });
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Enviar documento"
      description={traveler.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={pending} onClick={submit}>
            Enviar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="doc-kind" className="text-sm font-medium">
            Tipo
          </label>
          <Select
            id="doc-kind"
            value={kind}
            onValueChange={(v) => setKind(v as PersonDocumentKind)}
            options={PERSON_DOCUMENT_KINDS.map((k) => ({
              value: k,
              label: PERSON_DOCUMENT_LABEL[k],
            }))}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_96px]">
          <TextField label="Número" optional value={number} onChange={setNumber} maxLength={40} />
          <TextField
            label="País"
            optional
            value={country}
            onChange={(v) => setCountry(v.toUpperCase())}
            maxLength={2}
            hint="Ex.: BR"
          />
        </div>
        {EXPIRING_KINDS.has(kind) && (
          <TextField
            label="Validade"
            optional
            type="date"
            value={expiresAt}
            onChange={setExpiresAt}
            error={errors.expiresAt}
            hint={kind === "PASSPORT" ? "Precisa valer 6 meses após a volta." : undefined}
          />
        )}
        <FilePicker label="Arquivo" file={file} onChange={setFile} error={errors.file} />
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Documentos do projeto
// ---------------------------------------------------------------------------

function ProjectDocs({
  tenant,
  projectId,
  canEdit,
  projectDocs,
  travelers,
}: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  projectDocs: ProjectDocRow[];
  travelers: TravelerDocRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState<ProjectDocRow | null>(null);
  const { run, pending } = useRunAction();
  const sheet = adding && (
    <ProjectDocSheet
      tenant={tenant}
      projectId={projectId}
      travelers={travelers}
      onClose={() => setAdding(false)}
    />
  );

  if (!projectDocs.length)
    return (
      <>
        <EmptyState
          icon={<FileText />}
          title="Compartilhe os arquivos da viagem"
          description="Apólice do seguro, bilhetes, roteiro em PDF, autorizações. Publique para todo o grupo ou para um viajante — ele baixa no portal."
          action={
            canEdit && (
              <Button onClick={() => setAdding(true)}>
                <Plus /> Novo documento
              </Button>
            )
          }
        />
        {sheet}
      </>
    );

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => setAdding(true)}>
            <Plus /> Novo documento
          </Button>
        </div>
      )}
      <Panel>
        <ul className="divide-border divide-y">
          {projectDocs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-5 py-3">
              <FileText className="text-fg-subtle size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <a
                  href={fileHref(d.fileId)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium hover:underline"
                >
                  {d.title}
                </a>
                <div className="text-fg-subtle flex flex-wrap gap-x-3 text-xs">
                  <span>{PROJECT_DOCUMENT_LABEL[d.category]}</span>
                  <span>{d.travelerName ? `Só para ${d.travelerName}` : "Todo o grupo"}</span>
                  <span>
                    {d.fileName} · {(d.size / 1024 / 1024).toFixed(1)} MB · {d.createdLabel}
                  </span>
                </div>
              </div>
              {!d.visibleToPerson && (
                <Badge size="sm">
                  <EyeOff className="size-3" /> Só equipe
                </Badge>
              )}
              {canEdit && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending}
                    aria-label={d.visibleToPerson ? "Esconder do viajante" : "Mostrar ao viajante"}
                    onClick={() =>
                      run(() =>
                        setProjectDocumentVisibility({
                          tenant,
                          projectId,
                          id: d.id,
                          visible: !d.visibleToPerson,
                        }),
                      )
                    }
                  >
                    {d.visibleToPerson ? <EyeOff /> : <Eye />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Excluir ${d.title}`}
                    onClick={() => setDel(d)}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      {sheet}
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        tone="danger"
        title={`Excluir "${del?.title ?? ""}"?`}
        description="O documento some do portal do viajante."
        confirmLabel="Excluir"
        loading={pending}
        onConfirm={() => {
          if (!del) return;
          void run(() => deleteProjectDocument({ tenant, projectId, id: del.id }), {
            success: "Documento excluído.",
            onSuccess: () => setDel(null),
          });
        }}
      />
    </div>
  );
}

function ProjectDocSheet({
  tenant,
  projectId,
  travelers,
  onClose,
}: {
  tenant: string;
  projectId: string;
  travelers: TravelerDocRow[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ProjectDocumentCategory>("GENERAL");
  const [target, setTarget] = useState("ALL");
  const [visible, setVisible] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const { run, pending, errors } = useRunAction();

  function submit() {
    const fd = new FormData();
    fd.set("tenant", tenant);
    fd.set("projectId", projectId);
    fd.set("title", title);
    fd.set("category", category);
    fd.set("registrationId", target === "ALL" ? "" : target);
    fd.set("visibleToPerson", visible ? "1" : "0");
    if (file) fd.set("file", file);
    void run(() => uploadProjectDocument(fd), {
      success: "Documento publicado.",
      onSuccess: onClose,
    });
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Novo documento"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={pending} onClick={submit}>
            Publicar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Título"
          value={title}
          onChange={setTitle}
          error={errors.title}
          placeholder="Apólice do seguro viagem"
          maxLength={140}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pdoc-category" className="text-sm font-medium">
              Categoria
            </label>
            <Select
              id="pdoc-category"
              value={category}
              onValueChange={(v) => setCategory(v as ProjectDocumentCategory)}
              options={(Object.keys(PROJECT_DOCUMENT_LABEL) as ProjectDocumentCategory[]).map(
                (c) => ({ value: c, label: PROJECT_DOCUMENT_LABEL[c] }),
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pdoc-target" className="text-sm font-medium">
              Para quem
            </label>
            <Select
              id="pdoc-target"
              value={target}
              onValueChange={setTarget}
              invalid={!!errors.registrationId}
              options={[
                { value: "ALL", label: "Todo o grupo" },
                ...travelers.map((t) => ({ value: t.registrationId, label: t.name })),
              ]}
            />
            {errors.registrationId && (
              <p className="text-danger text-xs font-medium">{errors.registrationId}</p>
            )}
          </div>
        </div>
        <FilePicker label="Arquivo" file={file} onChange={setFile} error={errors.file} />
        <label className="border-border flex items-center justify-between gap-4 rounded-md border px-4 py-3">
          <span className="text-sm">
            <span className="font-medium">Visível no portal do viajante</span>
            <span className="text-fg-subtle block">Desligado, só a equipe vê.</span>
          </span>
          <Switch checked={visible} onCheckedChange={setVisible} />
        </label>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Exigências e opções do portal
// ---------------------------------------------------------------------------

function Rules({
  tenant,
  projectId,
  canEdit,
  settings,
  international,
}: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  settings: TravelSettings;
  international: boolean;
}) {
  const [f, setF] = useState<TravelSettings>(settings);
  const { run, pending, errors } = useRunAction();
  const toggle = (k: PersonDocumentKind, on: boolean) =>
    setF((s) => ({
      ...s,
      requiredDocuments: on
        ? [...s.requiredDocuments, k]
        : s.requiredDocuments.filter((x) => x !== k),
    }));

  return (
    <Panel className="max-w-2xl">
      <div className="flex flex-col gap-6 p-5">
        <fieldset className="flex flex-col gap-3" disabled={!canEdit}>
          <legend className="text-base font-semibold">Documentos exigidos de cada viajante</legend>
          <p className="text-fg-subtle text-sm">
            Sem nada marcado, vale o padrão:{" "}
            {international ? "passaporte (a viagem tem voo internacional)" : "RG"}.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PERSON_DOCUMENT_KINDS.filter((k) => k !== "OTHER").map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={f.requiredDocuments.includes(k)}
                  onCheckedChange={(c) => toggle(k, c === true)}
                />
                {PERSON_DOCUMENT_LABEL[k]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm">
            <span className="font-medium">Viajante envia os próprios documentos</span>
            <span className="text-fg-subtle block">
              Pelo portal, com conferência da equipe aqui.
            </span>
          </span>
          <Switch
            disabled={!canEdit}
            checked={f.travelerUploads}
            onCheckedChange={(v) => setF((s) => ({ ...s, travelerUploads: v }))}
          />
        </label>
        <TextField
          label="Contato de emergência da operação"
          optional
          multiline
          rows={2}
          value={f.emergencyContact}
          onChange={(v) => setF((s) => ({ ...s, emergencyContact: v }))}
          error={errors["travel.emergencyContact"]}
          hint="Aparece em destaque no portal. Ex.: Plantão 24h: +55 11 99999-0000 (Ana)."
          maxLength={300}
        />
        {canEdit && (
          <div>
            <Button
              loading={pending}
              onClick={() =>
                run(() => saveTravelSettings({ tenant, projectId, travel: f }), {
                  success: "Exigências salvas.",
                })
              }
            >
              Salvar
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}
