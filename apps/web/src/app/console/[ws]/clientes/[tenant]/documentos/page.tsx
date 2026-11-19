import type { Metadata } from "next";
import { parseDefinition } from "@mais/core";
import { guard } from "@/server/auth";
import { prisma } from "@/server/db";
import { requireDocumentsTenant } from "@/server/documents";
import { Library, type LibraryItem } from "./library";

export const metadata: Metadata = { title: "Documentos" };

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { ws, tenant: slug } = await params;
  const ctx = await guard(requireDocumentsTenant(slug));
  const rows = await prisma.documentTemplate.findMany({
    where: { tenantId: ctx.tenantId, archivedAt: null },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  const projectNames = new Map(
    (
      await prisma.project.findMany({
        where: { tenantId: ctx.tenantId, id: { in: rows.flatMap((r) => r.projectId ?? []) } },
        select: { id: true, name: true },
      })
    ).map((p) => [p.id, p.name]),
  );

  const items: LibraryItem[] = rows.flatMap((r) => {
    try {
      const definition = parseDefinition(r.definition);
      return [
        {
          id: r.id,
          name: r.name,
          kind: r.kind,
          version: r.version,
          isDefault: r.isDefault,
          visibleToPerson: r.visibleToPerson,
          project: r.projectId ? (projectNames.get(r.projectId) ?? "Projeto") : null,
          updatedAt: r.updatedAt.toISOString(),
          definition,
        },
      ];
    } catch {
      return []; // definição corrompida não derruba a biblioteca
    }
  });

  return (
    <Library
      tenant={slug}
      base={`/console/${ws}/clientes/${slug}/documentos`}
      items={items}
      canEdit={["ADMIN", "MANAGER"].includes(ctx.role)}
    />
  );
}
