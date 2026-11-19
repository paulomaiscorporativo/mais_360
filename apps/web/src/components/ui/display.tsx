import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium leading-none",
  {
    variants: {
      tone: {
        neutral: "border-border-strong bg-surface-muted text-fg-muted",
        brand: "border-transparent bg-brand-subtle text-brand-subtle-fg",
        success: "border-success-border bg-success-bg text-success",
        warning: "border-warning-border bg-warning-bg text-warning",
        danger: "border-danger-border bg-danger-bg text-danger",
        info: "border-info-border bg-info-bg text-info",
      },
      size: {
        sm: "h-5 px-2 text-2xs",
        md: "h-6 px-2.5 text-xs",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & { dot?: boolean };

export function Badge({ className, tone, size, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Avatar (iniciais; foto quando houver)
// ---------------------------------------------------------------------------

export function initials(name: string): string {
  const parts = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

const AVATAR_SIZES = {
  xs: "size-6 text-2xs",
  sm: "size-7 text-2xs",
  md: "size-9 text-xs",
  lg: "size-12 text-base",
};

export function Avatar({
  name,
  src,
  color,
  size = "md",
  square,
  className,
}: {
  name: string;
  src?: string | null;
  /** Cor de fundo (ex.: marca do cliente). Sem cor, usa neutro. */
  color?: string;
  size?: keyof typeof AVATAR_SIZES;
  square?: boolean;
  className?: string;
}) {
  const shape = square ? "rounded-sm" : "rounded-full";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn(AVATAR_SIZES[size], shape, "shrink-0 object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={color ? { background: color } : undefined}
      className={cn(
        AVATAR_SIZES[size],
        shape,
        "grid shrink-0 place-items-center font-semibold tracking-wide",
        color ? "text-white" : "bg-surface-sunken text-fg-muted ring-border ring-1 ring-inset",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Panel (cartão)
// ---------------------------------------------------------------------------

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-border bg-surface rounded-md border shadow-sm", className)}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border flex items-start justify-between gap-4 border-b px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-md font-semibold">{title}</h2>
        {description && <p className="text-fg-subtle mt-0.5 text-sm">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PanelBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function PanelFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border-border bg-surface-muted flex items-center justify-end gap-2 rounded-b-md border-t px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-sm bg-[linear-gradient(90deg,var(--surface-sunken)_0%,var(--hover)_50%,var(--surface-sunken)_100%)] bg-[length:800px_100%]",
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Kbd
// ---------------------------------------------------------------------------

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "border-border-strong bg-surface text-2xs text-fg-subtle inline-flex h-5 min-w-5 items-center justify-center rounded-xs border px-1 font-mono shadow-[0_1px_0_var(--border-strong)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Estatística
// ---------------------------------------------------------------------------

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-fg-subtle text-xs font-medium">{label}</span>
      <span className="tabular text-xl font-semibold tracking-tight">{value}</span>
      {hint && <span className="text-fg-subtle text-xs">{hint}</span>}
    </div>
  );
}
