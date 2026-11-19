import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, Plane, Plus, Users } from "lucide-react";
import { formatInZone } from "@mais/core";
import { routeLabel } from "@mais/core/corporate-travel";
import { Protocol, TravelStatusBadge } from "@/components/corporate-travel/display";
import { Button, EmptyState } from "@/components/ui";
import { personName } from "@/server/corporate-travel";
import { currentMember } from "@/server/member-portal";
import { loadMemberArea, MemberShell } from "./shell";
import { MemberLogin, MemberMenu, MemberPasswordForm } from "./member-client";

export const metadata: Metadata = {
  title: { absolute: "Minhas viagens" },
  robots: { index: false, follow: false },
};

/**
 * Área do associado: sem sessão, a entrada; com senha provisória, a troca;
 * com sessão, as minhas solicitações (mais recentes primeiro).
 */
export default async function MemberTravelPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const area = await loadMemberArea(tenantSlug);
  if (!area) notFound();
  const { tenant, terms, brand, base } = area;
  const m = await currentMember(tenantSlug);
  const showProduct = !!brand.productName;
  const memberLabel = terms["member.singular"];

  if (!m)
    return (
      <MemberShell
        tenant={tenant}
        showProduct={showProduct}
        title={`Área do ${memberLabel.toLowerCase()}`}
      >
        <div className="mx-auto max-w-[400px]">
          <MemberLogin tenantSlug={tenantSlug} memberLabel={memberLabel} />
        </div>
      </MemberShell>
    );

  if (m.person.mustChangePassword)
    return (
      <MemberShell
        tenant={tenant}
        showProduct={showProduct}
        title={`Olá, ${m.person.firstName}`}
        aside={<MemberMenu tenantSlug={tenantSlug} />}
      >
        <div className="mx-auto max-w-[400px]">
          <MemberPasswordForm tenantSlug={tenantSlug} required />
        </div>
      </MemberShell>
    );

  const requests = await m.db.travelRequest.findMany({
    where: { requesterPersonId: m.person.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      segments: { orderBy: { sortOrder: "asc" }, select: { origin: true, destination: true } },
      _count: { select: { quotes: true } },
    },
  });
  const waiting = requests.filter((r) => r.status === "QUOTED" || r.status === "REJECTED").length;

  return (
    <MemberShell
      tenant={tenant}
      showProduct={showProduct}
      title={`Olá, ${m.person.socialName || m.person.firstName}`}
      subtitle={
        waiting
          ? `${waiting} ${waiting === 1 ? "solicitação tem opções" : "solicitações têm opções"} esperando a sua escolha.`
          : "Suas viagens corporativas em um só lugar."
      }
      aside={<MemberMenu tenantSlug={tenantSlug} />}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Minhas solicitações</h2>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={`${base}/nova`}>
              <Plus /> Nova solicitação
            </Link>
          </Button>
        </div>

        {requests.length === 0 ? (
          <EmptyState
            icon={<Plane />}
            title="Sua primeira viagem começa aqui"
            description="Conte para onde vai, quando e o que precisa. A equipe cota e você escolhe a melhor opção por aqui."
            action={
              <Button asChild>
                <Link href={`${base}/nova`}>
                  <Plus /> Pedir uma viagem
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.map((r) => (
              <li key={r.id}>
                <Link
                  href={`${base}/${r.id}`}
                  className="border-border bg-surface hover:border-fg-faint/60 focus-visible:outline-brand-ring group flex items-center gap-4 rounded-lg border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <TravelStatusBadge status={r.status} audience="member" size="sm" />
                      <Protocol value={r.protocol} className="text-fg-subtle" />
                    </div>
                    <p className="mt-2 truncate text-base font-semibold">
                      {routeLabel(r.segments) || r.destination}
                    </p>
                    <p className="text-fg-subtle mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      {r.departDate && (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="size-3.5" />
                          {formatInZone(r.departDate, m.tz, "date")}
                          {r.returnDate ? ` a ${formatInZone(r.returnDate, m.tz, "date")}` : ""}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="size-3.5" />
                        {r.pax} {r.pax === 1 ? "passageiro" : "passageiros"}
                      </span>
                      {r._count.quotes > 0 && r.status !== "NEW" && r.status !== "IN_PROGRESS" && (
                        <span>
                          {r._count.quotes} {r._count.quotes === 1 ? "opção" : "opções"}
                        </span>
                      )}
                    </p>
                  </div>
                  <ArrowRight className="text-fg-faint group-hover:text-fg size-5 shrink-0 transition-colors" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="text-fg-subtle text-xs">
          Conectado como {personName(m.person)}
          {m.company ? ` · ${m.company}` : ""}
        </p>
      </div>
    </MemberShell>
  );
}
