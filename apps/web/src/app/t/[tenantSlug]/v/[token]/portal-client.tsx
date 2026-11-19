"use client";

import { CheckCircle2, ChevronDown, FileText, Plus, Send, Upload } from "lucide-react";
import { useState } from "react";
import {
  EXPIRING_KINDS,
  PERSON_DOCUMENT_KINDS,
  PERSON_DOCUMENT_LABEL,
  REQUIREMENT_STATUS_LABEL,
  TICKET_STATUS_TRAVELER_LABEL,
  type DocumentRequirementStatus,
  type PersonDocumentKind,
  type RequirementRow,
  type TicketStatus,
} from "@mais/core";
import { Badge, Button } from "@/components/ui";
import { Select } from "@/components/ui/controls";
import { FilePicker } from "@/components/travel/file-picker";
import { TextField, useRunAction } from "@/components/travel/kit";
import { cn } from "@/lib/cn";
import { openTicket, replyAsTraveler, uploadMyDocument } from "./actions";

export type PortalTicket = {
  id: string;
  subject: string;
  status: TicketStatus;
  updatedLabel: string;
  messages: { id: string; fromStaff: boolean; author: string; body: string; at: string }[];
};

const TONE: Record<TicketStatus, "info" | "success" | "neutral"> = {
  NEW: "info",
  IN_PROGRESS: "info",
  ANSWERED: "success",
  RESOLVED: "neutral",
};

const touch = "h-12 text-md";

// ---------------------------------------------------------------------------
// Suporte
// ---------------------------------------------------------------------------

export function SupportPanel({
  tenantSlug,
  token,
  tickets,
}: {
  tenantSlug: string;
  token: string;
  tickets: PortalTicket[];
}) {
  const [creating, setCreating] = useState(tickets.length === 0);
  const [openId, setOpenId] = useState<string | null>(
    tickets.find((t) => t.status === "ANSWERED")?.id ?? null,
  );
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const { run, pending, errors } = useRunAction();

  return (
    <div className="flex flex-col gap-4">
      {tickets.length > 0 && (
        <ul className="flex flex-col gap-2">
          {tickets.map((t) => (
            <TicketItem
              key={t.id}
              ticket={t}
              open={openId === t.id}
              onToggle={() => setOpenId(openId === t.id ? null : t.id)}
              tenantSlug={tenantSlug}
              token={token}
            />
          ))}
        </ul>
      )}

      {creating ? (
        <div className="flex flex-col gap-3">
          {tickets.length > 0 && <p className="font-semibold">Novo pedido</p>}
          <p className="text-fg-muted text-md">
            Escreva para a equipe da viagem. A resposta chega aqui e no seu e-mail ou WhatsApp.
          </p>
          <TextField
            label="Assunto"
            value={subject}
            onChange={setSubject}
            error={errors.subject}
            placeholder="Troca de quarto, bagagem, horário…"
            inputClassName={touch}
            maxLength={140}
          />
          <TextField
            label="Mensagem"
            multiline
            rows={4}
            value={body}
            onChange={setBody}
            error={errors.body}
            inputClassName="text-md"
            maxLength={4000}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {tickets.length > 0 && (
              <Button variant="secondary" size="lg" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
            )}
            <Button
              size="lg"
              loading={pending}
              onClick={() =>
                run(() => openTicket({ tenantSlug, token, subject, body }), {
                  success: "Pedido enviado. A equipe vai responder por aqui.",
                  onSuccess: (r) => {
                    setSubject("");
                    setBody("");
                    setCreating(false);
                    setOpenId(r.id);
                  },
                })
              }
            >
              <Send /> Enviar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="lg" onClick={() => setCreating(true)}>
          <Plus /> Novo pedido de ajuda
        </Button>
      )}
    </div>
  );
}

function TicketItem({
  ticket,
  open,
  onToggle,
  tenantSlug,
  token,
}: {
  ticket: PortalTicket;
  open: boolean;
  onToggle: () => void;
  tenantSlug: string;
  token: string;
}) {
  const [reply, setReply] = useState("");
  const { run, pending, errors } = useRunAction();
  const panelId = `ticket-${ticket.id}`;
  return (
    <li className="border-border rounded-md border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{ticket.subject}</span>
          <span className="text-fg-subtle block text-xs">{ticket.updatedLabel}</span>
        </span>
        <Badge tone={TONE[ticket.status]} size="sm">
          {TICKET_STATUS_TRAVELER_LABEL[ticket.status]}
        </Badge>
        <ChevronDown
          className={cn(
            "text-fg-subtle size-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div id={panelId} className="border-border flex flex-col gap-3 border-t px-4 py-4">
          <ol className="flex flex-col gap-3" aria-label="Conversa">
            {ticket.messages.map((m) => (
              <li
                key={m.id}
                className={cn(
                  "max-w-[90%] rounded-lg px-4 py-3",
                  m.fromStaff ? "bg-brand-subtle self-start" : "bg-surface-muted self-end",
                )}
              >
                <p className="text-fg-subtle mb-1 text-xs">
                  <span className="font-medium">{m.author}</span> · {m.at}
                </p>
                <p className="text-md whitespace-pre-line">{m.body}</p>
              </li>
            ))}
          </ol>
          {ticket.status === "RESOLVED" && (
            <p className="text-fg-muted inline-flex items-center gap-1.5 text-sm">
              <CheckCircle2 className="text-success size-4" /> Resolvido. Se precisar, responda para
              reabrir.
            </p>
          )}
          <TextField
            label="Responder"
            multiline
            rows={3}
            value={reply}
            onChange={setReply}
            error={errors.body}
            inputClassName="text-md"
            maxLength={4000}
          />
          <Button
            size="lg"
            className="sm:self-end"
            loading={pending}
            onClick={() =>
              run(() => replyAsTraveler({ tenantSlug, token, ticketId: ticket.id, body: reply }), {
                success: "Mensagem enviada.",
                onSuccess: () => setReply(""),
              })
            }
          >
            <Send /> Enviar
          </Button>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Meus documentos
// ---------------------------------------------------------------------------

const REQ_TONE: Record<DocumentRequirementStatus, "success" | "warning" | "danger" | "neutral"> = {
  OK: "success",
  EXPIRING: "warning",
  EXPIRED: "danger",
  MISSING: "neutral",
};

export function MyDocuments({
  tenantSlug,
  token,
  canUpload,
  requirements,
  docs,
}: {
  tenantSlug: string;
  token: string;
  canUpload: boolean;
  requirements: RequirementRow[];
  docs: { id: string; label: string; href: string; expiresLabel: string }[];
}) {
  const firstMissing = requirements.find((r) => r.status !== "OK")?.kind;
  const [form, setForm] = useState(false);
  const [kind, setKind] = useState<PersonDocumentKind>(firstMissing ?? "PASSPORT");
  const [number, setNumber] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const { run, pending, errors } = useRunAction();

  function submit() {
    const fd = new FormData();
    fd.set("tenantSlug", tenantSlug);
    fd.set("token", token);
    fd.set("kind", kind);
    fd.set("number", number);
    fd.set("expiresAt", expiresAt);
    if (file) fd.set("file", file);
    void run(() => uploadMyDocument(fd), {
      success: "Documento enviado. A equipe vai conferir.",
      onSuccess: () => {
        setForm(false);
        setNumber("");
        setExpiresAt("");
        setFile(null);
      },
    });
  }

  return (
    <div>
      <p className="text-fg-subtle mb-2 text-xs font-semibold">Seus documentos</p>
      {requirements.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {requirements.map((r) => (
            <li key={r.kind} className="flex items-center justify-between gap-3">
              <span className="font-medium">{PERSON_DOCUMENT_LABEL[r.kind]}</span>
              <Badge tone={REQ_TONE[r.status]} size="sm">
                {REQUIREMENT_STATUS_LABEL[r.status]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {docs.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1">
          {docs.map((d) => (
            <li key={d.id}>
              <a
                href={d.href}
                target="_blank"
                rel="noreferrer"
                className="text-fg-muted inline-flex min-h-10 items-center gap-2 text-sm hover:underline"
              >
                <FileText className="size-4" />
                {d.label}
                {d.expiresLabel && ` · vale até ${d.expiresLabel}`}
              </a>
            </li>
          ))}
        </ul>
      )}
      {!canUpload ? (
        requirements.some((r) => r.status !== "OK") && (
          <p className="text-fg-muted text-sm">
            Envie seus documentos para a equipe da viagem pelo canal combinado.
          </p>
        )
      ) : form ? (
        <div className="border-border flex flex-col gap-3 rounded-md border p-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="my-doc-kind" className="text-sm font-medium">
              Documento
            </label>
            <Select
              id="my-doc-kind"
              className={touch}
              value={kind}
              onValueChange={(v) => setKind(v as PersonDocumentKind)}
              options={PERSON_DOCUMENT_KINDS.map((k) => ({
                value: k,
                label: PERSON_DOCUMENT_LABEL[k],
              }))}
            />
          </div>
          <TextField
            label="Número"
            optional
            value={number}
            onChange={setNumber}
            inputClassName={touch}
            maxLength={40}
          />
          {EXPIRING_KINDS.has(kind) && (
            <TextField
              label="Validade"
              optional
              type="date"
              value={expiresAt}
              onChange={setExpiresAt}
              error={errors.expiresAt}
              inputClassName={touch}
            />
          )}
          <FilePicker
            label="Foto ou PDF do documento"
            file={file}
            onChange={setFile}
            error={errors.file}
            large
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" size="lg" onClick={() => setForm(false)}>
              Cancelar
            </Button>
            <Button size="lg" loading={pending} onClick={submit}>
              <Upload /> Enviar documento
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="lg" block onClick={() => setForm(true)}>
          <Upload /> Enviar um documento
        </Button>
      )}
    </div>
  );
}
