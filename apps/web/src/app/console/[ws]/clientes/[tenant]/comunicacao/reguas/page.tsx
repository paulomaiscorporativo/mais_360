import type { Metadata } from "next";
import { AutomationsManager, type AutomationRow } from "@/components/communication/automations";
import { guard } from "@/server/auth";
import { communicationBase, projectOptions, requireCommunication } from "@/server/communication";

export const metadata: Metadata = { title: "Réguas automáticas" };

export default async function AutomationsPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { ws, tenant } = await params;
  const ctx = await guard(requireCommunication(tenant));
  const [rows, projects, templates] = await Promise.all([
    ctx.db.messageAutomation.findMany({
      orderBy: [{ projectId: "asc" }, { createdAt: "asc" }],
      include: { template: { select: { name: true } } },
    }),
    projectOptions(ctx),
    ctx.db.messageTemplate.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, projectId: true },
    }),
  ]);

  const automations: AutomationRow[] = rows.map((a) => {
    const f = (a.filter ?? {}) as { roles?: string[]; statuses?: string[] };
    return {
      id: a.id,
      projectId: a.projectId,
      templateId: a.templateId,
      templateName: a.template.name,
      trigger: a.trigger,
      offsetDays: a.offsetDays,
      sendAt: a.sendAt,
      channels: a.channels,
      roles: f.roles ?? [],
      statuses: f.statuses ?? [],
      active: a.active,
    };
  });

  return (
    <AutomationsManager
      tenant={tenant}
      base={communicationBase(ws, tenant)}
      automations={automations}
      projects={projects}
      templates={templates}
      canEdit={["ADMIN", "MANAGER"].includes(ctx.role)}
    />
  );
}
