import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Tabela responsiva. No desktop, tabela densa com cabeçalho fixo; no mobile,
 * cada linha vira um item de lista: coluna `primary` em destaque, `secondary`
 * logo abaixo, `meta` à direita. Colunas `desktopOnly` somem no mobile.
 */

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  align?: "left" | "right";
  mobile?: "primary" | "secondary" | "meta" | "desktopOnly";
};

type DataTableProps<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  caption?: string;
  className?: string;
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  caption,
  className,
}: DataTableProps<T>) {
  const primary = columns.find((c) => c.mobile === "primary") ?? columns[0];
  const secondary = columns.filter((c) => c.mobile === "secondary");
  const meta = columns.filter((c) => c.mobile === "meta");

  return (
    <div
      className={cn(
        "border-border bg-surface overflow-hidden rounded-md border shadow-sm",
        className,
      )}
    >
      {/* Desktop */}
      <table className="hidden w-full border-collapse text-left md:table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-surface-muted sticky top-0 z-[1]">
          <tr className="border-border border-b">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "text-fg-subtle h-9 px-4 text-xs font-medium first:pl-5 last:pr-5",
                  c.align === "right" && "text-right",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
            {rowHref && <th aria-hidden className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr
                key={rowKey(row)}
                className={cn(
                  "group border-border border-b last:border-b-0",
                  href && "hover:bg-surface-muted relative cursor-pointer transition-colors",
                )}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={cn(
                      "h-12 px-4 align-middle first:pl-5 last:pr-5",
                      c.align === "right" && "tabular text-right",
                      c.className,
                    )}
                  >
                    {i === 0 && href ? (
                      <Link
                        href={href}
                        className="after:absolute after:inset-0 focus-visible:outline-none"
                      >
                        {c.cell(row)}
                      </Link>
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
                {href && (
                  <td className="pr-4 text-right">
                    <ChevronRight className="text-fg-faint group-hover:text-fg-subtle ml-auto size-4 transition-transform group-hover:translate-x-0.5" />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile */}
      <ul className="divide-border divide-y md:hidden">
        {rows.map((row) => {
          const href = rowHref?.(row);
          const content = (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{primary?.cell(row)}</div>
                {secondary.length > 0 && (
                  <div className="text-fg-subtle mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {secondary.map((c) => (
                      <span key={c.key}>{c.cell(row)}</span>
                    ))}
                  </div>
                )}
              </div>
              {meta.length > 0 && (
                <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                  {meta.map((c) => (
                    <span key={c.key}>{c.cell(row)}</span>
                  ))}
                </div>
              )}
              {href && <ChevronRight className="text-fg-faint size-4 shrink-0" />}
            </div>
          );
          return (
            <li key={rowKey(row)}>
              {href ? (
                <Link href={href} className="active:bg-pressed block">
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
