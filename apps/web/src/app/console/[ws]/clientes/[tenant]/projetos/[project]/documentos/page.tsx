import {
  documentRequirements,
  formatInZone,
  readTravelSettings,
  requiredDocumentKinds,
} from "@mais/core";
import { guard } from "@/server/auth";
import { requireProjectFeature } from "@/server/projects";
import { isInternationalTrip, projectTz, travelersOf } from "@/server/travel";
import { DocumentsManager, type ProjectDocRow, type TravelerDocRow } from "./documents";

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  const p = await guard(requireProjectFeature(ws, tenant, project, "DOCUMENTS"));
  const tz = projectTz(p);

  const [travelers, regs, projectDocs, international] = await Promise.all([
    travelersOf(p.db, p.projectId),
    p.db.registration.findMany({
      where: { projectId: p.projectId, status: { notIn: ["CANCELED", "DECLINED"] } },
      select: { id: true, personId: true },
    }),
    p.db.projectDocument.findMany({
      where: { projectId: p.projectId },
      orderBy: { createdAt: "desc" },
    }),
    isInternationalTrip(p.db, p.projectId),
  ]);
  const personOf = new Map(regs.map((r) => [r.id, r.personId]));
  const personDocs = await p.db.personDocument.findMany({
    where: { personId: { in: [...new Set(regs.map((r) => r.personId))] } },
    orderBy: { createdAt: "desc" },
  });
  const fileIds = [...personDocs.map((d) => d.fileId), ...projectDocs.map((d) => d.fileId)];
  const files = await p.db.storedFile.findMany({
    where: { id: { in: fileIds } },
    select: { id: true, fileName: true, size: true },
  });
  const fileOf = new Map(files.map((f) => [f.id, f]));

  const settings = readTravelSettings(p.project.settings);
  const required = requiredDocumentKinds(settings, international);
  const now = new Date();
  const names = new Map(travelers.map((t) => [t.id, t.name]));

  const travelerRows: TravelerDocRow[] = travelers.map((t) => {
    const docs = personDocs.filter((d) => d.personId === personOf.get(t.id));
    return {
      registrationId: t.id,
      name: t.name,
      shortCode: t.shortCode,
      group: t.group,
      requirements: documentRequirements(required, docs, p.project.endsAt, now),
      docs: docs.map((d) => ({
        id: d.id,
        kind: d.kind,
        number: d.number,
        country: d.country,
        // Validade é data de calendário (meio-dia UTC): exibe sem converter fuso
        expiresLabel: d.expiresAt ? formatInZone(d.expiresAt, "UTC", "date") : "",
        fileId: d.fileId,
        fileName: fileOf.get(d.fileId)?.fileName ?? "arquivo",
        uploadedBy: d.uploadedBy,
        createdLabel: formatInZone(d.createdAt, tz, "date"),
      })),
    };
  });

  const projectRows: ProjectDocRow[] = projectDocs.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    registrationId: d.registrationId,
    travelerName: d.registrationId ? (names.get(d.registrationId) ?? "Viajante removido") : null,
    visibleToPerson: d.visibleToPerson,
    fileId: d.fileId,
    fileName: fileOf.get(d.fileId)?.fileName ?? "arquivo",
    size: fileOf.get(d.fileId)?.size ?? 0,
    createdLabel: formatInZone(d.createdAt, tz, "date"),
  }));

  return (
    <DocumentsManager
      tenant={tenant}
      projectId={p.projectId}
      canEdit={p.canEdit}
      travelers={travelerRows}
      projectDocs={projectRows}
      settings={settings}
      international={international}
      required={required}
    />
  );
}
