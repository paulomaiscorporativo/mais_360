import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { applyStatusUpdates, parseEvolutionWebhook, parseMetaWebhook } from "@mais/messaging";
import { prisma } from "@/server/db";

/**
 * Status de entrega (entregue/lido/falhou) enviados pelos provedores de WhatsApp.
 *
 *   POST /api/webhooks/whatsapp/evolution?token=<WHATSAPP_WEBHOOK_SECRET>
 *   POST /api/webhooks/whatsapp/meta     (assinatura X-Hub-Signature-256 com META_APP_SECRET)
 *   GET  /api/webhooks/whatsapp/meta     (verificação do webhook com META_VERIFY_TOKEN)
 *
 * Sem o segredo configurado o webhook fica desligado (503): nunca aceitamos
 * atualização de status anônima. Respostas não revelam detalhes.
 */

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/webhooks/whatsapp/[provider]">) {
  const { provider } = await ctx.params;
  if (provider !== "meta") return new Response(null, { status: 404 });
  const expected = process.env.META_VERIFY_TOKEN ?? "";
  const q = req.nextUrl.searchParams;
  if (!expected) return new Response(null, { status: 503 });
  if (q.get("hub.mode") === "subscribe" && safeEqual(q.get("hub.verify_token") ?? "", expected)) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response(null, { status: 403 });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/webhooks/whatsapp/[provider]">) {
  const { provider } = await ctx.params;
  const raw = await req.text();
  if (raw.length > 1_000_000) return new Response(null, { status: 413 });

  if (provider === "evolution" || provider === "webhook") {
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET ?? "";
    if (!secret) return new Response(null, { status: 503 });
    const token = req.nextUrl.searchParams.get("token") ?? req.headers.get("x-webhook-token") ?? "";
    if (!safeEqual(token, secret)) return new Response(null, { status: 401 });
  } else if (provider === "meta") {
    const appSecret = process.env.META_APP_SECRET ?? "";
    if (!appSecret) return new Response(null, { status: 503 });
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    const expected = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
    if (!safeEqual(sig, expected)) return new Response(null, { status: 401 });
  } else {
    return new Response(null, { status: 404 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const updates = provider === "meta" ? parseMetaWebhook(body) : parseEvolutionWebhook(body);
  const applied = updates.length ? await applyStatusUpdates(prisma, updates) : 0;
  return Response.json({ ok: true, received: updates.length, applied });
}
