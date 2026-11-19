import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// PageHeader — título da página com trilha, descrição e ações
// ---------------------------------------------------------------------------

export type Crumb = { label: string; href?: string };

export function PageHeader({
  title,
  description,
  crumbs,
  actions,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3 pb-6", className)}>
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Trilha" className="flex min-w-0 items-center gap-1 text-sm text-fg-subtle">
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-fg-faint" />}
              {c.href ? (
                <Link href={c.href} className="truncate hover:text-fg">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate text-fg-muted">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-[26px] sm:leading-8">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-base text-fg-muted">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// EmptyState — ensina o próximo passo (nunca "Nenhum registro")
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondary,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-dashed border-border-strong px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 grid size-11 place-items-center rounded-md border border-border bg-surface text-fg-subtle shadow-sm [&_svg]:size-5">
          {icon}
        </div>
      )}
      <h3 className="text-md font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-base text-fg-muted">{description}</p>}
      {(action || secondary) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seções de formulário em duas colunas (rótulo à esquerda no desktop)
// ---------------------------------------------------------------------------

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "grid gap-4 border-b border-border py-6 first:pt-0 last:border-b-0 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:gap-10",
        className,
      )}
    >
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="mt-1 text-sm text-fg-subtle">{description}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  icon,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-info-border bg-info-bg text-info",
    warning: "border-warning-border bg-warning-bg text-warning",
    danger: "border-danger-border bg-danger-bg text-danger",
    success: "border-success-border bg-success-bg text-success",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border px-4 py-3", tones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn("text-fg-muted", title && "mt-0.5")}>{children}</div>}
      </div>
    </div>
  );
}
