import { sortRegistrations } from "@mais/core/sorting";
import type { Prisma } from "@mais/db";
import { audit } from "@/server/audit";
import { apiError, renderForRegistrations } from "@/server/documents";
import { notFound } from "@/server/errors";
import { requireProject } from "@/server/projects";
import { projectSorting, SORT_ROW_INCLUDE, sortParam, toSortRow } from "@/server/sorting";

const BATCH_KINDS = ["BADGE", "LABEL", "CERTIFICATE", "OTHER"] as const;
const MAX = 1000;

/**
 * Documentos em lote (crachás, etiquetas, relatório de QR Code) pelo motor único
 * `renderForRegistrations`, na ordenação do projeto ou na escolhida na hora.
 *   ?modelo=<id>&situacao=ACTIVE|CONFIRMED|ALL&formato=pdf|thermal&ordem=<SortSpec>
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ws: string; tenant: string; project: string }> },
) {
  try {
    const { ws, tenant, project } = await params;
    const url = new URL(req.url);
    const p = await requireProject(ws, tenant, project);
    if (!p.modules.has("DOCUMENTS")) throw notFound("Módulo de documentos não contratado.");

    const template = await p.db.documentTemplate.findFirst({
      where: {
        id: url.searchParams.get("modelo") ?? "",
        kind: { in: [...BATCH_KINDS] },
        archivedAt: null,
        OR: [{ projectId: p.projectId }, { projectId: null }],
      },
      select: { id: true, name: true },
    });
    if (!template) throw notFound("Modelo não encontrado.");

    const scope = url.searchParams.get("situacao");
    const where: Prisma.RegistrationWhereInput = { projectId: p.projectId };
    if (scope === "CONFIRMED") where.status = "CONFIRMED";
    else if (scope !== "ALL") where.status = { not: "CANCELED" };

    const sorting = await projectSorting(p, sortParam(url));
    const regs = await p.db.registration.findMany({ where, include: SORT_ROW_INCLUDE });
    if (!regs.length) throw notFound("Nenhuma inscrição nesta situação.");
    const ids = sortRegistrations(regs.map(toSortRow), sorting.spec)
      .slice(0, MAX)
      .map((r) => r.id);

    const f = url.searchParams.get("formato");
    const out = await renderForRegistrations(template.id, ids, {
      tenantId: p.tenantId,
      format: f === "pdf" || f === "thermal" ? f : undefined,
      purpose: "PRINT",
      actor: {
        type: "USER",
        label: p.viewer.user.name || p.viewer.user.email,
        userId: p.viewer.user.id,
      },
      autoPrint: true,
      hideSeats: !p.features.has("TABLES"),
    });
    await audit({
      action: "documents.batch.render",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "DocumentTemplate",
      entityId: template.id,
      data: {
        count: ids.length,
        total: regs.length,
        sort: sorting.label,
        scope: scope ?? "ACTIVE",
      },
    });

    if (out.format === "thermal")
      return new Response(out.html, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    const file = `${p.project.slug}-${template.name}`.replace(/[^\w.-]+/g, "-").slice(0, 80);
    return new Response(Buffer.from(out.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${file}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
