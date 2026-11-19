import { apiError, requireDocumentsTenant, searchRegistrations } from "@/server/documents";

// Busca de inscrições reais para a pré-visualização do editor.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ctx = await requireDocumentsTenant(url.searchParams.get("tenant") ?? "");
    return Response.json(await searchRegistrations(ctx.tenantId, url.searchParams.get("q") ?? ""));
  } catch (err) {
    return apiError(err);
  }
}
