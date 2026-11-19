import { pageSchema } from "@mais/core";
import { renderCalibrationHtml } from "@mais/documents";
import { apiError, requireDocumentsTenant } from "@/server/documents";

/**
 * Página de calibração da impressora (borda, cruz, régua a cada 5 mm e os
 * ajustes atuais). ?tenant=<slug>&page=<json da configuração de página>
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    await requireDocumentsTenant(url.searchParams.get("tenant") ?? "");
    let json: unknown = null;
    try {
      json = JSON.parse(url.searchParams.get("page") ?? "");
    } catch {
      json = null;
    }
    const page = pageSchema.safeParse(json);
    if (!page.success) return new Response("Configuração de página inválida.", { status: 400 });
    return new Response(
      renderCalibrationHtml(page.data, { autoPrint: true, title: "Calibração da impressora" }),
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return apiError(err);
  }
}
