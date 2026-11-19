import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pacingSchema } from "@mais/core/messaging";
import { CampaignLive } from "@/components/communication/campaign-live";
import { guard } from "@/server/auth";
import { communicationBase, projectOptions, requireCommunication } from "@/server/communication";

export const metadata: Metadata = { title: "Acompanhar envio" };

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; id: string }>;
}) {
  const { ws, tenant, id } = await params;
  const ctx = await guard(requireCommunication(tenant));
  const c = await ctx.db.messageCampaign.findFirst({ where: { id } });
  if (!c) notFound();
  const projects = await projectOptions(ctx);
  const pacing = c.channel === "WHATSAPP" ? pacingSchema.safeParse(c.pacing) : null;
  const snapshot = (c.snapshot ?? {}) as { emailSubject?: string };

  return (
    <CampaignLive
      tenant={tenant}
      base={communicationBase(ws, tenant)}
      campaign={{
        id: c.id,
        name: c.name,
        channel: c.channel,
        subject: snapshot.emailSubject ?? "",
        templateId: c.templateId,
        projectName: c.projectId
          ? (projects.find((p) => p.id === c.projectId)?.name ?? "Projeto")
          : "Base de membros",
        createdBy: c.createdBy,
        createdAt: c.createdAt.toISOString(),
        scheduledAt: c.scheduledAt?.toISOString() ?? null,
        skipped: c.skipped,
        timezone: c.timezone,
        pacing: pacing?.success ? pacing.data : null,
      }}
      canControl={["ADMIN", "MANAGER"].includes(ctx.role)}
    />
  );
}
