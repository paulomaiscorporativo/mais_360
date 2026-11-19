import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import {
  TRAVEL_STATUS_LABELS,
  TRAVEL_STATUS_MEMBER_LABELS,
  TRAVEL_STATUS_TONES,
  type PolicyViolation,
  type TravelRequestStatus,
} from "@mais/core/corporate-travel";
import { Badge, Notice } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Situação da solicitação; `audience="member"` usa os rótulos de quem pediu. */
export function TravelStatusBadge({
  status,
  audience = "staff",
  size,
}: {
  status: TravelRequestStatus;
  audience?: "staff" | "member";
  size?: "sm" | "md";
}) {
  const labels = audience === "member" ? TRAVEL_STATUS_MEMBER_LABELS : TRAVEL_STATUS_LABELS;
  return (
    <Badge tone={TRAVEL_STATUS_TONES[status]} size={size} dot>
      {labels[status]}
    </Badge>
  );
}

/** Código do protocolo em fonte de código. */
export function Protocol({ value, className }: { value: string; className?: string }) {
  return <span className={cn("tabular font-mono text-xs tracking-tight", className)}>{value}</span>;
}

/** Violações da política: sinaliza, não bloqueia. */
export function PolicyNotice({
  violations,
  justification,
  className,
}: {
  violations: PolicyViolation[];
  justification?: string;
  className?: string;
}) {
  if (!violations.length) return null;
  return (
    <Notice
      tone="warning"
      icon={<AlertTriangle />}
      title="Fora da política de viagem"
      className={className}
    >
      <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
        {violations.map((v, i) => (
          <li key={`${v.code}-${i}`}>{v.message}</li>
        ))}
      </ul>
      {justification ? (
        <p className="mt-2">
          <span className="font-medium">Justificativa:</span> {justification}
        </p>
      ) : null}
    </Notice>
  );
}

export type TimelineItem = {
  id: string;
  status: TravelRequestStatus;
  note: string;
  actor: string;
  at: string;
};

/** Linha do tempo do atendimento (TravelRequestEvent). */
export function Timeline({
  items,
  audience = "staff",
}: {
  items: TimelineItem[];
  audience?: "staff" | "member";
}) {
  const labels = audience === "member" ? TRAVEL_STATUS_MEMBER_LABELS : TRAVEL_STATUS_LABELS;
  return (
    <ol className="flex flex-col">
      {items.map((e, i) => {
        const last = i === items.length - 1;
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && (
              <span aria-hidden className="bg-border absolute top-5 bottom-0 left-[7px] w-px" />
            )}
            <span className="mt-0.5 shrink-0">
              {last ? (
                <CheckCircle2 className="text-brand-text size-4" />
              ) : (
                <Circle className="text-fg-faint size-4" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{labels[e.status]}</p>
              {e.note && <p className="text-fg-muted mt-0.5 text-sm">{e.note}</p>}
              <p className="text-fg-subtle mt-0.5 text-xs">
                {e.at}
                {e.actor ? ` · ${e.actor}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
