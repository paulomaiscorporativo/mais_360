import { cn } from "@/lib/cn";
import { PRODUCT } from "@/config/product";

/**
 * Símbolo provisório do produto: o "+" da Mais dentro de um anel de 360°
 * (volta completa com uma abertura e um ponto de chegada — o ciclo da
 * operação, da viagem ao credenciamento). Traço único, sem gradiente.
 * O nome vem sempre de PRODUCT.
 */
export function ProductMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      {/* anel 360° com abertura no topo direito */}
      <path
        d="M19.9 7.4A9.4 9.4 0 1 0 25.1 13"
        fill="none"
        stroke="var(--brand-fg)"
        strokeOpacity=".6"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="24.4" cy="9.1" r="1.35" fill="var(--brand-fg)" />
      {/* + */}
      <path
        d="M16 11.6v8.8M11.6 16h8.8"
        stroke="var(--brand-fg)"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
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
