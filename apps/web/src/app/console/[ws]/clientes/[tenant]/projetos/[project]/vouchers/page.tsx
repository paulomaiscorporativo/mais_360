import { after } from "next/server";
import { formatInZone } from "@mais/core";
import { guard } from "@/server/auth";
import { requireProjectFeature } from "@/server/projects";
import { projectTz, travelersOf } from "@/server/travel";
import { processVoucherJobs, voucherJobsOf } from "@/server/vouchers";
import { VouchersManager, type VoucherTraveler } from "./vouchers";

export default async function VouchersPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
  searchParams: Promise<{ modelo?: string }>;
}) {
  const { ws, tenant, project } = await params;
  const { modelo } = await searchParams;
  const p = await guard(requireProjectFeature(ws, tenant, project, "VOUCHERS"));
  const tz = projectTz(p);

  const [templates, travelers, jobs] = await Promise.all([
    p.db.documentTemplate.findMany({
      where: {
        kind: "VOUCHER",
        archivedAt: null,
        OR: [{ projectId: p.projectId }, { projectId: null }],
      },
      orderBy: [
        { projectId: { sort: "desc", nulls: "last" } },
        { isDefault: "desc" },
        { name: "asc" },
      ],
      select: { id: true, name: true, projectId: true, visibleToPerson: true, isDefault: true },
    }),
    travelersOf(p.db, p.projectId),
    voucherJobsOf(p.projectId),
  ]);
  const selected = templates.find((t) => t.id === modelo) ?? templates[0] ?? null;

  const issued = selected
    ? await p.db.projectDocument.findMany({
        where: {
          projectId: p.projectId,
          category: "VOUCHER",
          title: selected.name,
          registrationId: { not: null },
        },
        select: { registrationId: true, fileId: true, createdAt: true },
      })
    : [];
  const issuedOf = new Map(issued.map((d) => [d.registrationId, d]));

  const rows: VoucherTraveler[] = travelers.map((t) => {
    const doc = issuedOf.get(t.id);
    return {
      id: t.id,
      name: t.name,
      shortCode: t.shortCode,
      group: t.group,
      fileId: doc?.fileId ?? null,
      issuedLabel: doc ? formatInZone(doc.createdAt, tz, "date") : "",
    };
  });

  // Retoma lotes parados (processo reiniciado) quando alguém abre a tela
  if (jobs.some((j) => j.status === "PENDING"))
    after(() => processVoucherJobs().catch((e) => console.error("[vouchers] fila", e)));

  return (
    <VouchersManager
      tenant={tenant}
      projectId={p.projectId}
      canEdit={p.canEdit}
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        scope: t.projectId ? "project" : "tenant",
        visibleToPerson: t.visibleToPerson,
      }))}
      selectedId={selected?.id ?? null}
      travelers={rows}
      jobs={jobs.map((j) => ({
        id: j.id,
        status: j.status,
        total: j.total,
        done: j.done,
        failed: j.failed,
        lastError: j.lastError,
        updatedLabel: formatInZone(j.updatedAt, tz, "datetime"),
      }))}
      libraryHref={`/console/${ws}/clientes/${tenant}/documentos`}
    />
  );
}
