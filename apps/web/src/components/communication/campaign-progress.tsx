import { cn } from "@/lib/cn";

const nf = new Intl.NumberFormat("pt-BR");

/** Barra empilhada: enviados · falhas · restante — com números (nunca só cor). */
export function CampaignProgress({
  sent,
  failed,
  total,
  size = "sm",
  className,
}: {
  sent: number;
  failed: number;
  total: number;
  size?: "sm" | "lg";
  className?: string;
}) {
  const pct = (n: number) => (total ? Math.min(100, (n / total) * 100) : 0);
  const done = total ? Math.round(((sent + failed) / total) * 100) : 0;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={done}
        aria-label={`${done}% processado`}
        className={cn(
          "bg-surface-sunken flex w-full overflow-hidden rounded-full",
          size === "lg" ? "h-2.5" : "h-1.5",
        )}
      >
        <span
          className="bg-brand h-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct(sent)}%` }}
        />
        <span
          className="bg-danger h-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct(failed)}%` }}
        />
      </div>
      <div className="text-fg-subtle tabular flex justify-between text-xs">
        <span>
          {nf.format(sent)} de {nf.format(total)} enviados
          {failed > 0 && <span className="text-danger"> · {nf.format(failed)} com falha</span>}
        </span>
        <span>{done}%</span>
      </div>
    </div>
  );
}
