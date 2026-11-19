import { Contact } from "lucide-react";
import { foldText } from "@mais/core";
import type { Prisma } from "@mais/db";
import { Badge, EmptyState } from "@/components/ui";
import { DataTable } from "@/components/ui/data-table";
import { termsWithDefaults } from "@/config/terms";
import { guard, requireTenant } from "@/server/auth";
import { tenantDb } from "@/server/tenant-db";
import { PeopleFilters } from "./filters";

const PAGE = 200;

export default async function PeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; tenant: string }>;
  searchParams: Promise<{ q?: string; tipo?: string }>;
}) {
  const { ws, tenant: slug } = await params;
  const sp = await searchParams;
  const ctx = await guard(requireTenant(slug));
  const db = tenantDb(ctx);
  const t = termsWithDefaults(await db.tenantTerm.findMany());

  const where: Prisma.PersonWhereInput = { archivedAt: null };
  const q = foldText(sp.q ?? "");
  if (q) {
    const digits = (sp.q ?? "").replace(/\D/g, "");
    where.OR = [
      { searchText: { contains: q } },
      ...(digits.length >= 6 ? [{ cpf: { contains: digits } }, { phone: { contains: digits } }] : []),
    ];
  }
  if (sp.tipo === "membros") where.isMember = true;

  const [people, total, all] = await Promise.all([
    db.person.findMany({
      where,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: PAGE,
      include: {
        organizations: { include: { organization: true }, where: { primary: true }, take: 1 },
        _count: { select: { registrations: true } },
      },
    }),
    db.person.count({ where }),
    db.person.count({ where: { archivedAt: null } }),
  ]);
  const base = `/console/${ws}/clientes/${slug}/pessoas`;

  if (all === 0) {
    return (
      <EmptyState
        icon={<Contact />}
        title="O cadastro de pessoas começa pelos projetos"
        description={`Quem se inscreve, é importado ou é adicionado a um projeto entra aqui uma única vez — ${t["member.plural"].toLowerCase()}, convidados e viajantes no mesmo cadastro, sem duplicar.`}
      />
    );
  }

  return (
    <>
      <PeopleFilters q={sp.q ?? ""} tipo={sp.tipo ?? ""} memberLabel={t["member.plural"]} />
      <p className="text-fg-subtle mb-2 text-sm" aria-live="polite">
        {total} {total === 1 ? "pessoa" : "pessoas"}
        {total > PAGE ? ` · mostrando ${PAGE}; refine a busca` : ""}
      </p>
      {people.length > 0 && (
        <DataTable
          caption="Pessoas do cliente"
          rows={people}
          rowKey={(p) => p.id}
          rowHref={(p) => `${base}/${p.id}`}
          columns={[
            {
              key: "name",
              header: "Nome",
              mobile: "primary",
              cell: (p) => (
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="text-fg-subtle block truncate text-sm">{p.email || "Sem e-mail"}</span>
                </span>
              ),
            },
            {
              key: "org",
              header: "Empresa",
              mobile: "secondary",
              cell: (p) => (
                <span className="text-fg-muted truncate">
                  {p.organizations[0]?.organization.name ?? "—"}
                  {p.jobTitle ? <span className="text-fg-subtle"> · {p.jobTitle}</span> : null}
                </span>
              ),
            },
            {
              key: "regs",
              header: "Projetos",
              align: "right",
              mobile: "desktopOnly",
              cell: (p) => <span className="tabular">{p._count.registrations}</span>,
            },
            {
              key: "kind",
              header: "Tipo",
              mobile: "meta",
              cell: (p) =>
                p.isMember ? (
                  <Badge tone="brand" size="sm">
                    {t["member.singular"]}
                  </Badge>
                ) : (
                  <span className="text-fg-faint text-sm">—</span>
                ),
            },
          ]}
        />
      )}
      {people.length === 0 && (
        <EmptyState title="Ninguém com esses filtros" description="Tente outro nome, e-mail, empresa ou CPF." />
      )}
    </>
  );
}
