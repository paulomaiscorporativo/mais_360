import { guard } from "@/server/auth";
import { requireProjectFeature } from "@/server/projects";
import { TableMap, type GuestLite, type TableLite } from "./table-map";

export default async function TablesPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  const p = await guard(requireProjectFeature(ws, tenant, project, "TABLES"));

  const [tables, guests] = await Promise.all([
    p.db.eventTable.findMany({
      where: { projectId: p.projectId },
      orderBy: { number: "asc" },
      include: { seats: true },
    }),
    p.db.registration.findMany({
      where: { projectId: p.projectId, status: { notIn: ["CANCELED", "DECLINED"] } },
      orderBy: [{ displayCompany: "asc" }, { person: { firstName: "asc" } }],
      include: { person: true, seat: true, invite: { include: { companyQuota: true } } },
    }),
  ]);

  const t: TableLite[] = tables.map((x) => ({
    id: x.id,
    number: x.number,
    name: x.name,
    capacity: x.capacity,
    shape: x.shape,
    x: x.x,
    y: x.y,
    rotation: x.rotation,
    reservedFor: x.reservedFor,
  }));
  const g: GuestLite[] = guests.map((r) => ({
    id: r.id,
    name: `${r.person.firstName} ${r.person.lastName}`.trim(),
    company: r.invite?.companyQuota?.companyName ?? r.displayCompany,
    status: r.status,
    tableId: r.seat?.tableId ?? null,
    seat: r.seat?.seat ?? null,
  }));

  return (
    <TableMap tenant={tenant} projectId={p.projectId} canEdit={p.canEdit} tables={t} guests={g} />
  );
}
