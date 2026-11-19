import { foldText, inviteStatus, poolAvailable, type InviteStatus } from "@mais/core";
import type { Prisma } from "@mais/db";
import { guard } from "@/server/auth";
import { eventSettings } from "@/server/events";
import { requireProjectFeature } from "@/server/projects";
import { tenantPublicBase } from "@/server/public-links";
import { GuestsManager, type GuestRow } from "./guests";

export default async function GuestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
  searchParams: Promise<{ q?: string; status?: string; empresa?: string }>;
}) {
  const { ws, tenant, project } = await params;
  const sp = await searchParams;
  const p = await guard(requireProjectFeature(ws, tenant, project, "INVITES"));

  const where: Prisma.EventInviteWhereInput = { projectId: p.projectId };
  if (sp.empresa) where.companyQuotaId = sp.empresa === "individual" ? null : sp.empresa;
  const q = foldText(sp.q ?? "");
  if (q)
    where.registration = {
      OR: [
        { person: { searchText: { contains: q } } },
        { shortCode: q.replace(/\D/g, "") || "__" },
        { displayCompany: { contains: sp.q, mode: "insensitive" } },
      ],
    };

  const [invites, companies, settings, categories] = await Promise.all([
    p.db.eventInvite.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: {
        companyQuota: { select: { id: true, companyName: true } },
        registration: {
          include: {
            person: true,
            category: true,
            seat: { include: { table: { select: { number: true } } } },
          },
        },
      },
    }),
    p.db.companyQuota.findMany({
      where: { projectId: p.projectId },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true, quota: true, lockedAt: true },
    }),
    eventSettings(p.db, p.projectId),
    p.db.registrationCategory.findMany({
      where: { projectId: p.projectId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  const deliveries = await p.db.messageDelivery.groupBy({
    by: ["registrationId", "channel", "status"],
    where: { registrationId: { in: invites.map((i) => i.registrationId) } },
    _count: true,
  });
  const deliveryMap = new Map<string, string[]>();
  for (const d of deliveries) {
    if (!d.registrationId) continue;
    const list = deliveryMap.get(d.registrationId) ?? [];
    list.push(`${d.channel}:${d.status}`);
    deliveryMap.set(d.registrationId, list);
  }

  const base = await tenantPublicBase(p.tenant);
  const rows: GuestRow[] = [];
  for (const i of invites) {
    const r = i.registration;
    const status: InviteStatus = inviteStatus({ ...r, sentAt: i.sentAt });
    if (sp.status && sp.status !== "ALL" && sp.status !== status) continue;
    if (!sp.status && status === "CANCELED") continue;
    rows.push({
      id: r.id,
      name: `${r.person.firstName} ${r.person.lastName}`.trim(),
      email: r.person.email,
      phone: r.person.phone,
      company: i.companyQuota?.companyName ?? r.displayCompany,
      companyId: i.companyQuota?.id ?? null,
      kind: i.kind,
      status,
      shortCode: r.shortCode,
      table: r.seat ? `${r.seat.table.number}${r.seat.seat ? `·${r.seat.seat}` : ""}` : "",
      category: r.category ? { name: r.category.name, color: r.category.color } : null,
      deliveries: deliveryMap.get(r.id) ?? [],
      link: `${base}/c/${r.token}`,
    });
  }

  const individualUsed = invites.filter(
    (i) => i.kind === "INDIVIDUAL" && i.registration.status !== "CANCELED",
  ).length;

  return (
    <GuestsManager
      tenant={tenant}
      projectId={p.projectId}
      canEdit={p.canEdit}
      rows={rows}
      companies={companies.map((c) => ({ id: c.id, name: c.companyName, locked: !!c.lockedAt }))}
      categories={categories}
      pool={
        settings.quotasExpiredAt
          ? { available: poolAvailable(settings.individualPool, individualUsed), total: settings.individualPool }
          : null
      }
      filters={{ q: sp.q ?? "", status: sp.status ?? "", empresa: sp.empresa ?? "" }}
    />
  );
}
