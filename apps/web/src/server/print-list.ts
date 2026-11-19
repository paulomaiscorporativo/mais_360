import "server-only";
import { escapeHtml as esc } from "@mais/core";
import type { SortGroup } from "@mais/core/sorting";

/**
 * Página de impressão de listas (check-in, presença): HTML próprio, sem o
 * console em volta, com a impressão aberta automaticamente. Respeita o
 * agrupamento e a quebra de página por grupo do spec de ordenação.
 *
 * As cores repetem os tokens do design system (neutros com viés azul-tinta)
 * porque a página não carrega o CSS da aplicação.
 */

export type PrintColumn<T> = {
  header: string;
  cell: (row: T) => string;
  mono?: boolean;
  /** Largura relativa (ex.: "28%"). */
  width?: string;
};

export function printListHtml<T>(opts: {
  title: string;
  subtitle: string;
  groups: SortGroup<T>[];
  columns: PrintColumn<T>[];
  pageBreakPerGroup: boolean;
  emptyMessage: string;
  landscape?: boolean;
}): string {
  const total = opts.groups.reduce((n, g) => n + g.rows.length, 0);
  const head = `<tr>${opts.columns
    .map((c) => `<th${c.width ? ` style="width:${c.width}"` : ""}>${esc(c.header)}</th>`)
    .join("")}</tr>`;
  const body = total
    ? opts.groups
        .map(
          (g) => `
<section class="${opts.pageBreakPerGroup ? "break" : ""}">
  ${g.label ? `<h2>${esc(g.label)} <small>· ${g.rows.length}</small></h2>` : ""}
  <table>
    <thead>${head}</thead>
    <tbody>
      ${g.rows
        .map(
          (r) =>
            `<tr>${opts.columns
              .map((c) => `<td${c.mono ? ' class="mono"' : ""}>${esc(c.cell(r))}</td>`)
              .join("")}</tr>`,
        )
        .join("")}
    </tbody>
  </table>
</section>`,
        )
        .join("")
    : `<p class="empty">${esc(opts.emptyMessage)}</p>`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<style>
  :root { --fg: #0b1a2e; --fg-subtle: #4a5a70; --border: #d5dce6; --surface-sunken: #f3f5f9; }
  @page { size: A4 ${opts.landscape ? "landscape" : "portrait"}; margin: 12mm; }
  body { font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg); margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 14px; margin: 20px 0 6px; }
  h2 small, .meta { color: var(--fg-subtle); font-weight: 400; }
  .meta { margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid var(--border); }
  th { font-size: 11px; color: var(--fg-subtle); font-weight: 600; background: var(--surface-sunken); }
  tr { break-inside: avoid; }
  .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .empty { color: var(--fg-subtle); }
  section.break + section.break { break-before: page; }
  @media print { body { margin: 0; } thead { display: table-header-group; } }
</style></head>
<body>
  <h1>${esc(opts.title)}</h1>
  <p class="meta">${esc(opts.subtitle)} · ${total} pessoa(s)</p>
  ${body}
  <script>window.addEventListener("load", () => window.print());</script>
</body></html>`;
}
