import { groupRegistrations } from "@mais/core/sorting";
import { audit } from "@/server/audit";
import { apiError } from "@/server/documents";
import { printListHtml, type PrintColumn } from "@/server/print-list";
import { requireProjectFeature } from "@/server/projects";
import { projectSorting, SORT_ROW_INCLUDE, sortParam, toSortRow } from "@/server/sorting";

const STATUS: Record<string, string> = {
  PENDING: "Pendente",
  INVITED: "Convidado",
  CONFIRMED: "Confirmado",
  WAITLIST: "Lista de espera",
  DECLINED: "Recusou",
  CANCELED: "Cancelado",
};

/**
 * Lista de check-in para imprimir (conferência na porta, assinatura):
 * convidados ativos na ordenação do projeto, ou na escolhida (`?ordem=`).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ws: string; tenant: string; project: string }> },
) {
  try {
    const { ws, tenant, project } = await params;
    const p = await requireProjectFeature(ws, tenant, project, "INVITES");
    const sorting = await projectSorting(p, sortParam(new URL(req.url)));
    const regs = await p.db.registration.findMany({
      where: { projectId: p.projectId, role: "GUEST", status: { not: "CANCELED" } },
      include: SORT_ROW_INCLUDE,
    });
    const tz = p.project.timezone ?? p.tenant.timezone;
    const rows = regs.map((r) => ({ ...toSortRow(r), checkedInAt: r.checkedInAt }));
    const groups = groupRegistrations(rows, sorting.spec, { statusLabels: STATUS, timeZone: tz });
    const tables = p.features.has("TABLES");

    type Row = (typeof rows)[number];
    const columns: PrintColumn<Row>[] = [
      { header: "", cell: (r) => (r.checkedInAt ? "✓" : "☐"), width: "4%" },
      { header: "Nome", cell: (r) => r.fullName, width: "28%" },
      { header: "Empresa", cell: (r) => r.company ?? "" },
      { header: "Categoria", cell: (r) => r.category ?? "" },
      ...(tables
        ? [
            {
              header: "Mesa",
              cell: (r: Row) =>
                r.table != null
                  ? `${r.tableLabel}${r.seat != null ? ` · cad. ${r.seat}` : ""}`
                  : "",
            },
          ]
        : []),
      { header: "Código", cell: (r) => r.shortCode ?? "", mono: true },
      {
        header: "Situação",
        cell: (r) => (r.checkedInAt ? "Presente" : (STATUS[r.status ?? ""] ?? "")),
      },
      { header: "Assinatura", cell: () => "", width: "18%" },
    ];

    await audit({
      action: "event.checkin.list.print",
      userId: p.viewer.user.id,
      tenantId: p.tenantId,
      projectId: p.projectId,
      entityType: "Project",
      entityId: p.projectId,
      data: { rows: rows.length, sort: sorting.label },
    });

    const html = printListHtml({
      title: `Lista de check-in · ${p.project.name}`,
      subtitle: `${p.tenant.name} · ordem: ${sorting.label} · gerada em ${new Date().toLocaleString("pt-BR", { timeZone: tz })}`,
      groups,
      columns,
      pageBreakPerGroup: sorting.spec.pageBreakPerGroup,
      emptyMessage: "Ainda não há convidados ativos neste evento.",
      landscape: true,
    });
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return apiError(err);
  }
}
