"use client";

import {
  Ban,
  CheckCircle2,
  FileUp,
  Pencil,
  Plus,
  Send,
  Ticket,
  Trash2,
  UserCheck,
  XCircle,
} from "lucide-react";
import { useRef, useState } from "react";
import { CABIN_CLASS_LABELS, CABIN_CLASSES } from "@mais/core";
import { QUOTE_LINE_TYPES, type QuoteInput } from "@mais/core/corporate-travel";
import { serviceLabel } from "@/components/corporate-travel/labels";
import { TextField, useRunAction } from "@/components/travel/kit";
import { Button, Field, Notice } from "@/components/ui";
import { Checkbox, Select } from "@/components/ui/controls";
import { ConfirmDialog, Sheet } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import {
  assignRequest,
  bookRequest,
  cancelByStaff,
  chooseOnBehalf,
  decideApproval,
  deleteQuote,
  saveQuote,
  sendQuotes,
  uploadBookingDocument,
} from "../actions";

type Ctx = { tenant: string; requestId: string };
type QuoteLineInput = QuoteInput["lines"][number];

// ---------------------------------------------------------------------------
// Responsável
// ---------------------------------------------------------------------------

export function AssignControl({
  tenant,
  requestId,
  assignedUserId,
  meId,
  team,
}: Ctx & {
  assignedUserId: string | null;
  meId: string;
  team: { id: string; name: string }[];
}) {
  const { run, pending } = useRunAction();
  const others = team.filter((t) => t.id !== assignedUserId);
  return (
    <div className="flex flex-wrap items-end gap-2">
      {assignedUserId !== meId && (
        <Button
          loading={pending}
          onClick={() =>
            run(() => assignRequest({ tenant, requestId, userId: null }), {
              success: "Atendimento assumido.",
            })
          }
        >
          <UserCheck /> Assumir
        </Button>
      )}
      {others.length > 0 && (
        <div className="w-56">
          <Select
            aria-label="Passar para"
            placeholder="Passar para…"
            options={others.map((t) => ({ value: t.id, label: t.name }))}
            onValueChange={(userId) =>
              run(() => assignRequest({ tenant, requestId, userId }), {
                success: "Responsável alterado.",
              })
            }
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cotações
// ---------------------------------------------------------------------------

export type QuoteDraft = {
  id?: string;
  title: string;
  description: string;
  currency: "BRL" | "USD" | "EUR";
  validUntil: string;
  lines: {
    type: (typeof QUOTE_LINE_TYPES)[number];
    title: string;
    description: string;
    amount: string;
    quantity: string;
    cabin: string;
    stars: string;
  }[];
};

const emptyLine = (type: QuoteDraft["lines"][number]["type"] = "AIR") => ({
  type,
  title: "",
  description: "",
  amount: "",
  quantity: "1",
  cabin: type === "AIR" ? "ECONOMY" : "",
  stars: "",
});

export function QuoteEditor({
  tenant,
  requestId,
  draft,
  defaultServices,
  trigger,
}: Ctx & {
  draft?: QuoteDraft;
  defaultServices: string[];
  trigger: (open: () => void) => React.ReactNode;
}) {
  const { run, pending, errors } = useRunAction();
  const [open, setOpen] = useState(false);
  const initial = (): QuoteDraft =>
    draft ?? {
      title: "",
      description: "",
      currency: "BRL",
      validUntil: "",
      lines: (
        defaultServices.filter((s) =>
          (QUOTE_LINE_TYPES as readonly string[]).includes(s),
        ) as QuoteDraft["lines"][number]["type"][]
      ).map((t) => emptyLine(t)),
    };
  const [q, setQ] = useState<QuoteDraft>(initial);
  const setLine = (i: number, patch: Partial<QuoteDraft["lines"][number]>) =>
    setQ((s) => ({ ...s, lines: s.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const submit = () => {
    const quote: QuoteInput = {
      title: q.title,
      description: q.description,
      currency: q.currency,
      validUntil: q.validUntil,
      lines: q.lines.map((l) => ({
        type: l.type,
        title: l.title,
        description: l.description,
        amount: l.amount,
        quantity: Number(l.quantity) || 1,
        cabin: (l.type === "AIR" ? l.cabin : "") as QuoteLineInput["cabin"],
        stars: (l.type === "HOTEL" ? l.stars : "") as QuoteLineInput["stars"],
      })),
    };
    run(() => saveQuote({ tenant, requestId, quoteId: draft?.id, quote }), {
      onSuccess: (d) => {
        setOpen(false);
        if (d.violations.length) toast.warning(`Fora da política: ${d.violations[0]}`);
      },
      success: draft ? "Opção atualizada." : "Opção criada.",
    });
  };

  return (
    <>
      {trigger(() => {
        setQ(initial());
        setOpen(true);
      })}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={draft ? "Editar opção" : "Nova opção"}
        description="O total é a soma dos serviços; o valor por passageiro sai dele."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button loading={pending} onClick={submit}>
              Salvar opção
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="Nome da opção"
            placeholder="Ex.: Voo direto + hotel no centro"
            value={q.title}
            onChange={(v) => setQ((s) => ({ ...s, title: v }))}
            error={errors.title ?? errors["quote.title"]}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Moeda">
              {(a) => (
                <Select
                  id={a.id}
                  value={q.currency}
                  onValueChange={(v) =>
                    setQ((s) => ({ ...s, currency: v as QuoteDraft["currency"] }))
                  }
                  options={[
                    { value: "BRL", label: "Real (R$)" },
                    { value: "USD", label: "Dólar (US$)" },
                    { value: "EUR", label: "Euro (€)" },
                  ]}
                />
              )}
            </Field>
            <TextField
              label="Válida até"
              type="datetime-local"
              optional
              value={q.validUntil}
              onChange={(v) => setQ((s) => ({ ...s, validUntil: v }))}
              hint="No fuso do cliente."
            />
          </div>

          {q.lines.map((l, i) => (
            <fieldset key={i} className="border-border rounded-md border p-4">
              <legend className="text-fg-muted px-1 text-xs font-semibold">Serviço {i + 1}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipo">
                  {(a) => (
                    <Select
                      id={a.id}
                      value={l.type}
                      onValueChange={(v) =>
                        setLine(i, {
                          type: v as QuoteDraft["lines"][number]["type"],
                          cabin: v === "AIR" ? l.cabin || "ECONOMY" : "",
                        })
                      }
                      options={QUOTE_LINE_TYPES.map((t) => ({ value: t, label: serviceLabel(t) }))}
                    />
                  )}
                </Field>
                <TextField
                  label="Valor total do serviço"
                  inputMode="decimal"
                  placeholder="Ex.: 4.820,00"
                  value={l.amount}
                  onChange={(v) => setLine(i, { amount: v })}
                  error={errors[`quote.lines.${i}.amount`] ?? errors[`lines.${i}.amount`]}
                />
                <TextField
                  label="Descrição curta"
                  className="sm:col-span-2"
                  placeholder={
                    l.type === "AIR" ? "Ex.: TAP TP82/TP81 direto" : "Ex.: Hotel Avenida Palace"
                  }
                  value={l.title}
                  onChange={(v) => setLine(i, { title: v })}
                  error={errors[`quote.lines.${i}.title`]}
                />
                <TextField
                  label="Detalhes"
                  optional
                  multiline
                  rows={2}
                  className="sm:col-span-2"
                  placeholder="Horários, bagagem, regras de cancelamento…"
                  value={l.description}
                  onChange={(v) => setLine(i, { description: v })}
                />
                {l.type === "AIR" && (
                  <Field label="Classe">
                    {(a) => (
                      <Select
                        id={a.id}
                        value={l.cabin || "ECONOMY"}
                        onValueChange={(v) => setLine(i, { cabin: v })}
                        options={CABIN_CLASSES.map((c) => ({
                          value: c,
                          label: CABIN_CLASS_LABELS[c],
                        }))}
                      />
                    )}
                  </Field>
                )}
                {l.type === "HOTEL" && (
                  <>
                    <TextField
                      label="Noites"
                      type="number"
                      inputMode="numeric"
                      value={l.quantity}
                      onChange={(v) => setLine(i, { quantity: v })}
                    />
                    <Field label="Categoria">
                      {(a) => (
                        <Select
                          id={a.id}
                          value={l.stars || "NONE"}
                          onValueChange={(v) => setLine(i, { stars: v === "NONE" ? "" : v })}
                          options={[
                            { value: "NONE", label: "Não informada" },
                            { value: "3", label: "3 estrelas" },
                            { value: "4", label: "4 estrelas" },
                            { value: "5", label: "5 estrelas" },
                          ]}
                        />
                      )}
                    </Field>
                  </>
                )}
              </div>
              {q.lines.length > 1 && (
                <Button
                  variant="danger-ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setQ((s) => ({ ...s, lines: s.lines.filter((_, j) => j !== i) }))}
                >
                  <Trash2 /> Remover serviço
                </Button>
              )}
            </fieldset>
          ))}
          {errors["quote.lines"] && (
            <p className="text-danger text-xs font-medium">{errors["quote.lines"]}</p>
          )}
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => setQ((s) => ({ ...s, lines: [...s.lines, emptyLine("HOTEL")] }))}
          >
            <Plus /> Adicionar serviço
          </Button>
          <TextField
            label="Observações da opção"
            optional
            multiline
            rows={3}
            value={q.description}
            onChange={(v) => setQ((s) => ({ ...s, description: v }))}
          />
        </div>
      </Sheet>
    </>
  );
}

export function QuoteActions({
  tenant,
  requestId,
  quoteId,
  quoteTitle,
  draft,
  defaultServices,
  canEdit,
  canChoose,
  outOfPolicy,
  needsJustification,
}: Ctx & {
  quoteId: string;
  quoteTitle: string;
  draft: QuoteDraft;
  defaultServices: string[];
  canEdit: boolean;
  canChoose: boolean;
  outOfPolicy: boolean;
  needsJustification: boolean;
}) {
  const { run, pending, errors } = useRunAction();
  const [confirm, setConfirm] = useState(false);
  const [choose, setChoose] = useState(false);
  const [justification, setJustification] = useState("");
  return (
    <>
      {canEdit && (
        <QuoteEditor
          tenant={tenant}
          requestId={requestId}
          draft={draft}
          defaultServices={defaultServices}
          trigger={(open) => (
            <Button variant="secondary" size="sm" onClick={open}>
              <Pencil /> Editar
            </Button>
          )}
        />
      )}
      {canChoose && (
        <Button variant="ghost" size="sm" onClick={() => setChoose(true)}>
          <CheckCircle2 /> Registrar escolha
        </Button>
      )}
      {canEdit && (
        <Button
          variant="danger-ghost"
          size="sm"
          aria-label={`Excluir ${quoteTitle}`}
          onClick={() => setConfirm(true)}
        >
          <Trash2 />
        </Button>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Excluir esta opção?"
        description={`"${quoteTitle}" deixa de aparecer para o solicitante.`}
        confirmLabel="Excluir opção"
        tone="danger"
        loading={pending}
        onConfirm={() =>
          run(() => deleteQuote({ tenant, requestId, quoteId }), {
            success: "Opção excluída.",
            onSuccess: () => setConfirm(false),
          })
        }
      />
      <ConfirmDialog
        open={choose}
        onOpenChange={setChoose}
        title="Registrar a escolha do solicitante?"
        description={`Use quando o solicitante escolheu "${quoteTitle}" por telefone ou e-mail. A escolha segue a política e a aprovação do cliente.`}
        confirmLabel="Registrar escolha"
        loading={pending}
        onConfirm={() =>
          run(() => chooseOnBehalf({ tenant, requestId, quoteId, justification }), {
            success: "Escolha registrada.",
            onSuccess: () => setChoose(false),
          })
        }
      >
        {outOfPolicy && (
          <TextField
            label="Justificativa do solicitante"
            optional={!needsJustification}
            multiline
            rows={3}
            value={justification}
            onChange={setJustification}
            error={errors.justification}
          />
        )}
      </ConfirmDialog>
    </>
  );
}

export function SendQuotesButton({
  tenant,
  requestId,
  count,
  resend,
}: Ctx & { count: number; resend: boolean }) {
  const { run, pending, errors } = useRunAction();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(true);
  const [whatsapp, setWhatsapp] = useState(true);
  const [message, setMessage] = useState("");
  return (
    <>
      <Button disabled={!count} onClick={() => setOpen(true)}>
        <Send /> {resend ? "Reenviar opções" : "Enviar opções"}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={resend ? "Reenviar opções ao solicitante" : "Enviar opções ao solicitante"}
        description={`${count} ${count === 1 ? "opção válida" : "opções válidas"}. O solicitante escolhe pela área dele.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                run(
                  () =>
                    sendQuotes({
                      tenant,
                      requestId,
                      message,
                      channels: [
                        ...(email ? (["EMAIL"] as const) : []),
                        ...(whatsapp ? (["WHATSAPP"] as const) : []),
                      ],
                    }),
                  {
                    success: "Opções enviadas. As mensagens saem pela fila de envio.",
                    onSuccess: () => setOpen(false),
                  },
                )
              }
            >
              <Send /> Enviar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Canais</legend>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={email} onCheckedChange={(v) => setEmail(v === true)} /> E-mail
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={whatsapp} onCheckedChange={(v) => setWhatsapp(v === true)} />{" "}
              WhatsApp
            </label>
            {errors.channels && (
              <p className="text-danger text-xs font-medium">{errors.channels}</p>
            )}
          </fieldset>
          <TextField
            label="Recado ao solicitante"
            optional
            multiline
            rows={4}
            placeholder="Ex.: a opção 1 tem a melhor conexão para a feira."
            value={message}
            onChange={setMessage}
          />
        </div>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// Reserva manual e documentos
// ---------------------------------------------------------------------------

export const BOOKING_TYPES = [
  "AIR",
  "HOTEL",
  "TRANSFER",
  "CAR_RENTAL",
  "CHAUFFEUR",
  "TRAVEL_INSURANCE",
  "CURRENCY_EXCHANGE",
  "VISA",
  "CONNECTIVITY",
  "EVENT_TICKET",
  "CUSTOM",
] as const;

export type BookingLine = {
  type: (typeof BOOKING_TYPES)[number];
  title: string;
  locator: string;
  notes: string;
};

export function BookButton({
  tenant,
  requestId,
  suggested,
  append,
}: Ctx & { suggested: BookingLine[]; append: boolean }) {
  const { run, pending, errors } = useRunAction();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<BookingLine[]>(suggested);
  const [note, setNote] = useState("");
  const setLine = (i: number, patch: Partial<BookingLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <>
      <Button
        variant={append ? "secondary" : "primary"}
        onClick={() => {
          setLines(append ? [{ type: "HOTEL", title: "", locator: "", notes: "" }] : suggested);
          setOpen(true);
        }}
      >
        <Ticket /> {append ? "Acrescentar reserva" : "Registrar reserva"}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={append ? "Acrescentar reserva" : "Registrar reserva"}
        description="Reserva manual: emita no fornecedor, lance no Travellink e registre aqui os localizadores."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                run(() => bookRequest({ tenant, requestId, lines, note }), {
                  success: "Reserva registrada e solicitante avisado.",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              <Ticket /> Salvar reserva
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {lines.map((l, i) => (
            <fieldset key={i} className="border-border rounded-md border p-4">
              <legend className="text-fg-muted px-1 text-xs font-semibold">Item {i + 1}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipo">
                  {(a) => (
                    <Select
                      id={a.id}
                      value={l.type}
                      onValueChange={(v) => setLine(i, { type: v as BookingLine["type"] })}
                      options={BOOKING_TYPES.map((t) => ({ value: t, label: serviceLabel(t) }))}
                    />
                  )}
                </Field>
                <TextField
                  label="Localizador"
                  optional
                  placeholder="Ex.: XPTO7K"
                  value={l.locator}
                  onChange={(v) => setLine(i, { locator: v })}
                  inputClassName="font-mono uppercase"
                />
                <TextField
                  label="Descrição"
                  className="sm:col-span-2"
                  value={l.title}
                  onChange={(v) => setLine(i, { title: v })}
                  error={errors[`lines.${i}.title`]}
                />
                <TextField
                  label="Observação"
                  optional
                  className="sm:col-span-2"
                  value={l.notes}
                  onChange={(v) => setLine(i, { notes: v })}
                />
              </div>
              {lines.length > 1 && (
                <Button
                  variant="danger-ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                >
                  <Trash2 /> Remover item
                </Button>
              )}
            </fieldset>
          ))}
          <Button
            variant="secondary"
            className="self-start"
            onClick={() =>
              setLines((ls) => [...ls, { type: "CUSTOM", title: "", locator: "", notes: "" }])
            }
          >
            <Plus /> Adicionar item
          </Button>
          <TextField
            label="Observação ao solicitante"
            optional
            multiline
            rows={3}
            value={note}
            onChange={setNote}
          />
        </div>
      </Sheet>
    </>
  );
}

export function UploadDocument({ tenant, requestId, itemId }: Ctx & { itemId: string }) {
  const { run, pending } = useRunAction();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("VOUCHER");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-40">
        <Select
          aria-label="Tipo de documento"
          value={kind}
          onValueChange={setKind}
          options={[
            { value: "VOUCHER", label: "Voucher" },
            { value: "ETICKET", label: "Bilhete" },
            { value: "CONFIRMATION", label: "Confirmação" },
            { value: "INVOICE", label: "Fatura" },
            { value: "OTHER", label: "Outro" },
          ]}
        />
      </div>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="Arquivo do documento"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.set("tenant", tenant);
          fd.set("requestId", requestId);
          fd.set("itemId", itemId);
          fd.set("kind", kind);
          fd.set("file", file);
          run(() => uploadBookingDocument(fd), { success: "Documento anexado." });
          e.target.value = "";
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() => input.current?.click()}
      >
        <FileUp /> Anexar PDF ou imagem
      </Button>
    </div>
  );
}

export function CancelButton({ tenant, requestId }: Ctx) {
  const { run, pending, errors } = useRunAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button variant="danger-ghost" onClick={() => setOpen(true)}>
        <Ban /> Cancelar solicitação
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancelar esta solicitação?"
        description="O solicitante é avisado com o motivo. As opções e aprovações pendentes deixam de valer."
        confirmLabel="Cancelar solicitação"
        cancelLabel="Manter"
        tone="danger"
        loading={pending}
        onConfirm={() =>
          run(() => cancelByStaff({ tenant, requestId, reason }), {
            success: "Solicitação cancelada.",
            onSuccess: () => setOpen(false),
          })
        }
      >
        <TextField
          label="Motivo"
          multiline
          rows={3}
          value={reason}
          onChange={setReason}
          error={errors.reason}
        />
      </ConfirmDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Aprovação
// ---------------------------------------------------------------------------

export function ApprovalDecision({
  tenant,
  requestId,
  approvalId,
  summary,
}: Ctx & { approvalId: string; summary?: React.ReactNode }) {
  const { run, pending, errors } = useRunAction();
  const [mode, setMode] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [comment, setComment] = useState("");
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setMode("APPROVED")}>
          <CheckCircle2 /> Aprovar
        </Button>
        <Button variant="secondary" onClick={() => setMode("REJECTED")}>
          <XCircle /> Recusar
        </Button>
      </div>
      <ConfirmDialog
        open={mode !== null}
        onOpenChange={(o) => !o && setMode(null)}
        title={mode === "APPROVED" ? "Aprovar esta viagem?" : "Recusar esta opção?"}
        description={
          mode === "APPROVED"
            ? "A equipe segue para a emissão e o solicitante é avisado."
            : "O solicitante é avisado com o motivo e pode escolher outra opção."
        }
        confirmLabel={mode === "APPROVED" ? "Aprovar" : "Recusar"}
        tone={mode === "REJECTED" ? "danger" : "primary"}
        loading={pending}
        onConfirm={() =>
          mode &&
          run(() => decideApproval({ tenant, requestId, approvalId, decision: mode, comment }), {
            success: mode === "APPROVED" ? "Viagem aprovada." : "Opção recusada.",
            onSuccess: () => {
              setMode(null);
              setComment("");
            },
          })
        }
      >
        {summary}
        <TextField
          label={mode === "REJECTED" ? "Motivo da recusa" : "Comentário"}
          optional={mode !== "REJECTED"}
          multiline
          rows={3}
          value={comment}
          onChange={setComment}
          error={errors.comment}
          className="mt-3"
        />
        {mode === "REJECTED" && !errors.comment && (
          <Notice tone="info" className="mt-3">
            O motivo aparece para o solicitante.
          </Notice>
        )}
      </ConfirmDialog>
    </>
  );
}
