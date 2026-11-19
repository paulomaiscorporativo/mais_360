import type { Metadata } from "next";
import { CampaignWizard } from "@/components/communication/campaign-wizard";
import { termsWithDefaults } from "@/config/terms";
import { guard } from "@/server/auth";
import {
  communicationBase,
  globalChannelsInfo,
  projectOptions,
  requireCommunication,
} from "@/server/communication";

export const metadata: Metadata = { title: "Novo envio" };

export default async function NewCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; tenant: string }>;
  searchParams: Promise<{ modelo?: string; projeto?: string }>;
}) {
  const { ws, tenant } = await params;
  const sp = await searchParams;
  const ctx = await guard(requireCommunication(tenant, "MANAGER"));
  const [templates, projects, memberTypes, channels, terms, activeWa] = await Promise.all([
    ctx.db.messageTemplate.findMany({
      where: { archivedAt: null },
      orderBy: { updatedAt: "desc" },
    }),
    projectOptions(ctx),
    ctx.db.person.groupBy({
      by: ["memberType"],
      where: { isMember: true, archivedAt: null },
      _count: { _all: true },
    }),
    ctx.db.messagingChannel.findMany({ where: { active: true }, select: { kind: true } }),
    ctx.db.tenantTerm.findMany({ where: {} }),
    ctx.db.messageCampaign.findFirst({
      where: {
        channel: "WHATSAPP",
        status: { in: ["RUNNING", "WAITING_WINDOW", "SCHEDULED", "PAUSED"] },
      },
      select: { id: true, name: true },
    }),
  ]);
  const g = globalChannelsInfo();
  const t = termsWithDefaults(terms);

  return (
    <CampaignWizard
      tenant={tenant}
      base={communicationBase(ws, tenant)}
      timezone={ctx.tenant.timezone}
      memberLabel={t["member.plural"]}
      templates={templates.map((x) => ({
        id: x.id,
        name: x.name,
        purpose: x.purpose,
        projectId: x.projectId,
        hasEmail: !!(x.emailSubject.trim() && x.emailBody.trim()),
        hasWhatsapp: !!(x.whatsappBody.trim() || x.emailBody.trim()),
        excerpt: (x.emailSubject || x.whatsappBody).slice(0, 140),
        content: {
          name: x.name,
          emailSubject: x.emailSubject,
          emailBody: x.emailBody,
          whatsappBody: x.whatsappBody,
          includeActions: x.includeActions,
        },
      }))}
      projects={projects}
      memberTypes={memberTypes
        .map((m) => ({ value: m.memberType, count: m._count._all }))
        .sort((a, b) => b.count - a.count)}
      ready={{
        EMAIL: channels.some((c) => c.kind === "EMAIL") || !!g.email,
        WHATSAPP: channels.some((c) => c.kind === "WHATSAPP") || !!g.evolution?.instance,
      }}
      activeWhatsapp={activeWa}
      initialTemplateId={sp.modelo ?? null}
      initialProjectId={sp.projeto ?? null}
    />
  );
}
