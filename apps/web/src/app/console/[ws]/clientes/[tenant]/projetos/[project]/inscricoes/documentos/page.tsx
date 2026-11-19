import type { Metadata } from "next";
import { guard } from "@/server/auth";
import { KIND_LABEL } from "@/server/documents";
import { projectBase, requireProject } from "@/server/projects";
import { batchSortProps } from "@/server/sorting";
import { BatchDocuments } from "./batch";

/** Tipos de documento que fazem sentido imprimir em lote para inscrições. */
const BATCH_KINDS = ["BADGE", "LABEL", "CERTIFICATE", "OTHER"] as const;

export const metadata: Metadata = { title: "Documentos em lote" };

export default async function BatchDocumentsPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  const p = await guard(requireProject(ws, tenant, project));
  const [templates, counts, sorting] = await Promise.all([
    p.db.documentTemplate.findMany({
      where: {
        kind: { in: [...BATCH_KINDS] },
        archivedAt: null,
        OR: [{ projectId: p.projectId }, { projectId: null }],
      },
      orderBy: [
        { projectId: { sort: "desc", nulls: "last" } },
        { isDefault: "desc" },
        { name: "asc" },
      ],
      select: { id: true, name: true, kind: true, projectId: true, isDefault: true },
    }),
    p.db.registration.groupBy({
      by: ["status"],
      where: { projectId: p.projectId },
      _count: { _all: true },
    }),
    batchSortProps(p),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  const all = counts.reduce((n, c) => n + c._count._all, 0);
  const base = projectBase(ws, tenant, project);

  return (
    <BatchDocuments
      generateHref={`${base}/inscricoes/documentos/gerar`}
      libraryHref={`/console/${ws}/clientes/${tenant}/documentos`}
      registrationsHref={`${base}/inscricoes`}
      templates={templates.map((t) => ({
        id: t.id,
        label: `${t.name} · ${KIND_LABEL[t.kind]}${t.projectId ? "" : " (do cliente)"}`,
      }))}
      counts={{
        ACTIVE: all - (byStatus.CANCELED ?? 0),
        CONFIRMED: byStatus.CONFIRMED ?? 0,
        ALL: all,
      }}
      sorting={sorting}
    />
  );
}
