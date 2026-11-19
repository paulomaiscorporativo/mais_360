import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatInZone } from "@mais/core";
import { guard } from "@/server/auth";
import { requireCorporateTravel } from "@/server/corporate-travel";
import { tenantPublicBase } from "@/server/public-links";
import { MemberAccessList, type MemberRow } from "./access";

export const metadata: Metadata = { title: "Acessos da área do associado" };

/** Quem entra na área do associado: gerar senha provisória e revogar acesso. */
export default async function MemberAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; tenant: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { tenant } = await params;
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const c = await guard(requireCorporateTravel(tenant));
  if (!c.canConfigure) notFound();
  const people = await c.db.person.findMany({
    where: {
      archivedAt: null,
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { emailNorm: { contains: q.toLowerCase() } },
            ],
          }
        : { isMember: true }),
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 300,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      memberType: true,
      isMember: true,
      passwordHash: true,
      mustChangePassword: true,
      lastLoginAt: true,
    },
  });
  const rows: MemberRow[] = people.map((p) => ({
    id: p.id,
    name: `${p.firstName} ${p.lastName}`.trim(),
    email: p.email,
    memberType: p.memberType,
    hasAccess: !!p.passwordHash,
    provisional: !!p.passwordHash && p.mustChangePassword,
    lastLogin: p.lastLoginAt ? formatInZone(p.lastLoginAt, c.tz, "datetime") : "",
  }));
  return (
    <MemberAccessList
      tenant={tenant}
      rows={rows}
      query={q}
      loginUrl={`${await tenantPublicBase(c.tenant)}/viagens`}
    />
  );
}
