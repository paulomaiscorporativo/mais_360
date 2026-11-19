import { readStoredFile } from "@/server/files";
import { loadTravelerPortal } from "@/server/traveler-portal";

const NOT_FOUND = () => new Response("Não encontrado", { status: 404 });

/**
 * Arquivo do viajante pelo link do portal: só documentos do projeto visíveis
 * a ele (gerais ou dele, inclusive vouchers) e os próprios documentos pessoais.
 */
export async function GET(
  req: Request,
  ctx: RouteContext<"/t/[tenantSlug]/v/[token]/arquivo/[fileId]">,
) {
  const { tenantSlug, token, fileId } = await ctx.params;
  const t = await loadTravelerPortal(tenantSlug, token);
  if (!t) return NOT_FOUND();
  const allowed =
    (t.features.has("DOCUMENTS") || t.features.has("VOUCHERS")
      ? await t.db.projectDocument.count({
          where: {
            fileId,
            projectId: t.project.id,
            visibleToPerson: true,
            OR: [{ registrationId: null }, { registrationId: t.reg.id }],
          },
        })
      : 0) +
    (t.features.has("DOCUMENTS")
      ? await t.db.personDocument.count({ where: { fileId, personId: t.person.id } })
      : 0);
  if (!allowed) return NOT_FOUND();
  const file = await readStoredFile(fileId);
  if (!file || file.meta.tenantId !== t.tenant.id) return NOT_FOUND();
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
