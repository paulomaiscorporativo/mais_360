import type { Metadata } from "next";
import { TemplateList, type TemplateRow } from "@/components/communication/template-list";
import { guard } from "@/server/auth";
import { communicationBase, projectOptions, requireCommunication } from "@/server/communication";

export const metadata: Metadata = { title: "Modelos de mensagem" };

export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { ws, tenant } = await params;
  const ctx = await guard(requireCommunication(tenant));
  const [rows, projects, usage] = await Promise.all([
    ctx.db.messageTemplate.findMany({
      where: { archivedAt: null },
      orderBy: { updatedAt: "desc" },
    }),
    projectOptions(ctx),
    ctx.db.messageCampaign.groupBy({
      by: ["templateId"],
      where: { templateId: { not: null } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
  ]);
  const byTemplate = new Map(usage.map((u) => [u.templateId, u]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const templates: TemplateRow[] = rows.map((t) => ({
    id: t.id,
    name: t.name,
    purpose: t.purpose,
    scope: t.projectId ? (projectName.get(t.projectId) ?? "Projeto") : null,
    hasEmail: !!(t.emailSubject.trim() && t.emailBody.trim()),
    hasWhatsapp: !!t.whatsappBody.trim(),
    preview: (t.emailSubject || t.whatsappBody || t.emailBody).replace(/\{\{\s*(\w+)\s*\}\}/g, "[$1]"),
    uses: byTemplate.get(t.id)?._count._all ?? 0,
    lastUsedAt: byTemplate.get(t.id)?._max.createdAt?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
  }));

  return (
    <TemplateList
      tenant={tenant}
      base={communicationBase(ws, tenant)}
      templates={templates}
      canEdit={["ADMIN", "MANAGER"].includes(ctx.role)}
    />
  );
}
