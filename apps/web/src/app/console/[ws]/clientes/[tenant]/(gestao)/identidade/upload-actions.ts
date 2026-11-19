"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { ActionResult } from "@/server/action";
import { audit } from "@/server/audit";
import { requireTenant } from "@/server/auth";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { saveUpload } from "@/server/files";
import { requireProjectWriter } from "@/server/projects";

type Target = "logo" | "logoDark" | "favicon" | "projectBanner";
const TARGETS = new Set<Target>(["logo", "logoDark", "favicon", "projectBanner"]);

/**
 * Upload de imagens de identidade (multipart). Recebe FormData:
 *   tenant, target, file, [projectId]   — ou remove=1 para tirar a imagem.
 * Imagens de marca são PUBLIC (aparecem em e-mails e páginas públicas).
 */
export async function uploadBrandAsset(form: FormData): Promise<ActionResult<{ fileId: string | null }>> {
  try {
    const tenant = String(form.get("tenant") ?? "");
    const target = String(form.get("target") ?? "") as Target;
    if (!TARGETS.has(target)) throw new AppError("Destino inválido.");
    const remove = form.get("remove") === "1";

    if (target === "projectBanner") {
      const p = await requireProjectWriter(tenant, String(form.get("projectId") ?? ""));
      const fileId = remove ? null : (await store(form, p.tenantId, p.viewer.user.name)).id;
      await p.db.project.update({ where: { id: p.projectId }, data: { bannerFileId: fileId } });
      await audit({
        action: "project.banner.update",
        userId: p.viewer.user.id,
        actorLabel: p.viewer.user.name,
        tenantId: p.tenantId,
        projectId: p.projectId,
        entityType: "Project",
        entityId: p.projectId,
      });
      revalidatePath("/console", "layout");
      return { ok: true, data: { fileId } };
    }

    const ctx = await requireTenant(tenant, "ADMIN");
    const fileId = remove ? null : (await store(form, ctx.tenantId, ctx.viewer.user.name)).id;
    const field = target === "logo" ? "logoFileId" : target === "logoDark" ? "logoDarkFileId" : "faviconFileId";
    await prisma.tenantBranding.upsert({
      where: { tenantId: ctx.tenantId },
      create: { tenantId: ctx.tenantId, [field]: fileId },
      update: { [field]: fileId },
    });
    await audit({
      action: "tenant.branding.update",
      userId: ctx.viewer.user.id,
      actorLabel: ctx.viewer.user.name,
      tenantId: ctx.tenantId,
      entityType: "Tenant",
      entityId: ctx.tenantId,
      data: { [field]: fileId },
    });
    revalidatePath("/", "layout");
    return { ok: true, data: { fileId } };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AppError) return { ok: false, error: err.message };
    console.error("[upload]", err);
    return { ok: false, error: "Não foi possível enviar a imagem. Tente de novo." };
  }
}

async function store(form: FormData, tenantId: string, by: string) {
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("Escolha uma imagem.");
  return saveUpload({ tenantId, file, kind: "image", visibility: "PUBLIC", uploadedBy: by });
}
