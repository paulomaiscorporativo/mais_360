import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileText, Mail, Phone, UserCheck } from "lucide-react";
import { zonedParts } from "@mais/core";
import {
  canBook,
  canChooseQuote,
  canStaffCancel,
  canStaffQuote,
  centsToInput,
  currentApproval,
  QUOTE_LINE_TYPES,
  routeLabel,
} from "@mais/core/corporate-travel";
import {
  PolicyNotice,
  Protocol,
  Timeline,
  TravelStatusBadge,
} from "@/components/corporate-travel/display";
import { BOOKING_TYPES, SERVICE_ICON } from "@/components/corporate-travel/labels";
import { QuoteCompare } from "@/components/corporate-travel/quote-compare";
import { SectionTitle } from "@/components/travel/kit";
import { Badge, Button, EmptyState, Notice, Panel } from "@/components/ui";
import { guard } from "@/server/auth";
import {
  corporateTravelBase,
  currentRound,
  REQUEST_DETAIL_INCLUDE,
  requireCorporateTravel,
} from "@/server/corporate-travel";
import { requestView } from "@/server/corporate-travel-view";
import {
  ApprovalDecision,
  AssignControl,
  BookButton,
  CancelButton,
  QuoteActions,
  QuoteEditor,
  SendQuotesButton,
  UploadDocument,
  type BookingLine,
  type QuoteDraft,
} from "./desk";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}): Promise<Metadata> {
  const { tenant, id } = await params;
  const c = await requireCorporateTravel(tenant).catch(() => null);
  const r = c
    ? await c.db.travelRequest.findFirst({ where: { id }, select: { protocol: true } })
    : null;
  return { title: r ? `Solicitação ${r.protocol}` : "Solicitação de viagem" };
}

const LINE_TYPES = new Set<string>(QUOTE_LINE_TYPES);

/** Atendimento de uma solicitação: cotação, envio, aprovação, reserva manual e histórico. */
export default async function TravelRequestDetailPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; id: string }>;
}) {
  const { ws, tenant, id } = await params;
  const c = await guard(requireCorporateTravel(tenant));
  if (id.length > 40) notFound();
  const r = await c.db.travelRequest.findFirst({ where: { id }, include: REQUEST_DETAIL_INCLUDE });
  if (!r) notFound();
  const v = requestView(r, c.tz, "staff");
  const base = corporateTravelBase(ws, tenant);
  const team = c.canAttend
    ? (
        await c.db.membership.findMany({
          where: { role: { in: ["ADMIN", "MANAGER", "OPERATOR"] }, user: { active: true } },
          include: { user: { select: { id: true, name: true, email: true } } },
        })
      ).map((m) => ({ id: m.user.id, name: m.user.name || m.user.email }))
    : [];
  const ctx = { tenant, requestId: r.id };
  const quoting = c.canAttend && canStaffQuote(r.status);
  const now = new Date();
  const validQuotes = r.quotes.filter((q) => !q.validUntil || q.validUntil > now).length;
  const pending = currentApproval(currentRound(r.approvals, r.decidedAt));
  const canDecide =
    c.canApprove &&
    r.status === "AWAITING_APPROVAL" &&
    !!pending &&
    (!pending.approverUserId || pending.approverUserId === c.viewer.user.id);
  const chosen = r.quotes.find((q) => q.id === r.chosenQuoteId);

  const bookable = new Set<string>(BOOKING_TYPES);
  const bookingSuggestions: BookingLine[] = (chosen?.serviceItems ?? [])
    .filter((i) => i.type !== "SERVICE_FEE")
    .map((i) => ({
      type: (bookable.has(i.type) ? i.type : "CUSTOM") as BookingLine["type"],
      title: i.title,
      locator: "",
      notes: "",
    }));
  if (!bookingSuggestions.length)
    bookingSuggestions.push({ type: "AIR", title: "", locator: "", notes: "" });

  const drafts = new Map<string, QuoteDraft>(
    r.quotes.map((q) => {
      const p = q.validUntil ? zonedParts(q.validUntil, c.tz) : null;
      const pad = (n: number) => String(n).padStart(2, "0");
      return [
        q.id,
        {
          id: q.id,
          title: q.title,
          description: q.description,
          currency: (["BRL", "USD", "EUR"].includes(q.currency)
            ? q.currency
            : "BRL") as QuoteDraft["currency"],
          validUntil: p ? `${p.day}T${pad(p.hour)}:${pad(p.minute)}` : "",
          lines: q.serviceItems
            .filter((i) => LINE_TYPES.has(i.type))
            .map((i) => {
              const d = (i.details ?? {}) as Record<string, unknown>;
              return {
                type: i.type as QuoteDraft["lines"][number]["type"],
                title: i.title,
                description: i.description,
                amount: centsToInput(i.saleCents),
                quantity: String(i.quantity),
                cabin: typeof d.cabin === "string" ? d.cabin : "",
                stars: typeof d.stars === "number" ? String(d.stars) : "",
              };
            }),
        },
      ];
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
          <Link href={base}>
            <ArrowLeft /> Solicitações
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <TravelStatusBadge status={r.status} />
              <Protocol value={v.protocol} className="text-fg-subtle" />
              <Badge size="sm">{v.scope}</Badge>
              <Badge size="sm">{v.tripType}</Badge>
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              {routeLabel(r.segments) || r.destination}
            </h1>
            <p className="text-fg-muted text-sm">
              {v.segments[0]?.date}
              {r.returnDate && v.segments.length > 1
                ? ` a ${v.segments[v.segments.length - 1]!.date}`
                : ""}{" "}
              · {v.pax} {v.pax === 1 ? "passageiro" : "passageiros"} · recebida em {v.createdAt}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quoting && (
              <SendQuotesButton
                {...ctx}
                count={validQuotes}
                resend={r.status === "QUOTED" || r.status === "REJECTED"}
              />
            )}
            {c.canAttend && (canBook(r.status) || r.status === "BOOKED") && (
              <BookButton {...ctx} append={r.status === "BOOKED"} suggested={bookingSuggestions} />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-8">
          {r.status === "APPROVED" && c.canAttend && (
            <Notice tone="success" title="Pronta para emitir">
              {chosen
                ? `Opção escolhida: ${chosen.title}. Emita no fornecedor, lance no Travellink e registre os localizadores.`
                : "Registre os localizadores depois de emitir."}
            </Notice>
          )}
          <PolicyNotice violations={v.violations} justification={v.justification} />

          {canDecide && pending && (
            <Panel className="border-warning-border flex flex-col gap-3 p-5">
              <div>
                <p className="text-sm font-semibold">
                  Sua aprovação: {pending.stepName || "Aprovação"}
                </p>
                <p className="text-fg-muted text-sm">
                  {chosen
                    ? `${r.requesterName} escolheu "${chosen.title}" (${v.quotes.find((q) => q.id === chosen.id)?.total ?? ""}).`
                    : "Confira a opção escolhida."}
                </p>
              </div>
              <ApprovalDecision {...ctx} approvalId={pending.id} />
            </Panel>
          )}

          {v.bookings.length > 0 && (
            <section>
              <SectionTitle>Reservas emitidas</SectionTitle>
              <ul className="border-border divide-border divide-y rounded-lg border">
                {v.bookings.map((b) => {
                  const Icon = SERVICE_ICON[b.type] ?? FileText;
                  return (
                    <li key={b.id} className="flex flex-col gap-3 p-4">
                      <div className="flex items-start gap-3">
                        <Icon className="text-fg-subtle mt-0.5 size-4 shrink-0" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-fg-subtle text-xs">{b.label}</p>
                          <p className="font-medium">{b.title}</p>
                          {b.notes && <p className="text-fg-muted text-sm">{b.notes}</p>}
                        </div>
                        {b.locator && (
                          <span className="bg-surface-muted rounded-sm px-2 py-1 font-mono text-sm font-semibold">
                            {b.locator}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pl-7">
                        {b.files.map((f, i) => (
                          <Button key={f.id} asChild variant="ghost" size="sm">
                            <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">
                              <Download />{" "}
                              {f.kind === "VOUCHER"
                                ? "Voucher"
                                : f.kind === "ETICKET"
                                  ? "Bilhete"
                                  : `Documento ${i + 1}`}
                            </a>
                          </Button>
                        ))}
                        {c.canAttend && <UploadDocument {...ctx} itemId={b.id} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section>
            <SectionTitle
              action={
                quoting ? (
                  <QuoteEditor
                    {...ctx}
                    defaultServices={r.requestedServices}
                    trigger={{ label: "Nova opção" }}
                  />
                ) : undefined
              }
            >
              Opções cotadas
            </SectionTitle>
            {v.quotes.length ? (
              <QuoteCompare
                quotes={v.quotes}
                pax={v.pax}
                actions={
                  c.canAttend
                    ? (q) => (
                        <QuoteActions
                          {...ctx}
                          quoteId={q.id}
                          quoteTitle={q.title}
                          draft={drafts.get(q.id)!}
                          defaultServices={r.requestedServices}
                          canEdit={quoting && !(q.chosen && r.status !== "REJECTED")}
                          canChoose={canChooseQuote(r.status) && !q.expired}
                          outOfPolicy={q.inPolicy === false}
                          needsJustification={v.requireJustification}
                        />
                      )
                    : undefined
                }
              />
            ) : (
              <EmptyState
                title="Nenhuma opção cotada ainda"
                description={
                  quoting
                    ? "Monte as opções com o valor de cada serviço. O solicitante compara lado a lado e escolhe pela área dele."
                    : "As opções aparecem aqui quando a equipe cotar."
                }
                action={
                  quoting ? (
                    <QuoteEditor
                      {...ctx}
                      defaultServices={r.requestedServices}
                      trigger={{ label: "Montar a primeira opção", variant: "primary", size: "md" }}
                    />
                  ) : undefined
                }
              />
            )}
          </section>

          <section className="grid gap-8 md:grid-cols-2">
            <div>
              <SectionTitle>Roteiro</SectionTitle>
              <ol className="flex flex-col gap-2">
                {v.segments.map((s, i) => (
                  <li key={s.id} className="border-border rounded-md border px-3 py-2">
                    <p className="text-fg-subtle text-xs">
                      Trecho {i + 1} · {s.date}
                      {s.time ? ` · ${s.time}` : ""}
                    </p>
                    <p className="text-sm font-medium">
                      {s.origin} → {s.destination}
                    </p>
                    {s.notes && <p className="text-fg-muted text-xs">{s.notes}</p>}
                  </li>
                ))}
              </ol>
              {v.flexibleDates && (
                <p className="text-fg-subtle mt-2 text-xs">
                  Datas flexíveis (um dia antes ou depois).
                </p>
              )}
              <SectionTitle className="mt-6">Serviços pedidos</SectionTitle>
              <ul className="flex flex-col gap-2 text-sm">
                {v.services.map((s) => (
                  <li key={s.type}>
                    <span className="font-medium">{s.label}</span>
                    {s.text && <span className="text-fg-muted"> · {s.text}</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <SectionTitle>Passageiros</SectionTitle>
              <ul className="flex flex-col gap-3">
                {v.passengers.map((p) => (
                  <li key={p.id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      <Badge size="sm">{p.type}</Badge>
                      {p.linked && (
                        <Badge size="sm" tone="info">
                          No cadastro
                        </Badge>
                      )}
                    </div>
                    <p className="text-fg-muted text-xs">
                      {[
                        p.doc,
                        p.docExpiry && `validade ${p.docExpiry}`,
                        p.birthDate && `nasc. ${p.birthDate}`,
                        p.loyalty,
                        p.contact,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
              <SectionTitle className="mt-6">Motivo</SectionTitle>
              <p className="text-sm whitespace-pre-line">{v.purpose}</p>
              {v.notes && (
                <p className="text-fg-muted mt-2 text-sm whitespace-pre-line">{v.notes}</p>
              )}
              {v.budget && (
                <p className="text-fg-muted mt-2 text-sm">
                  Orçamento: <span className="tabular text-fg">{v.budget}</span>
                </p>
              )}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <Panel className="flex flex-col gap-4 p-5">
            <div>
              <p className="text-fg-subtle text-xs font-medium">Solicitante</p>
              <p className="font-medium">{v.requester}</p>
              {v.company && <p className="text-fg-muted text-sm">{v.company}</p>}
              <div className="mt-2 flex flex-col gap-1 text-sm">
                {v.requesterEmail && (
                  <a
                    className="text-brand-text inline-flex items-center gap-1.5 hover:underline"
                    href={`mailto:${v.requesterEmail}`}
                  >
                    <Mail className="size-3.5" /> {v.requesterEmail}
                  </a>
                )}
                {v.requesterPhone && (
                  <a
                    className="text-brand-text inline-flex items-center gap-1.5 hover:underline"
                    href={`https://wa.me/${v.requesterPhone}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Phone className="size-3.5" /> WhatsApp
                  </a>
                )}
              </div>
            </div>
            <div className="border-border border-t pt-4">
              <p className="text-fg-subtle text-xs font-medium">Responsável</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm">
                <UserCheck className="text-fg-subtle size-3.5" />
                {v.handledBy || "Ninguém assumiu ainda"}
              </p>
              {c.canAttend && r.status !== "BOOKED" && r.status !== "CANCELED" && (
                <div className="mt-3">
                  <AssignControl
                    {...ctx}
                    assignedUserId={r.assignedUserId}
                    meId={c.viewer.user.id}
                    team={team}
                  />
                </div>
              )}
            </div>
            {v.policyName && (
              <div className="border-border border-t pt-4">
                <p className="text-fg-subtle text-xs font-medium">Política aplicada</p>
                <p className="text-sm">{v.policyName}</p>
              </div>
            )}
            {v.approvals.length > 0 && (
              <div className="border-border border-t pt-4">
                <p className="text-fg-subtle text-xs font-medium">Aprovação</p>
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {v.approvals.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2">
                      <span>{a.stepName}</span>
                      <Badge
                        size="sm"
                        tone={
                          a.decision === "APPROVED"
                            ? "success"
                            : a.decision === "REJECTED"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {a.decision === "APPROVED"
                          ? "Aprovada"
                          : a.decision === "REJECTED"
                            ? "Recusada"
                            : a.decision === "SKIPPED"
                              ? "Dispensada"
                              : "Pendente"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <section>
            <SectionTitle>Linha do tempo</SectionTitle>
            <Timeline items={v.timeline} />
          </section>

          {c.canAttend && canStaffCancel(r.status) && (
            <div>
              <CancelButton {...ctx} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
