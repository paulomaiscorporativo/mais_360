import { readStoredFile } from "@/server/files";
import { currentMember } from "@/server/member-portal";

const NOT_FOUND = () => new Response("Não encontrado", { status: 404 });

/**
 * Documento de uma reserva (voucher, bilhete) para o próprio solicitante:
 * o arquivo precisa estar anexado a um item reservado de uma solicitação dele.
 */
export async function GET(
  req: Request,
  ctx: RouteContext<"/t/[tenantSlug]/viagens/[id]/arquivo/[fileId]">,
) {
  const { tenantSlug, id, fileId } = await ctx.params;
  const m = await currentMember(tenantSlug);
  if (!m || !m.travel || m.person.mustChangePassword) return NOT_FOUND();
  const allowed = await m.db.serviceItem.count({
    where: {
      travelRequestId: id,
      quoteId: null,
      travelRequest: { requesterPersonId: m.person.id },
      attachments: { some: { fileId } },
    },
  });
  if (!allowed) return NOT_FOUND();
  const file = await readStoredFile(fileId);
  if (!file || file.meta.tenantId !== m.tenant.id) return NOT_FOUND();
  const download = new URL(req.url).searchParams.get("baixar") === "1";
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.meta.mimeType,
      "Content-Length": String(file.meta.size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.meta.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
