import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, Hourglass, MessageSquareQuote } from "lucide-react";
import { canChooseQuote, canRequesterCancel } from "@mais/core/corporate-travel";
import {
  PolicyNotice,
  Protocol,
  Timeline,
  TravelStatusBadge,
} from "@/components/corporate-travel/display";
import { SERVICE_ICON } from "@/components/corporate-travel/labels";
import { QuoteCompare } from "@/components/corporate-travel/quote-compare";
import { SectionTitle } from "@/components/travel/kit";
import { Badge, Button, Notice } from "@/components/ui";
import { REQUEST_DETAIL_INCLUDE } from "@/server/corporate-travel";
import { requestView } from "@/server/corporate-travel-view";
import { currentMember } from "@/server/member-portal";
import { loadMemberArea, MemberShell } from "../shell";
import { CancelRequestButton, ChooseQuoteButton, MemberMenu } from "../member-client";

export const metadata: Metadata = {
  title: { absolute: "Solicitação de viagem" },
  robots: { index: false, follow: false },
};

const NEXT_STEP: Record<string, string> = {
  NEW: "Recebemos o seu pedido. Assim que alguém da equipe assumir, as opções começam a ser cotadas.",
  IN_PROGRESS: "A equipe está cotando. As opções aparecem aqui e chegam por e-mail.",
  QUOTED: "Compare as opções abaixo e escolha a que prefere.",
  AWAITING_APPROVAL: "Sua escolha está com o aprovador. Avisamos assim que houver decisão.",
  APPROVED: "Aprovada. A equipe está emitindo; os localizadores e documentos aparecem aqui.",
  BOOKED: "Tudo emitido. Seus localizadores e documentos estão abaixo.",
  REJECTED:
    "A opção escolhida não foi aprovada. Você pode escolher outra ou aguardar nova cotação.",
  CANCELED: "Esta solicitação foi cancelada.",
};

export default async function MemberRequestPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; id: string }>;
}) {
  const { tenantSlug, id } = await params;
  const area = await loadMemberArea(tenantSlug);
  if (!area) notFound();
  const m = await currentMember(tenantSlug);
  if (!m || m.person.mustChangePassword) redirect(area.base);
  if (id.length > 40) notFound();
  const r = await m.db.travelRequest.findFirst({
    where: { id, requesterPersonId: m.person.id },
    include: REQUEST_DETAIL_INCLUDE,
  });
  if (!r) notFound();
  const v = requestView(r, m.tz, "member");
  const choosing = canChooseQuote(r.status);
  const rejection = v.approvals.find((a) => a.decision === "REJECTED");
  const fileBase = `${area.base}/${r.id}/arquivo`;

  return (
    <MemberShell
      tenant={area.tenant}
      showProduct={!!area.brand.productName}
      title={v.segments.length ? `${v.segments[0]!.origin} → ${r.destination}` : r.destination}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <Protocol value={v.protocol} className="text-sm opacity-90" />
          <span aria-hidden>·</span>
          {v.tripType} · {v.pax} {v.pax === 1 ? "passageiro" : "passageiros"}
        </span>
      }
      aside={<MemberMenu tenantSlug={tenantSlug} />}
    >
      <div className="flex flex-col gap-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
          <Link href={area.base}>
            <ArrowLeft /> Minhas solicitações
          </Link>
        </Button>

        <div className="flex flex-col gap-3">
          <div>
            <TravelStatusBadge status={r.status} audience="member" />
          </div>
          <p className="text-md text-fg-muted">{NEXT_STEP[r.status]}</p>
          {rejection?.comment && r.status === "REJECTED" && (
            <Notice
              tone="danger"
              icon={<MessageSquareQuote />}
              title="Motivo informado pelo aprovador"
            >
              {rejection.comment}
            </Notice>
          )}
          {r.status === "AWAITING_APPROVAL" && (
            <Notice tone="info" icon={<Hourglass />}>
              {v.approvals.map((a) => a.stepName).join(" → ")}
            </Notice>
          )}
          <PolicyNotice violations={v.violations} justification={v.justification} />
        </div>

        {v.bookings.length > 0 && (
          <section>
            <SectionTitle>Reservas e documentos</SectionTitle>
            <ul className="border-border divide-border divide-y rounded-lg border">
              {v.bookings.map((b) => {
                const Icon = SERVICE_ICON[b.type];
                return (
                  <li key={b.id} className="flex flex-col gap-2 p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-fg-subtle mt-0.5 [&_svg]:size-4">
                        {Icon ? <Icon aria-hidden /> : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-fg-subtle text-xs">{b.label}</p>
                        <p className="font-medium">{b.title}</p>
                        {b.notes && <p className="text-fg-muted text-sm">{b.notes}</p>}
                      </div>
                      {b.locator && (
                        <span className="bg-surface-muted tabular rounded-sm px-2 py-1 font-mono text-sm font-semibold">
                          {b.locator}
                        </span>
                      )}
                    </div>
                    {b.files.length > 0 && (
                      <div className="flex flex-wrap gap-2 pl-7">
                        {b.files.map((f, i) => (
                          <Button key={f.id} asChild variant="secondary" size="sm">
                            <a href={`${fileBase}/${f.id}?baixar=1`}>
                              <Download />{" "}
                              {f.kind === "VOUCHER"
                                ? "Voucher"
                                : f.kind === "ETICKET"
                                  ? "Bilhete"
                                  : `Documento ${i + 1}`}
                            </a>
                          </Button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {v.quotes.length > 0 && (
          <section>
            <SectionTitle>{choosing ? "Opções para você escolher" : "Opções cotadas"}</SectionTitle>
            <QuoteCompare
              quotes={v.quotes}
              pax={v.pax}
              actions={
                choosing
                  ? (q) => (
                      <ChooseQuoteButton
                        tenantSlug={tenantSlug}
                        requestId={r.id}
                        quoteId={q.id}
                        quoteTitle={q.title}
                        outOfPolicy={q.inPolicy === false}
                        needsJustification={v.requireJustification}
                        disabled={q.expired}
                      />
                    )
                  : undefined
              }
            />
          </section>
        )}

        <section className="grid gap-8 md:grid-cols-2">
          <div>
            <SectionTitle>Roteiro</SectionTitle>
            <ol className="flex flex-col gap-3">
              {v.segments.map((s, i) => (
                <li key={s.id} className="border-border rounded-md border p-3">
                  <p className="text-fg-subtle text-xs">
                    Trecho {i + 1} · {s.date}
                    {s.time ? ` · ${s.time}` : ""}
                  </p>
                  <p className="font-medium">
                    {s.origin} → {s.destination}
                  </p>
                </li>
              ))}
            </ol>
            {v.flexibleDates && <p className="text-fg-subtle mt-2 text-sm">Datas flexíveis.</p>}
          </div>
          <div>
            <SectionTitle>Passageiros</SectionTitle>
            <ul className="flex flex-col gap-2">
              {v.passengers.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.name}</span>
                  <Badge size="sm">{p.type}</Badge>
                </li>
              ))}
            </ul>
            <SectionTitle className="mt-6">Serviços pedidos</SectionTitle>
            <ul className="flex flex-col gap-2 text-sm">
              {v.services.map((s) => (
                <li key={s.type}>
                  <span className="font-medium">{s.label}</span>
                  {s.text && <span className="text-fg-muted"> · {s.text}</span>}
                </li>
              ))}
            </ul>
            {v.budget && (
              <p className="text-fg-muted mt-4 text-sm">
                Orçamento informado: <span className="tabular text-fg">{v.budget}</span>
              </p>
            )}
          </div>
        </section>

        <section>
          <SectionTitle>Andamento</SectionTitle>
          <Timeline items={v.timeline} audience="member" />
        </section>

        {canRequesterCancel(r.status) && (
          <div className="border-border flex justify-end border-t pt-6">
            <CancelRequestButton tenantSlug={tenantSlug} requestId={r.id} />
          </div>
        )}
      </div>
    </MemberShell>
  );
}
