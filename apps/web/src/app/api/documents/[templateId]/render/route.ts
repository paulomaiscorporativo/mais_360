import { apiError, renderTemplatePreview, requireTemplateAccess } from "@/server/documents";

/**
 * Gera o modelo salvo em PDF ou HTML térmico.
 *   ?format=pdf|thermal  &registration=<id>  &guides=1  &download=1
 * Sem `registration`, usa os dados de exemplo com a marca do cliente.
 */
export async function GET(req: Request, { params }: { params: Promise<{ templateId: string }> }) {
  try {
    const { templateId } = await params;
    const url = new URL(req.url);
    const { ctx } = await requireTemplateAccess(templateId);
    const format = url.searchParams.get("format") === "thermal" ? "thermal" : "pdf";
    const result = await renderTemplatePreview({
      tenant: ctx.tenant,
      templateId,
      registrationId: url.searchParams.get("registration"),
      format,
      guides: url.searchParams.get("guides") === "1",
      actor: { type: "USER", label: ctx.viewer.user.name, userId: ctx.viewer.user.id },
    });
    const name = encodeURIComponent(result.fileName);
    const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
    if (result.format === "pdf") {
      return new Response(Buffer.from(result.bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${disposition}; filename="${name}.pdf"`,
          "Cache-Control": "no-store",
          "X-Document-Warnings": String(result.warnings.length),
        },
      });
    }
    return new Response(result.html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return apiError(err);
  }
}
