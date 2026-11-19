import { foldText } from "@mais/core";
import type { Prisma } from "@mais/db";
import { guard } from "@/server/auth";
import { requireProject } from "@/server/projects";
import { RegistrationsManager, type RegistrationRow } from "./registrations";

const PAGE = 300;

export default async function RegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
  searchParams: Promise<{ q?: string; status?: string; cat?: string }>;
}) {
  const { ws, tenant, project: slug } = await params;
  const sp = await searchParams;
  const p = await guard(requireProject(ws, tenant, slug));

  const where: Prisma.RegistrationWhereInput = { projectId: p.projectId };
  const q = foldText(sp.q ?? "");
  if (q) {
    where.OR = [
      { person: { searchText: { contains: q } } },
      { shortCode: q.replace(/\D/g, "") || "__" },
      { displayCompany: { contains: sp.q, mode: "insensitive" } },
    ];
  }
  if (sp.status === "ACTIVE" || !sp.status) where.status = { not: "CANCELED" };
  else if (sp.status !== "ALL") where.status = sp.status as Prisma.EnumRegistrationStatusFilter["equals"];
  if (sp.cat) where.categoryId = sp.cat === "none" ? null : sp.cat;

  const [rows, total, categories, groups] = await Promise.all([
    p.db.registration.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: PAGE,
      include: { person: true, category: true, group: true, companionOf: { include: { person: true } } },
    }),
    p.db.registration.count({ where }),
    p.db.registrationCategory.findMany({ where: { projectId: p.projectId }, orderBy: { sortOrder: "asc" } }),
    p.db.projectGroup.findMany({ where: { projectId: p.projectId }, orderBy: { name: "asc" } }),
  ]);

  const data: RegistrationRow[] = rows.map((r) => ({
    id: r.id,
    personId: r.personId,
    name: `${r.person.firstName} ${r.person.lastName}`.trim(),
    email: r.person.email,
    phone: r.person.phone,
    company: r.displayCompany,
    jobTitle: r.displayJobTitle || r.person.jobTitle,
    status: r.status,
    role: r.role,
    source: r.source,
    shortCode: r.shortCode,
    category: r.category ? { id: r.category.id, name: r.category.name, color: r.category.color } : null,
    group: r.group ? { id: r.group.id, name: r.group.name, color: r.group.color } : null,
    companionOf: r.companionOf ? `${r.companionOf.person.firstName} ${r.companionOf.person.lastName}`.trim() : null,
    checkedIn: !!r.checkedInAt,
  }));

  return (
    <RegistrationsManager
      ws={ws}
      tenant={tenant}
      projectSlug={slug}
      projectId={p.projectId}
      canEdit={p.canEdit}
      rows={data}
      total={total}
      truncated={total > PAGE}
      categories={categories.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      groups={groups.map((g) => ({ id: g.id, name: g.name, color: g.color }))}
      filters={{ q: sp.q ?? "", status: sp.status ?? "ACTIVE", cat: sp.cat ?? "" }}
    />
  );
}
