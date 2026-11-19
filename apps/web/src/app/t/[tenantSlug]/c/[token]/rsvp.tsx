"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Notice } from "@/components/ui";
import { respondInvite } from "./actions";

/**
 * Confirmar ou recusar presença. Botões grandes (toque), resposta imediata na
 * tela e possibilidade de mudar de ideia enquanto o prazo estiver aberto.
 */
export function Rsvp({
  tenantSlug,
  token,
  status,
  until,
  highlight,
}: {
  tenantSlug: string;
  token: string;
  status: string;
  until: string | null;
  highlight: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState<"CONFIRMED" | "DECLINED" | null>(null);

  function answer(a: "CONFIRMED" | "DECLINED") {
    setChoice(a);
    setError(null);
    start(async () => {
      const r = await respondInvite({ tenantSlug, token, answer: a });
      if (r.ok) {
        setCurrent(r.data.status);
        router.refresh();
      } else setError(r.error);
    });
  }

  const answered = current === "CONFIRMED" || current === "DECLINED";

  return (
    <section
      aria-labelledby="rsvp-title"
      className={
        highlight && !answered
          ? "border-brand bg-brand-subtle rounded-lg border-2 p-5"
          : "border-border rounded-lg border p-5"
      }
    >
      <h2 id="rsvp-title" className="text-lg font-semibold">
        {current === "CONFIRMED"
          ? "Presença confirmada"
          : current === "DECLINED"
            ? "Você informou que não poderá ir"
            : "Você vai?"}
      </h2>
      <p className="text-fg-muted mt-1 text-base">
        {current === "CONFIRMED"
          ? "Obrigado! Guarde esta página: o QR abaixo é a sua entrada."
          : current === "DECLINED"
            ? "Obrigado por avisar. Se os planos mudarem, ainda dá para confirmar."
            : "Sua resposta ajuda a organização a preparar tudo para você."}
        {until && <> Responda até {until}.</>}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-live="polite">
        {current !== "CONFIRMED" && (
          <Button
            size="lg"
            block
            className="min-h-12"
            loading={pending && choice === "CONFIRMED"}
            disabled={pending}
            autoFocus={highlight && !answered}
            onClick={() => answer("CONFIRMED")}
          >
            <CheckCircle2 /> Confirmar presença
          </Button>
        )}
        {current !== "DECLINED" && (
          <Button
            size="lg"
            block
            variant="secondary"
            className="min-h-12"
            loading={pending && choice === "DECLINED"}
            disabled={pending}
            onClick={() => answer("DECLINED")}
          >
            <XCircle /> {current === "CONFIRMED" ? "Não poderei mais ir" : "Não poderei ir"}
          </Button>
        )}
      </div>
      {error && (
        <Notice tone="danger" className="mt-3">
          {error}
        </Notice>
      )}
    </section>
  );
}
