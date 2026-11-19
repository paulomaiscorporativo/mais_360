import { apiError } from "@/server/documents";
import { requireProjectFeature } from "@/server/projects";
import { projectTz, roomingList } from "@/server/travel";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Rooming list para imprimir (ou salvar em PDF pelo navegador): página
 * própria, sem o console em volta, com a impressão aberta automaticamente.
 */
export async function GET(
  _req: Request,
  ctx: RouteContext<"/console/[ws]/clientes/[tenant]/projetos/[project]/hospedagem/rooming">,
) {
  try {
    const { ws, tenant, project } = await ctx.params;
    const p = await requireProjectFeature(ws, tenant, project, "ACCOMMODATION");
    const hotels = await roomingList(p.db, p.projectId, projectTz(p));
    const body = hotels.length
      ? hotels
          .map(
            (h) => `
<section>
  <h2>${esc(h.name)}${h.city ? ` <small>· ${esc(h.city)}</small>` : ""}</h2>
  <p class="meta">${esc(h.checkIn)} → ${esc(h.checkOut)} · ${h.rooms.length} quarto(s)</p>
  <table>
    <thead><tr><th>Quarto</th><th>Tipo</th><th>Hóspedes</th><th>Entrada</th><th>Saída</th><th>Confirmação</th><th>Observações</th></tr></thead>
    <tbody>
      ${h.rooms
        .map(
          (r) => `<tr>
        <td class="mono">${esc(r.number || "—")}</td>
        <td>${esc(r.type)}</td>
        <td>${r.occupants.length ? r.occupants.map((o) => `${esc(o.name)}${o.dietary ? ` <em>(${esc(o.dietary)})</em>` : ""}`).join("<br>") : "<em>vazio</em>"}</td>
        <td>${esc(r.checkIn)}</td>
        <td>${esc(r.checkOut)}</td>
        <td class="mono">${esc(r.confirmation)}</td>
        <td>${esc(r.notes)}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>
</section>`,
          )
          .join("")
      : "<p>Nenhum hotel cadastrado neste projeto.</p>";

    const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rooming list · ${esc(p.project.name)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #0b1a2e; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 24px 0 2px; }
  h2 small { font-weight: 400; color: #4a5a70; }
  .meta { color: #4a5a70; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid #d5dce6; }
  th { font-size: 11px; color: #4a5a70; font-weight: 600; }
  .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
  em { color: #4a5a70; }
  section { break-inside: avoid-page; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  <h1>Rooming list · ${esc(p.project.name)}</h1>
  <p class="meta">${esc(p.tenant.name)} · gerado em ${new Date().toLocaleString("pt-BR", { timeZone: projectTz(p) })}</p>
  ${body}
  <script>window.addEventListener("load", () => window.print());</script>
</body></html>`;
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return apiError(err);
  }
}
