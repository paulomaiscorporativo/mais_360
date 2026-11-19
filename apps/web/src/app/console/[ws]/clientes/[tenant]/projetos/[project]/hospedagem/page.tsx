import { nights, roomingIssues, toLocalDate } from "@mais/core";
import { guard } from "@/server/auth";
import { projectBase, requireProjectFeature } from "@/server/projects";
import { projectTz, travelersOf } from "@/server/travel";
import { HotelsManager, type HotelData } from "./hotels";

export default async function AccommodationPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  const p = await guard(requireProjectFeature(ws, tenant, project, "ACCOMMODATION"));
  const tz = projectTz(p);

  const [hotels, travelers] = await Promise.all([
    p.db.accommodation.findMany({
      where: { projectId: p.projectId },
      orderBy: [{ checkIn: "asc" }, { name: "asc" }],
      include: {
        rooms: {
          orderBy: [{ number: "asc" }, { id: "asc" }],
          include: { occupants: { select: { registrationId: true } } },
        },
      },
    }),
    travelersOf(p.db, p.projectId),
  ]);

  const data: HotelData[] = hotels.map((h) => {
    const issues = roomingIssues(
      h.rooms.map((r) => ({
        id: r.id,
        type: r.type,
        checkIn: r.checkIn ?? h.checkIn,
        checkOut: r.checkOut ?? h.checkOut,
        occupants: r.occupants.map((o) => o.registrationId),
      })),
    );
    return {
      id: h.id,
      name: h.name,
      address: h.address,
      city: h.city,
      country: h.country,
      phone: h.phone,
      checkIn: toLocalDate(h.checkIn, tz),
      checkOut: toLocalDate(h.checkOut, tz),
      nights: nights(h.checkIn, h.checkOut),
      notes: h.notes,
      overCapacity: issues.filter((i) => i.kind === "OVER_CAPACITY").map((i) => i.roomId),
      rooms: h.rooms.map((r) => ({
        id: r.id,
        number: r.number,
        type: r.type,
        typeLabel: r.typeLabel,
        checkIn: toLocalDate(r.checkIn, tz),
        checkOut: toLocalDate(r.checkOut, tz),
        confirmation: r.confirmation,
        notes: r.notes,
        occupants: r.occupants.map((o) => o.registrationId),
      })),
    };
  });

  return (
    <HotelsManager
      tenant={tenant}
      projectId={p.projectId}
      canEdit={p.canEdit}
      hotels={data}
      travelers={travelers}
      reportHref={`${projectBase(ws, tenant, project)}/hospedagem/rooming`}
      xlsxHref={`${projectBase(ws, tenant, project)}/hospedagem/rooming/xlsx`}
    />
  );
}
