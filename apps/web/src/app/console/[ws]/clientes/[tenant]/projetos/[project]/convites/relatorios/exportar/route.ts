import { encodeCsv } from "@mais/core/csv";
import { audit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { companiesCsv, guestsCsv, loadInviteReport } from "@/server/invite-reports";
import { requireProjectFeature } from "@/server/projects";

/**
 * Exportação CSV dos relatórios de convites.
 *   ?tipo=convidados|empresas   &codificacao=utf-8 (padrão) | windows-1252
 * Dados pessoais: exige acesso ao projeto e fica registrado na auditoria.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ws: string; tenant: string; project: string }> },
) {
  const { ws, tenant, project } = await params;
  const url = new URL(req.url);
  const kind = url.searchParams.get("tipo") === "empresas" ? "empresas" : "convidados";
  const encoding =
    url.searchParams.get("codificacao") === "windows-1252" ? "windows-1252" : "utf-8";
  try {
    const p = await requireProjectFeature(ws, tenant, project, "INVITES");
    const tz = p.project.timezone ?? p.tenant.timezone;
    const data = await loadInviteReport(p.db, p.projectId);
    const text = kind === "empresas" ? companiesCsv(data.companies) : guestsCsv(data.guests, tz);
    await audit({
      action: "event.report.export",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "Project",
      entityId: p.projectId,
      data: {
        kind,
        encoding,
        rows: kind === "empresas" ? data.companies.length : data.guests.length,
      },
    });
    const file = `${p.project.slug}-${kind}.csv`;
    return new Response(Buffer.from(encodeCsv(text, encoding)), {
      headers: {
        "Content-Type": `text/csv; charset=${encoding}`,
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof AppError) return new Response("Não encontrado.", { status: 404 });
    throw err;
  }
}
