import { voucherFileName } from "@mais/core";
import { renderForRegistrations } from "@/server/documents";
import { rateLimit } from "@/server/rate-limit";
import { loadTravelerPortal, travelerName } from "@/server/traveler-portal";

/**
 * Voucher gerado na hora para o viajante (modelos marcados "visível à pessoa"):
 * sempre com os dados atuais de voo, hotel e quarto. Registra a emissão
 * (DocumentRender, autor PERSON).
 */
export async function GET(
  _req: Request,
  ctx: RouteContext<"/t/[tenantSlug]/v/[token]/voucher/[templateId]">,
) {
  const { tenantSlug, token, templateId } = await ctx.params;
  const t = await loadTravelerPortal(tenantSlug, token);
  if (!t || !t.features.has("VOUCHERS")) return new Response("Não encontrado", { status: 404 });
  const template = await t.db.documentTemplate.findFirst({
    where: {
      id: templateId,
      kind: "VOUCHER",
      visibleToPerson: true,
      archivedAt: null,
      OR: [{ projectId: t.project.id }, { projectId: null }],
    },
    select: { id: true, name: true },
  });
  if (!template) return new Response("Não encontrado", { status: 404 });
  if (!rateLimit(`portal-voucher:${t.reg.id}`, 20, 10 * 60_000).allowed)
    return new Response("Muitos downloads seguidos. Aguarde alguns minutos.", { status: 429 });

  const name = travelerName(t.person);
  const out = await renderForRegistrations(template.id, [t.reg.id], {
    tenantId: t.tenant.id,
    format: "pdf",
    purpose: "DOWNLOAD",
    actor: { type: "PERSON", label: name },
  });
  if (out.format !== "pdf") return new Response("Formato indisponível", { status: 415 });
  return new Response(Buffer.from(out.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(voucherFileName(template.name, name))}`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
