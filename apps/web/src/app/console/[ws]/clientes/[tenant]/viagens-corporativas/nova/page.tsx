import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui";
import { guard } from "@/server/auth";
import { corporateTravelBase, requireCorporateTravel } from "@/server/corporate-travel";
import { NewStaffRequest } from "./new-request";

export const metadata: Metadata = { title: "Nova solicitação de viagem" };

/** Pedido recebido por telefone/e-mail, registrado pela equipe em nome do solicitante. */
export default async function NewStaffRequestPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { ws, tenant } = await params;
  const c = await guard(requireCorporateTravel(tenant));
  if (!c.canAttend) notFound();
  const members = await c.db.person.findMany({
    where: { isMember: true, archivedAt: null },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 500,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      organizations: {
        where: { primary: true },
        take: 1,
        select: { organization: { select: { name: true } } },
      },
    },
  });
  const base = corporateTravelBase(ws, tenant);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={base}>
            <ArrowLeft /> Solicitações
          </Link>
        </Button>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Registrar solicitação</h1>
        <p className="text-fg-muted text-sm">
          Para pedidos que chegaram por telefone ou e-mail. O solicitante acompanha tudo pela área
          dele.
        </p>
      </div>
      <NewStaffRequest
        tenant={tenant}
        base={base}
        requesters={members.map((m) => ({
          id: m.id,
          name: `${m.firstName} ${m.lastName}`.trim(),
          email: m.email,
          company: m.organizations[0]?.organization.name ?? "",
        }))}
      />
    </div>
  );
}
