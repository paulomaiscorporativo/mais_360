import type { MessagingChannel, PrismaClient } from "@mais/db";
import { globalEvolution, globalSmtp, type SmtpSettings } from "./env";
import { openSecret } from "./secrets";

/**
 * Qual canal envia: o do PROJETO, senão o do CLIENTE, senão o GLOBAL (.env).
 * Assim um evento pode usar o WhatsApp do próprio organizador e o resto do
 * cliente continua no número padrão.
 */

export type ChannelSource = "PROJECT" | "TENANT" | "GLOBAL";

export type ResolvedEmailChannel = {
  kind: "EMAIL";
  channelId: string | null;
  source: ChannelSource;
  smtp: SmtpSettings;
  from: string;
  replyTo: string;
};

export type ResolvedWhatsappChannel = {
  kind: "WHATSAPP";
  channelId: string | null;
  source: ChannelSource;
} & (
  | { provider: "EVOLUTION"; evolution: { url: string; apiKey: string; instance: string } }
  | { provider: "META_CLOUD"; meta: { token: string; phoneNumberId: string } }
  | { provider: "WEBHOOK"; webhook: { url: string; token: string; senderId: string } }
);

export type ResolvedChannel = ResolvedEmailChannel | ResolvedWhatsappChannel;

function formatFrom(name: string, email: string): string {
  const n = name.replace(/["<>]/g, "").trim();
  return n ? `"${n}" <${email}>` : email;
}

function parseJson(sealed: string): Record<string, string> {
  if (!sealed) return {};
  try {
    return JSON.parse(openSecret(sealed)) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Converte um MessagingChannel do banco em configuração utilizável (ou null se incompleto). */
export function channelFromRecord(
  c: MessagingChannel,
  source: ChannelSource,
): ResolvedChannel | null {
  if (c.kind === "EMAIL") {
    const g = globalSmtp();
    const host = c.smtpHost.trim();
    // Sem SMTP próprio, usa o servidor global com o remetente/Reply-To do cliente
    const smtp: SmtpSettings | null = host
      ? {
          host,
          port: c.smtpPort,
          secure: c.smtpSecure,
          user: c.smtpUser,
          pass: openSecret(c.smtpPassEnc),
        }
      : (g?.smtp ?? null);
    if (!smtp) return null;
    const fromEmail = c.fromEmail.trim() || (host ? c.smtpUser : "") || "";
    const from = fromEmail
      ? formatFrom(c.fromName, fromEmail)
      : c.fromName && g
        ? formatFrom(c.fromName, extractEmail(g.from))
        : (g?.from ?? "");
    if (!from) return null;
    // Sem Reply-To próprio, quem usa o servidor global herda o padrão da plataforma
    const replyTo = c.replyTo.trim() || (host ? "" : (g?.replyTo ?? ""));
    return { kind: "EMAIL", channelId: c.id, source, smtp, from, replyTo };
  }

  const cfg = parseJson(c.waConfigEnc);
  switch (c.waProvider) {
    case "EVOLUTION": {
      const g = globalEvolution();
      const url = cfg.url || g?.url;
      const apiKey = cfg.apiKey || g?.apiKey;
      const instance = c.waInstance.trim();
      if (!url || !apiKey || !instance) return null;
      return {
        kind: "WHATSAPP",
        channelId: c.id,
        source,
        provider: "EVOLUTION",
        evolution: { url, apiKey, instance },
      };
    }
    case "META_CLOUD":
      if (!cfg.token || !cfg.phoneNumberId) return null;
      return {
        kind: "WHATSAPP",
        channelId: c.id,
        source,
        provider: "META_CLOUD",
        meta: { token: cfg.token, phoneNumberId: cfg.phoneNumberId },
      };
    case "WEBHOOK":
      if (!cfg.url) return null;
      return {
        kind: "WHATSAPP",
        channelId: c.id,
        source,
        provider: "WEBHOOK",
        webhook: { url: cfg.url, token: cfg.token ?? "", senderId: c.waNumber || c.id },
      };
    default:
      return null;
  }
}

function extractEmail(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1] ?? from;
}

export function globalChannel(kind: "EMAIL" | "WHATSAPP"): ResolvedChannel | null {
  if (kind === "EMAIL") {
    const g = globalSmtp();
    return g
      ? {
          kind: "EMAIL",
          channelId: null,
          source: "GLOBAL",
          smtp: g.smtp,
          from: g.from,
          replyTo: g.replyTo,
        }
      : null;
  }
  const e = globalEvolution();
  if (!e?.instance) return null;
  return {
    kind: "WHATSAPP",
    channelId: null,
    source: "GLOBAL",
    provider: "EVOLUTION",
    evolution: e,
  };
}

export async function resolveChannel(
  db: PrismaClient,
  scope: {
    tenantId: string;
    projectId?: string | null;
    kind: "EMAIL" | "WHATSAPP";
    channelId?: string | null;
  },
): Promise<ResolvedChannel | null> {
  if (scope.channelId) {
    const c = await db.messagingChannel.findFirst({
      where: { id: scope.channelId, tenantId: scope.tenantId, active: true },
    });
    return c ? channelFromRecord(c, c.projectId ? "PROJECT" : "TENANT") : null;
  }
  const candidates = await db.messagingChannel.findMany({
    where: {
      tenantId: scope.tenantId,
      kind: scope.kind,
      active: true,
      OR: [{ projectId: null }, ...(scope.projectId ? [{ projectId: scope.projectId }] : [])],
    },
    orderBy: { createdAt: "asc" },
  });
  const project = candidates.find((c) => c.projectId && c.projectId === scope.projectId);
  const tenant = candidates.find((c) => !c.projectId);
  for (const [c, source] of [
    [project, "PROJECT"],
    [tenant, "TENANT"],
  ] as const) {
    if (!c) continue;
    const r = channelFromRecord(c, source);
    if (r) return r;
  }
  return globalChannel(scope.kind);
}
