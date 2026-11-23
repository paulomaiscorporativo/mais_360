import type { NextRequest } from "next/server";
import { allowCertificate } from "@/server/domains";

/**
 * Pergunta do Caddy antes de emitir um certificado sob demanda (on-demand TLS):
 *   GET /api/tls/ask?domain=<host>  → 200 pode emitir · 404 não pode.
 * Sem sessão e sem corpo: não revela nada além do sim/não. Guia em docs/DOMINIOS.md.
 */
export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain") ?? "";
  let ok = false;
  try {
    ok = domain.length > 0 && domain.length <= 253 && (await allowCertificate(domain));
  } catch (err) {
    // Na dúvida, não emite: o Caddy pergunta de novo no próximo acesso
    console.error("[tls/ask]", err);
  }
  return new Response(null, {
    status: ok ? 200 : 404,
    headers: { "Cache-Control": "no-store" },
  });
}
