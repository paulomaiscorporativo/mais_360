import { cn } from "@/lib/cn";
import { PRODUCT } from "@/config/product";

/**
 * Marca do produto: monograma geométrico (dois arcos = ida e volta, e o "+"
 * da Mais) + nome lido de PRODUCT. Nada de nome fixo no código.
 */
export function ProductMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <path
        d="M8 21.5c2.2-6.4 13.8-6.4 16 0"
        fill="none"
        stroke="var(--brand-fg)"
        strokeOpacity=".55"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M16 8.5v9M11.5 13h9" stroke="var(--brand-fg)" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

export function ProductLogo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <ProductMark />
      {!compact && <span className="text-md font-semibold tracking-tight">{PRODUCT.name}</span>}
    </span>
  );
}
