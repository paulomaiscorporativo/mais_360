import {
  effectiveTaskStatus,
  formatInZone,
  toLocalDate,
  type ChecklistHistoryEntry,
} from "@mais/core";
import { guard } from "@/server/auth";
import { requireProjectFeature } from "@/server/projects";
import { projectTz } from "@/server/travel";
import { ChecklistManager, type ChecklistRow } from "./checklist";

export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  const p = await guard(requireProjectFeature(ws, tenant, project, "CHECKLIST"));
  const tz = projectTz(p);
  const items = await p.db.checklistItem.findMany({
    where: { projectId: p.projectId },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  const now = new Date();
  const rows: ChecklistRow[] = items.map((i) => ({
    id: i.id,
    subject: i.subject,
    category: i.category,
    responsible: i.responsible,
    startDate: toLocalDate(i.startDate, tz),
    dueDate: toLocalDate(i.dueDate, tz),
    dueLabel: i.dueDate ? formatInZone(i.dueDate, tz, "short") : "",
    status: i.status,
    effective: effectiveTaskStatus(i, now),
    notes: i.notes,
    history: (Array.isArray(i.history) ? (i.history as ChecklistHistoryEntry[]) : [])
      .slice(-5)
      .reverse()
      .map((h) => ({ ...h, at: formatInZone(new Date(h.at), tz, "datetime") })),
  }));
  return (
    <ChecklistManager tenant={tenant} projectId={p.projectId} canEdit={p.canEdit} items={rows} />
  );
}
