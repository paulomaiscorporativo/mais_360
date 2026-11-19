import type { NextRequest } from "next/server";
import { loadViewer } from "@/server/auth";
import { prisma } from "@/server/db";
import { readStoredFile } from "@/server/files";

/**
 * Serve um arquivo guardado. PUBLIC (logo, banner) sai sem login e com cache;
 * PRIVATE exige sessão com acesso ao cliente dono do arquivo. Negado ou
 * inexistente responde 404 (não revela que o arquivo existe).
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const file = await readStoredFile(id);
  if (!file) return new Response("Não encontrado", { status: 404 });
  const { meta, body } = file;

  if (meta.visibility === "PRIVATE") {
    const viewer = await loadViewer();
    if (!viewer || !(await canReadTenantFile(viewer, meta.tenantId))) {
      return new Response("Não encontrado", { status: 404 });
    }
  }

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": meta.mimeType,
      "Content-Length": String(meta.size),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`,
      "Cache-Control":
        meta.visibility === "PUBLIC" ? "public, max-age=31536000, immutable" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ETag: `"${meta.sha256}"`,
    },
  });
}

async function canReadTenantFile(
  viewer: NonNullable<Awaited<ReturnType<typeof loadViewer>>>,
  tenantId: string | null,
) {
  if (viewer.isPlatformStaff) return true;
  if (!tenantId) return false;
  if (viewer.user.memberships.some((m) => m.tenantId === tenantId)) return true;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { workspaceId: true },
  });
  return viewer.user.workspaces.some(
    (w) => w.workspaceId === tenant?.workspaceId && (w.role === "OWNER" || w.role === "ADMIN"),
  );
}
