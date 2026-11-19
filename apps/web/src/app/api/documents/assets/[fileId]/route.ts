import { prisma } from "@/server/db";
import { apiError, readStoredFile, requireDocumentsTenant } from "@/server/documents";

// Arquivo privado de um cliente: só sai para quem enxerga o cliente.
export async function GET(_req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const meta = await prisma.storedFile.findUnique({
      where: { id: fileId },
      select: { tenantId: true },
    });
    if (!meta?.tenantId) return new Response("Não encontrado", { status: 404 });
    const tenant = await prisma.tenant.findUnique({
      where: { id: meta.tenantId },
      select: { slug: true },
    });
    if (!tenant) return new Response("Não encontrado", { status: 404 });
    const ctx = await requireDocumentsTenant(tenant.slug);
    const hit = await readStoredFile(fileId, ctx.tenantId);
    if (!hit) return new Response("Não encontrado", { status: 404 });
    return new Response(Buffer.from(hit.bytes), {
      headers: {
        "Content-Type": hit.file.mimeType,
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${encodeURIComponent(hit.file.fileName)}"`,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
