"use client";

import { CheckCircle2, LifeBuoy, Mail, Paperclip, Phone, Send } from "lucide-react";
import { useState } from "react";
import { TICKET_STATUS_LABEL, ticketAwaitsStaff, type TicketStatus } from "@mais/core";
import { Avatar, Badge, Button, EmptyState, Panel } from "@/components/ui";
import { Checkbox, Select } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/overlay";
import { TextField, useRunAction } from "@/components/travel/kit";
import { cn } from "@/lib/cn";
import { replyTicket, setTicketStatus } from "./actions";

export type TicketRow = {
  id: string;
  subject: string;
  status: TicketStatus;
  traveler: string;
  shortCode: string;
  email: string;
  phone: string;
  updatedLabel: string;
  messages: {
    id: string;
    fromStaff: boolean;
    author: string;
    body: string;
    at: string;
    fileId: string | null;
  }[];
};

const TONE: Record<TicketStatus, "danger" | "info" | "success" | "neutral"> = {
  NEW: "danger",
  IN_PROGRESS: "info",
  ANSWERED: "success",
  RESOLVED: "neutral",
};

type Filter = "QUEUE" | "ANSWERED" | "RESOLVED" | "ALL";

export function SupportDesk({
  tenant,
  projectId,
  canEdit,
  tickets,
}: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  tickets: TicketRow[];
}) {
  const [filter, setFilter] = useState<Filter>("QUEUE");
  const [openId, setOpenId] = useState<string | null>(null);
  const open = tickets.find((t) => t.id === openId) ?? null;

  if (!tickets.length)
    return (
      <EmptyState
        icon={<LifeBuoy />}
        title="Nenhum chamado ainda"
        description="Quando um viajante pedir ajuda pelo portal (troca de quarto, dúvida de bagagem, problema no voo), o chamado aparece aqui e a resposta chega a ele por e-mail e WhatsApp."
      />
    );

  const counts: Record<Filter, number> = {
    QUEUE: tickets.filter((t) => ticketAwaitsStaff(t.status)).length,
    ANSWERED: tickets.filter((t) => t.status === "ANSWERED").length,
    RESOLVED: tickets.filter((t) => t.status === "RESOLVED").length,
    ALL: tickets.length,
  };
  const shown = tickets.filter(
    (t) =>
      filter === "ALL" ||
      (filter === "QUEUE" && ticketAwaitsStaff(t.status)) ||
      (filter === "ANSWERED" && t.status === "ANSWERED") ||
      (filter === "RESOLVED" && t.status === "RESOLVED"),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar chamados">
        {(
          [
            ["QUEUE", "Aguardando a equipe"],
            ["ANSWERED", "Respondidos"],
            ["RESOLVED", "Resolvidos"],
            ["ALL", "Todos"],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              filter === k
                ? "border-brand bg-brand-subtle text-brand-subtle-fg"
                : "border-border text-fg-muted hover:bg-hover",
            )}
          >
            {label} <span className="tabular opacity-70">{counts[k]}</span>
          </button>
        ))}
      </div>

      <Panel>
        {shown.length === 0 ? (
          <p className="text-fg-subtle px-5 py-8 text-center text-sm">
            {filter === "QUEUE"
              ? "Fila zerada: nenhum viajante aguardando resposta."
              : "Nada por aqui neste filtro."}
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {shown.map((t) => {
              const last = t.messages.at(-1);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(t.id)}
                    className="hover:bg-hover flex w-full items-start gap-3 px-5 py-3 text-left"
                  >
                    <Avatar name={t.traveler} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{t.subject}</span>
                        <Badge tone={TONE[t.status]} size="sm" dot={ticketAwaitsStaff(t.status)}>
                          {TICKET_STATUS_LABEL[t.status]}
                        </Badge>
                      </div>
                      <div className="text-fg-subtle mt-0.5 text-sm">
                        {t.traveler} · <span className="font-mono">{t.shortCode}</span> ·{" "}
                        {t.updatedLabel}
                      </div>
                      {last && (
                        <p className="text-fg-muted mt-1 line-clamp-1 text-sm">
                          {last.fromStaff ? "Equipe: " : ""}
                          {last.body}
                        </p>
                      )}
                    </div>
                    <span className="text-fg-subtle tabular shrink-0 text-xs">
                      {t.messages.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {open && (
        <TicketSheet
          key={open.id}
          tenant={tenant}
          projectId={projectId}
          canEdit={canEdit}
          ticket={open}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function TicketSheet({
  tenant,
  projectId,
  canEdit,
  ticket,
  onClose,
}: {
  tenant: string;
  projectId: string;
  canEdit: boolean;
  ticket: TicketRow;
  onClose: () => void;
}) {
  const [body, setBody] = useState("");
  const [resolve, setResolve] = useState(false);
  const { run, pending, errors } = useRunAction();

  return (
    <Sheet
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={ticket.subject}
      description={`${ticket.traveler} · código ${ticket.shortCode}`}
      footer={
        canEdit ? (
          <>
            <label className="flex items-center gap-2 text-sm md:mr-auto">
              <Checkbox checked={resolve} onCheckedChange={(c) => setResolve(c === true)} />
              Marcar como resolvido
            </label>
            <Button
              loading={pending}
              onClick={() =>
                run(() => replyTicket({ tenant, projectId, ticketId: ticket.id, body, resolve }), {
                  success: "Resposta enviada ao viajante.",
                  onSuccess: () => {
                    setBody("");
                    setResolve(false);
                  },
                })
              }
            >
              <Send /> Responder
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <div className="text-fg-muted flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {ticket.email && (
            <a
              className="inline-flex items-center gap-1.5 hover:underline"
              href={`mailto:${ticket.email}`}
            >
              <Mail className="size-3.5" /> {ticket.email}
            </a>
          )}
          {ticket.phone && (
            <a
              className="inline-flex items-center gap-1.5 hover:underline"
              href={`https://wa.me/${ticket.phone}`}
              target="_blank"
              rel="noreferrer"
            >
              <Phone className="size-3.5" /> WhatsApp
            </a>
          )}
          {canEdit && (
            <div className="ml-auto w-48">
              <label htmlFor="ticket-status" className="sr-only">
                Status do chamado
              </label>
              <Select
                id="ticket-status"
                value={ticket.status}
                onValueChange={(v) =>
                  run(
                    () =>
                      setTicketStatus({
                        tenant,
                        projectId,
                        ticketId: ticket.id,
                        status: v as TicketStatus,
                      }),
                    { success: "Status atualizado." },
                  )
                }
                options={(Object.keys(TICKET_STATUS_LABEL) as TicketStatus[]).map((s) => ({
                  value: s,
                  label: TICKET_STATUS_LABEL[s],
                }))}
              />
            </div>
          )}
        </div>

        <ol className="flex flex-col gap-3" aria-label="Conversa">
          {ticket.messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-lg border px-4 py-3",
                m.fromStaff
                  ? "border-brand/30 bg-brand-subtle self-end"
                  : "border-border bg-surface self-start",
              )}
            >
              <div className="text-fg-subtle mb-1 flex items-center gap-2 text-xs">
                <span className="font-medium">{m.fromStaff ? m.author || "Equipe" : m.author}</span>
                <span>{m.at}</span>
              </div>
              <p className="text-sm whitespace-pre-line">{m.body}</p>
              {m.fileId && (
                <a
                  href={`/api/files/${m.fileId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-text mt-2 inline-flex items-center gap-1 text-sm hover:underline"
                >
                  <Paperclip className="size-3.5" /> Anexo
                </a>
              )}
            </li>
          ))}
        </ol>

        {ticket.status === "RESOLVED" && (
          <p className="text-fg-subtle inline-flex items-center gap-1.5 text-sm">
            <CheckCircle2 className="text-success size-4" /> Resolvido. Se o viajante escrever de
            novo, o chamado reabre.
          </p>
        )}

        {canEdit && (
          <TextField
            label="Resposta"
            multiline
            rows={4}
            value={body}
            onChange={setBody}
            error={errors.body}
            hint="Chega ao viajante por e-mail e WhatsApp, com o link do portal."
            maxLength={4000}
          />
        )}
      </div>
    </Sheet>
  );
}
