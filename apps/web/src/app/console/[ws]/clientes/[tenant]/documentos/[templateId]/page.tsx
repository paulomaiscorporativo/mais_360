import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseDefinition } from "@mais/core";
import { DocumentEditor } from "@/components/documents/editor/editor";
import { guard } from "@/server/auth";
import { prisma } from "@/server/db";
import { getTemplateForTenant, requireDocumentsTenant } from "@/server/documents";
import { restoreTemplateVersion, saveTemplate } from "../actions";

export const metadata: Metadata = { title: "Editor de documento" };

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; templateId: string }>;
}) {
  const { ws, tenant: slug, templateId } = await params;
  const ctx = await guard(requireDocumentsTenant(slug));
  const t = await guard(getTemplateForTenant(templateId, ctx.tenantId));
  let definition;
  try {
    definition = parseDefinition(t.definition);
  } catch {
    notFound();
  }
  const logs = await prisma.auditLog.findMany({
    where: {
      tenantId: ctx.tenantId,
      entityType: "DocumentTemplate",
      entityId: t.id,
      action: "document.template.save",
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, createdAt: true, actorLabel: true, data: true },
  });
  const b = ctx.tenant.branding;

  return (
    <DocumentEditor
      tenant={slug}
      backHref={`/console/${ws}/clientes/${slug}/documentos`}
      template={{
        id: t.id,
        name: t.name,
        version: t.version,
        visibleToPerson: t.visibleToPerson,
        isDefault: t.isDefault,
      }}
      definition={definition}
      versions={logs.map((l) => ({
        id: l.id,
        version: Number((l.data as { version?: number } | null)?.version ?? 0),
        at: l.createdAt.toISOString(),
        by: l.actorLabel || "—",
      }))}
      brand={{
        primary: b?.primaryColor ?? "#002042",
        secondary: b?.secondaryColor ?? "#0f2836",
        accent: b?.accentColor ?? "#a0bf27",
      }}
      canEdit={["ADMIN", "MANAGER"].includes(ctx.role)}
      save={saveTemplate}
      restore={restoreTemplateVersion}
    />
  );
}
