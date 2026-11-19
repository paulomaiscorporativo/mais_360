import { formatInZone, toLocalDate } from "@mais/core";
import { guard } from "@/server/auth";
import { requireProjectFeature } from "@/server/projects";
import { audienceOptions, projectTz } from "@/server/travel";
import { ItineraryManager, type ItineraryRow } from "./itinerary";

export default async function ItineraryPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  const p = await guard(requireProjectFeature(ws, tenant, project, "ITINERARY"));
  const tz = projectTz(p);
  const [items, options] = await Promise.all([
    p.db.itineraryItem.findMany({
      where: { projectId: p.projectId },
      orderBy: [{ date: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }],
    }),
    audienceOptions(p.db, p.projectId),
  ]);

  const rows: ItineraryRow[] = items.map((i) => ({
    id: i.id,
    date: toLocalDate(i.date, tz),
    dayLabel: i.date ? formatInZone(i.date, tz, "weekday") : "Sem data",
    startTime: i.startTime,
    endTime: i.endTime,
    title: i.title,
    location: i.location,
    responsible: i.responsible,
    notes: i.notes,
    status: i.status,
    audience: i.audience,
    audienceId: i.audienceId,
  }));

  return (
    <ItineraryManager
      tenant={tenant}
      projectId={p.projectId}
      canEdit={p.canEdit}
      items={rows}
      options={options}
      defaultDate={toLocalDate(p.project.startsAt, tz)}
    />
  );
}
