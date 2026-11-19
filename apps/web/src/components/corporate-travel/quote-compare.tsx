import { AlertTriangle, BadgeCheck, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SERVICE_ICON, serviceLabel } from "./labels";

export type QuoteLineView = {
  id: string;
  type: string;
  title: string;
  description: string;
  amount: string;
  quantity: number;
};

export type QuoteView = {
  id: string;
  title: string;
  description: string;
  total: string;
  perPax: string;
  validUntil: string;
  expired: boolean;
  inPolicy: boolean | null;
  cheapest: boolean;
  chosen: boolean;
  lines: QuoteLineView[];
};

/**
 * Opções lado a lado: no desktop, colunas comparáveis; no mobile, cartões
 * empilhados. O total por passageiro é o número de destaque; o total da
 * viagem e as linhas por serviço vêm logo abaixo.
 */
export function QuoteCompare({
  quotes,
  pax,
  actions,
}: {
  quotes: QuoteView[];
  pax: number;
  /** Ação por opção (escolher, editar…) */
  actions?: (q: QuoteView) => React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        quotes.length >= 3 ? "lg:grid-cols-3" : quotes.length === 2 ? "md:grid-cols-2" : "",
      )}
    >
      {quotes.map((q, i) => (
        <article
          key={q.id}
          aria-label={q.title}
          className={cn(
            "bg-surface flex flex-col rounded-lg border",
            q.chosen ? "border-brand shadow-[0_0_0_1px_var(--brand)]" : "border-border",
            q.expired && "opacity-70",
          )}
        >
          <header className="border-border flex flex-col gap-2 border-b px-5 pt-4 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-fg-subtle text-xs font-medium">Opção {i + 1}</p>
                <h3 className="text-md mt-0.5 leading-snug font-semibold">{q.title}</h3>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {q.chosen && (
                  <Badge tone="brand" size="sm">
                    <CheckCircle2 className="size-3" /> Escolhida
                  </Badge>
                )}
                {q.cheapest && !q.chosen && (
                  <Badge tone="success" size="sm">
                    Menor valor
                  </Badge>
                )}
              </div>
            </div>
            <div>
              <p className="tabular text-2xl font-semibold tracking-tight">{q.perPax}</p>
              <p className="text-fg-subtle text-xs">
                por passageiro{pax > 1 ? ` · total ${q.total} para ${pax}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {q.inPolicy === true && (
                <Badge tone="success" size="sm">
                  <BadgeCheck className="size-3" /> Dentro da política
                </Badge>
              )}
              {q.inPolicy === false && (
                <Badge tone="warning" size="sm">
                  <AlertTriangle className="size-3" /> Fora da política
                </Badge>
              )}
              {q.validUntil && (
                <Badge tone={q.expired ? "danger" : "neutral"} size="sm">
                  <Clock className="size-3" />
                  {q.expired ? `Venceu em ${q.validUntil}` : `Válida até ${q.validUntil}`}
                </Badge>
              )}
            </div>
          </header>
          <ul className="divide-border flex flex-1 flex-col divide-y">
            {q.lines.map((l) => {
              const Icon = SERVICE_ICON[l.type];
              return (
                <li key={l.id} className="flex gap-3 px-5 py-3">
                  <span className="text-fg-subtle mt-0.5 shrink-0 [&_svg]:size-4">
                    {Icon ? <Icon aria-hidden /> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-fg-subtle text-xs">
                      {serviceLabel(l.type)}
                      {l.quantity > 1 ? ` · ${l.quantity}×` : ""}
                    </p>
                    <p className="text-sm font-medium">{l.title}</p>
                    {l.description && (
                      <p className="text-fg-muted mt-0.5 text-sm whitespace-pre-line">
                        {l.description}
                      </p>
                    )}
                  </div>
                  <span className="tabular shrink-0 text-sm">{l.amount}</span>
                </li>
              );
            })}
          </ul>
          {q.description && (
            <p className="border-border text-fg-muted border-t px-5 py-3 text-sm whitespace-pre-line">
              {q.description}
            </p>
          )}
          {actions && (
            <footer className="border-border flex flex-wrap gap-2 border-t px-5 py-3">
              {actions(q)}
            </footer>
          )}
        </article>
      ))}
    </div>
  );
}
