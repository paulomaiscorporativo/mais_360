import { Plane } from "lucide-react";
import { LIVE_PHASE, type FlightLive } from "@mais/core";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Voo pronto para exibir (horários já formatados no fuso de cada aeroporto). */
export type FlightView = {
  id: string;
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  operatedBy: string;
  originIata: string;
  originCity: string;
  destIata: string;
  destCity: string;
  depDate: string;
  depTime: string;
  arrTime: string;
  dayOffset: number;
  duration: string;
  scope: "DOMESTIC" | "INTERNATIONAL";
  departureIso: string | null;
  live: FlightLive | null;
  liveCheckedLabel: string;
};

export function LiveBadge({ live }: { live: FlightLive | null }) {
  if (!live) return null;
  const meta = LIVE_PHASE[live.phase];
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
      {live.phase === "DELAYED" && live.origin.delayMinutes
        ? ` · ${live.origin.delayMinutes} min`
        : ""}
    </Badge>
  );
}

/**
 * Faixa do voo no estilo cartão de embarque: origem e destino em destaque,
 * horários locais, duração e o status ao vivo (portão, terminal, atraso).
 */
export function FlightRoute({
  flight,
  compact,
  className,
}: {
  flight: FlightView;
  compact?: boolean;
  className?: string;
}) {
  const live = flight.live;
  const gate = live?.origin.gate;
  const terminal = live?.origin.terminal;
  const arrGate = live?.destination.gate;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-mono text-sm font-semibold tracking-tight">
          {flight.flightNumber}
        </span>
        <span className="text-fg-subtle text-sm">
          {flight.airlineName || flight.airlineCode}
          {flight.operatedBy ? ` · operado por ${flight.operatedBy}` : ""}
        </span>
        <LiveBadge live={live} />
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <div>
          <div
            className={cn(
              "font-semibold tracking-tight tabular-nums",
              compact ? "text-xl" : "text-3xl",
            )}
          >
            {flight.originIata}
          </div>
          <div className="text-fg-subtle text-xs">{flight.originCity}</div>
          <div className="mt-1 text-base font-medium tabular-nums">{flight.depTime || "—"}</div>
        </div>
        <div className="text-fg-faint flex flex-col items-center gap-1 px-1">
          <div className="flex w-full items-center gap-2">
            <span className="border-border-strong h-px flex-1 border-t border-dashed" />
            <Plane className="text-fg-subtle size-4 shrink-0" />
            <span className="border-border-strong h-px flex-1 border-t border-dashed" />
          </div>
          {flight.duration && (
            <span className="text-fg-subtle text-xs tabular-nums">{flight.duration}</span>
          )}
        </div>
        <div className="text-right">
          <div
            className={cn(
              "font-semibold tracking-tight tabular-nums",
              compact ? "text-xl" : "text-3xl",
            )}
          >
            {flight.destIata}
          </div>
          <div className="text-fg-subtle text-xs">{flight.destCity}</div>
          <div className="mt-1 text-base font-medium tabular-nums">
            {flight.arrTime || "—"}
            {flight.dayOffset > 0 && (
              <sup className="text-fg-subtle text-2xs ml-0.5">+{flight.dayOffset}</sup>
            )}
          </div>
        </div>
      </div>
      {live && (gate || terminal || arrGate || live.notes.length > 0) && (
        <div className="text-fg-muted flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {terminal && <span>Terminal {terminal}</span>}
          {gate && <span>Portão {gate}</span>}
          {arrGate && <span>Desembarque portão {arrGate}</span>}
          {live.notes.slice(0, 2).map((n) => (
            <span key={n} className="text-warning">
              {n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
