import type { Metadata } from "next";
import { enabledProjectFeatures } from "@mais/core";
import { describeWhenBR } from "@mais/core/messaging";
import { automationNextRun, automationStats } from "@mais/messaging";
import { AutomationsManager, type AutomationRow } from "@/components/communication/automations";
import { guard } from "@/server/auth";
import { communicationBase, projectOptions, requireCommunication } from "@/server/communication";
import { prisma } from "@/server/db";
import { modulesForTenant } from "@/server/modules";

export const metadata: Metadata = { title: "Réguas automáticas" };

export default async function AutomationsPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { ws, tenant } = await params;
  const ctx = await guard(requireCommunication(tenant));
  const [rows, projects, templates, modules] = await Promise.all([
    ctx.db.messageAutomation.findMany({
      orderBy: [{ projectId: "asc" }, { createdAt: "asc" }],
      include: { template: { select: { name: true } } },
    }),
    projectOptions(ctx),
    ctx.db.messageTemplate.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, projectId: true, purpose: true },
    }),
    modulesForTenant(ctx.tenant),
  ]);

  // Recursos e fuso de cada projeto: o que cada gatilho exige e onde o horário é lido
  const projectRows = await ctx.db.project.findMany({
    where: { id: { in: projects.map((p) => p.id) } },
    select: {
      id: true,
      timezone: true,
      features: { select: { feature: true, enabled: true } },
    },
  });
  const featuresOf = new Map(
    projectRows.map((p) => [p.id, [...enabledProjectFeatures(p.features, modules)]]),
  );
  const tzOf = new Map(projectRows.map((p) => [p.id, p.timezone || ctx.tenant.timezone]));

  const now = new Date();
  const stats = await automationStats(
    prisma,
    ctx.tenantId,
    rows.map((a) => a.id),
  );
  const nexts = await Promise.all(rows.map((a) => automationNextRun(prisma, a, now)));

  const automations: AutomationRow[] = rows.map((a, i) => {
    const f = (a.filter ?? {}) as { roles?: string[]; statuses?: string[] };
    const next = nexts[i]!;
    const tz = tzOf.get(a.projectId) ?? ctx.tenant.timezone;
    const s = stats.get(a.id);
    return {
      id: a.id,
      projectId: a.projectId,
      templateId: a.templateId,
      templateName: a.template.name,
      trigger: a.trigger,
      offsetDays: a.offsetDays,
      offsetHours: a.offsetHours,
      sendAt: a.sendAt,
      repeatEveryDays: a.repeatEveryDays,
      maxSends: a.maxSends,
      channels: a.channels,
      roles: f.roles ?? [],
      statuses: f.statuses ?? [],
      active: a.active,
      next:
        next.kind === "event"
          ? { kind: "event" }
          : next.kind === "scheduled"
            ? {
                kind: "scheduled",
                label: `${describeWhenBR(next.at, now, tz)}${next.label ? ` · voo ${next.label}` : ""}`,
                due: next.at.getTime() <= now.getTime(),
              }
            : { kind: "none", label: next.reason },
      stats: {
        sent: s?.sent ?? 0,
        queued: s?.queued ?? 0,
        skipped: s?.skipped ?? 0,
        failed: s?.failed ?? 0,
        lastAt: s?.lastAt?.toISOString() ?? null,
      },
    };
  });

  return (
    <AutomationsManager
      tenant={tenant}
      base={communicationBase(ws, tenant)}
      automations={automations}
      projects={projects.map((p) => ({ ...p, features: featuresOf.get(p.id) ?? [] }))}
      templates={templates}
      canEdit={["ADMIN", "MANAGER"].includes(ctx.role)}
    />
  );
}
