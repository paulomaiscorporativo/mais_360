import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCheck } from "lucide-react";
import { formatInZone } from "@mais/core";
import { currentApproval, formatCents, routeLabel } from "@mais/core/corporate-travel";
import { PolicyNotice, Protocol, TravelStatusBadge } from "@/components/corporate-travel/display";
import { SectionTitle } from "@/components/travel/kit";
import { Badge, Button, EmptyState, Notice, Panel } from "@/components/ui";
import { guard } from "@/server/auth";
import {
  corporateTravelBase,
  currentRound,
  readViolations,
  requireCorporateTravel,
} from "@/server/corporate-travel";
import { ApprovalDecision } from "../[id]/desk";

export const metadata: Metadata = { title: "Aprovações de viagem" };

/**
 * Caixa do aprovador: opções escolhidas que esperam decisão (uma etapa por
 * vez), com o motivo e as violações da política à vista. Logo abaixo, as
 * últimas decisões.
 */
export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { ws, tenant } = await params;
  const c = await guard(requireCorporateTravel(tenant));
  const base = corporateTravelBase(ws, tenant);
  const [waiting, decided] = await Promise.all([
    c.db.travelRequest.findMany({
      where: { status: "AWAITING_APPROVAL" },
      orderBy: { decidedAt: "asc" },
      take: 100,
      include: {
        segments: { orderBy: { sortOrder: "asc" }, select: { origin: true, destination: true } },
        chosenQuote: true,
        approvals: { orderBy: [{ requestedAt: "asc" }, { sortOrder: "asc" }] },
      },
    }),
    c.db.travelApproval.findMany({
      where: {
        decision: { in: ["APPROVED", "REJECTED"] },
        request: { tenantId: c.tenantId },
      },
      orderBy: { decidedAt: "desc" },
      take: 20,
      include: {
        request: {
          select: {
            id: true,
            protocol: true,
            requesterName: true,
            destination: true,
            status: true,
          },
        },
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      {!c.canApprove && (
        <Notice tone="info">
          Só quem tem o papel de aprovador (ou administra o cliente) decide. Aqui você acompanha o
          que está pendente.
        </Notice>
      )}
      <section>
        <SectionTitle>Aguardando decisão</SectionTitle>
        {waiting.length === 0 ? (
          <EmptyState
            icon={<CheckCheck />}
            title="Nada esperando aprovação"
            description="Quando um solicitante escolher uma opção que precisa de aprovação, ela aparece aqui com a justificativa e os pontos fora da política."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {waiting.map((r) => {
              const pending = currentApproval(currentRound(r.approvals, r.decidedAt));
              const mine =
                c.canApprove &&
                !!pending &&
                (!pending.approverUserId || pending.approverUserId === c.viewer.user.id);
              const violations = readViolations(r.policyViolations);
              return (
                <li key={r.id}>
                  <Panel className="flex flex-col gap-4 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Protocol value={r.protocol} className="text-fg-subtle" />
                          {r.outOfPolicy && (
                            <Badge tone="warning" size="sm">
                              <AlertTriangle className="size-3" /> Fora da política
                            </Badge>
                          )}
                          {pending && <Badge size="sm">{pending.stepName || "Aprovação"}</Badge>}
                        </div>
                        <p className="mt-1 font-semibold">
                          {routeLabel(r.segments) || r.destination}
                        </p>
                        <p className="text-fg-muted text-sm">
                          {r.requesterName}
                          {r.companyName ? ` · ${r.companyName}` : ""} ·{" "}
                          {r.departDate ? formatInZone(r.departDate, c.tz, "date") : ""} · {r.pax}{" "}
                          {r.pax === 1 ? "passageiro" : "passageiros"}
                        </p>
                      </div>
                      {r.chosenQuote && (
                        <div className="text-right">
                          <p className="tabular text-lg font-semibold">
                            {formatCents(r.chosenQuote.totalCents, r.chosenQuote.currency)}
                          </p>
                          <p className="text-fg-subtle text-xs">{r.chosenQuote.title}</p>
                        </div>
                      )}
                    </div>
                    <PolicyNotice violations={violations} justification={r.justification} />
                    <p className="text-fg-muted text-sm">
                      <span className="text-fg font-medium">Motivo da viagem:</span> {r.purpose}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {mine && pending ? (
                        <ApprovalDecision
                          tenant={tenant}
                          requestId={r.id}
                          approvalId={pending.id}
                        />
                      ) : (
                        <span className="text-fg-subtle text-sm">
                          Esperando {pending?.stepName || "o aprovador"}.
                        </span>
                      )}
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`${base}/${r.id}`}>
                          Ver solicitação <ArrowRight />
                        </Link>
                      </Button>
                    </div>
                  </Panel>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section>
          <SectionTitle>Últimas decisões</SectionTitle>
          <ul className="border-border divide-border divide-y rounded-lg border">
            {decided.map((a) => (
              <li key={a.id}>
                <Link
                  href={`${base}/${a.request.id}`}
                  className="hover:bg-hover flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <Badge tone={a.decision === "APPROVED" ? "success" : "danger"} size="sm">
                    {a.decision === "APPROVED" ? "Aprovada" : "Recusada"}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <Protocol value={a.request.protocol} className="text-fg-subtle mr-2" />
                    {a.request.requesterName} · {a.request.destination}
                    {a.comment ? <span className="text-fg-subtle"> · “{a.comment}”</span> : null}
                  </span>
                  <TravelStatusBadge status={a.request.status} size="sm" />
                  <span className="text-fg-subtle tabular text-xs">
                    {a.decidedAt ? formatInZone(a.decidedAt, c.tz, "datetime") : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
