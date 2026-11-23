import { audit } from "@/server/audit";
import { apiError, requireDocumentsTenant, storeFile } from "@/server/documents";
import { asWrite } from "@/server/write-scope";

// Envio de arte de fundo (PDF) ou imagem (logo) para os modelos de documento.
export function POST(req: Request) {
  return asWrite(() => upload(req));
}

async function upload(req: Request) {
  try {
    const form = await req.formData();
    const slug = String(form.get("tenant") ?? "");
    const file = form.get("file");
    const ctx = await requireDocumentsTenant(slug, "MANAGER");
    if (!(file instanceof File)) {
      return Response.json({ error: "Escolha um arquivo." }, { status: 400 });
    }
    const stored = await storeFile({
      tenantId: ctx.tenantId,
      fileName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      uploadedBy: ctx.viewer.user.name,
    });
    await audit({
      action: "document.asset.upload",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      entityType: "StoredFile",
      entityId: stored.id,
      data: { fileName: stored.fileName, size: stored.size },
    });
    return Response.json({
      id: stored.id,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      size: stored.size,
    });
  } catch (err) {
    return apiError(err);
  }
}
