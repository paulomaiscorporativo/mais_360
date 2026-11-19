import * as XLSX from "xlsx";
import { apiError } from "@/server/documents";
import { requireProjectFeature } from "@/server/projects";
import { projectSorting, sortParam } from "@/server/sorting";
import { projectTz, roomingList } from "@/server/travel";

/** Rooming list em planilha (uma linha por hóspede), no formato que os hotéis pedem. */
export async function GET(
  req: Request,
  ctx: RouteContext<"/console/[ws]/clientes/[tenant]/projetos/[project]/hospedagem/rooming/xlsx">,
) {
  try {
    const { ws, tenant, project } = await ctx.params;
    const p = await requireProjectFeature(ws, tenant, project, "ACCOMMODATION");
    const sorting = await projectSorting(p, sortParam(new URL(req.url)));
    const hotels = await roomingList(p.db, p.projectId, projectTz(p), sorting.spec);
    const rows: (string | number)[][] = [
      [
        "Hotel",
        "Quarto",
        "Tipo",
        "Hóspede",
        "Código",
        "Entrada",
        "Saída",
        "Confirmação",
        "Restrição alimentar",
        "Observações",
      ],
    ];
    for (const h of hotels)
      for (const r of h.rooms) {
        const guests = r.occupants.length ? r.occupants : [null];
        for (const o of guests)
          rows.push([
            h.name,
            r.number,
            r.type,
            o?.name ?? "",
            o?.shortCode ?? "",
            r.checkIn,
            r.checkOut,
            r.confirmation,
            o?.dietary ?? "",
            r.notes,
          ]);
      }
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [28, 8, 18, 32, 8, 14, 14, 16, 20, 30].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Rooming");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const name = encodeURIComponent(`rooming-${p.project.slug}.xlsx`);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${name}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
