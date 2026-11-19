import { z } from "zod";
import { safeParseDefinition } from "@mais/core";
import {
  apiError,
  editorPageHtml,
  registrationData,
  requireDocumentsTenant,
  sampleData,
} from "@/server/documents";

const body = z.object({
  tenant: z.string(),
  definition: z.unknown(),
  page: z.number().int().min(0).default(0),
  registrationId: z.string().nullish(),
});

/**
 * Pré-visualização do editor (modelo ainda não salvo): devolve o HTML de UMA
 * página, renderizado pelo mesmo motor do PDF e da impressão térmica.
 */
export async function POST(req: Request) {
  try {
    const input = body.safeParse(await req.json());
    if (!input.success) return Response.json({ error: "Requisição inválida." }, { status: 400 });
    const ctx = await requireDocumentsTenant(input.data.tenant);
    const parsed = safeParseDefinition(input.data.definition);
    if (!parsed.success) {
      return Response.json({ error: "Modelo com dados inválidos." }, { status: 422 });
    }
    let data = sampleData(parsed.data.kind, ctx.tenant);
    if (input.data.registrationId) {
      const hit = (await registrationData(ctx.tenantId, [input.data.registrationId])).get(
        input.data.registrationId,
      );
      if (hit) data = hit;
    }
    const { html, pageCount } = editorPageHtml(parsed.data, data, input.data.page);
    return Response.json({ html, pageCount });
  } catch (err) {
    return apiError(err);
  }
}
