import type { Metadata } from "next";
import { openSecret } from "@mais/messaging";
import { ChannelsManager, type ChannelRow } from "@/components/communication/channels";
import { guard } from "@/server/auth";
import { globalChannelsInfo, projectOptions, requireCommunication } from "@/server/communication";

export const metadata: Metadata = { title: "Canais de envio" };

function cfgKeys(sealed: string): Record<string, string> {
  if (!sealed) return {};
  try {
    return JSON.parse(openSecret(sealed)) as Record<string, string>;
  } catch {
    return {};
  }
}

export default async function ChannelsPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { tenant } = await params;
  const ctx = await guard(requireCommunication(tenant));
  const [rows, projects] = await Promise.all([
    ctx.db.messagingChannel.findMany({ orderBy: [{ kind: "asc" }, { createdAt: "asc" }] }),
    projectOptions(ctx),
  ]);
  const g = globalChannelsInfo();

  // Nunca manda segredo para o navegador: só se ele existe.
  const channels: ChannelRow[] = rows.map((c) => {
    const cfg = cfgKeys(c.waConfigEnc);
    return {
      id: c.id,
      kind: c.kind,
      name: c.name,
      projectId: c.projectId,
      active: c.active,
      fromName: c.fromName,
      fromEmail: c.fromEmail,
      replyTo: c.replyTo,
      mode: c.smtpHost ? "own" : "global",
      smtpHost: c.smtpHost,
      smtpPort: c.smtpPort,
      smtpSecure: c.smtpSecure,
      smtpUser: c.smtpUser,
      hasSmtpPass: !!c.smtpPassEnc,
      provider: c.waProvider,
      waNumber: c.waNumber,
      instance: c.waInstance,
      evolutionMode: cfg.url ? "own" : "global",
      evolutionUrl: cfg.url ?? "",
      hasEvolutionKey: !!cfg.apiKey,
      metaPhoneNumberId: cfg.phoneNumberId ?? "",
      hasMetaToken: !!cfg.token && c.waProvider === "META_CLOUD",
      webhookUrl: c.waProvider === "WEBHOOK" ? (cfg.url ?? "") : "",
      hasWebhookToken: !!cfg.token && c.waProvider === "WEBHOOK",
    };
  });

  return (
    <ChannelsManager
      tenant={tenant}
      channels={channels}
      projects={projects}
      globals={g}
      canEdit={ctx.role === "ADMIN"}
    />
  );
}
