"use client";

import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Info,
  RotateCcw,
  ScanLine,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { QrScanner } from "@/components/events/qr-scanner";
import type { CheckinGuest, CheckinResult } from "@/server/events";
import { checkIn, checkinStats, undoCheckInAction } from "../actions";

type Recent = { at: number; result: CheckinResult };

/**
 * Check-in do evento. Pensado para tablet/celular na recepção: leitura pela
 * câmera, leitor USB (que "digita" no campo e dá Enter) ou código de 6 dígitos.
 * O resultado aparece grande e colorido, para o recepcionista ver de longe.
 */
export function CheckinDesk({
  tenant,
  projectId,
  initial,
  timeZone,
}: {
  tenant: string;
  projectId: string;
  timeZone: string;
  initial: { total: number; checked: number; confirmed: number };
}) {
  const [camera, setCamera] = useState(false);
  const [code, setCode] = useState("");
  const [last, setLast] = useState<CheckinResult | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [stats, setStats] = useState(initial);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  // Atualiza o contador (vários recepcionistas ao mesmo tempo)
  useEffect(() => {
    const t = setInterval(async () => {
      const r = await checkinStats({ tenant, projectId });
      if (r.ok) setStats(r.data);
    }, 15_000);
    return () => clearInterval(t);
  }, [tenant, projectId]);

  const submit = useCallback(
    (raw: string) => {
      if (!raw.trim()) return;
      start(async () => {
        const r = await checkIn({ tenant, projectId, raw });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        const res = r.data;
        setLast(res);
        // Retorno tátil no celular/tablet: curto = ok, longo = atenção
        navigator.vibrate?.(res.ok && !res.already ? 60 : [120, 60, 120]);
        setRecent((list) => [{ at: Date.now(), result: res }, ...list].slice(0, 12));
        if (res.ok && !res.already) setStats((s) => ({ ...s, checked: s.checked + 1 }));
        setCode("");
        input.current?.focus();
      });
    },
    [tenant, projectId],
  );

  function undo(g: CheckinGuest) {
    start(async () => {
      const r = await undoCheckInAction({ tenant, projectId, id: g.id });
      if (r.ok) {
        toast.success(`Check-in de ${g.name} desfeito.`);
        setStats((s) => ({ ...s, checked: Math.max(0, s.checked - 1) }));
        setLast(null);
      } else toast.error(r.error);
    });
  }

  const pct = stats.total ? Math.round((stats.checked / stats.total) * 100) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(code);
          }}
        >
          <Input
            ref={input}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Código de 6 dígitos ou leia o QR"
            inputMode="numeric"
            className="h-12 text-lg"
            leading={<ScanLine />}
            aria-label="Código do convite"
          />
          <Button type="submit" size="lg" loading={pending}>
            Credenciar
          </Button>
        </form>

        <Button variant="secondary" className="self-start" onClick={() => setCamera((c) => !c)}>
          {camera ? <CameraOff /> : <Camera />}
          {camera ? "Fechar câmera" : "Ler QR pela câmera"}
        </Button>
        {camera && (
          <QrScanner onScan={submit} paused={pending} className="aspect-[4/3] w-full max-w-xl" />
        )}

        <ResultCard result={last} onUndo={undo} timeZone={timeZone} />
      </div>

      <aside className="flex flex-col gap-4">
        <div className="border-border bg-surface rounded-lg border p-5">
          <p className="text-fg-subtle text-sm">Credenciados</p>
          <p className="tabular mt-1 text-4xl font-semibold tracking-tight">
            {stats.checked}
            <span className="text-fg-faint text-xl font-normal"> / {stats.total}</span>
          </p>
          <div className="bg-surface-sunken mt-3 h-2 overflow-hidden rounded-full">
            <div
              className="bg-brand h-full rounded-full transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-fg-subtle mt-2 text-xs">
            {pct}% dos convites ativos · {stats.confirmed} confirmaram presença
          </p>
        </div>
        {recent.length > 0 && (
          <div className="border-border bg-surface rounded-lg border">
            <p className="border-border border-b px-4 py-2.5 text-sm font-medium">
              Últimas leituras
            </p>
            <ul className="divide-border divide-y">
              {recent.map((r) => (
                <li key={r.at} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  {r.result.ok ? (
                    r.result.already ? (
                      <Info className="text-warning size-4 shrink-0" />
                    ) : (
                      <CheckCircle2 className="text-success size-4 shrink-0" />
                    )
                  ) : (
                    <AlertTriangle className="text-danger size-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {r.result.guest?.name ?? (r.result.ok ? "" : r.result.error)}
                  </span>
                  <span className="text-fg-faint tabular text-xs">
                    {new Date(r.at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

function ResultCard({
  result,
  onUndo,
  timeZone,
}: {
  result: CheckinResult | null;
  onUndo: (g: CheckinGuest) => void;
  timeZone: string;
}) {
  if (!result)
    return (
      <div className="border-border-strong text-fg-subtle grid min-h-48 place-items-center rounded-lg border border-dashed p-8 text-center text-base">
        Aguardando a primeira leitura.
      </div>
    );
  const g = result.guest;
  const tone = !result.ok
    ? "border-danger-border bg-danger-bg text-danger"
    : result.already
      ? "border-warning-border bg-warning-bg text-warning"
      : "border-success-border bg-success-bg text-success";
  const title = !result.ok ? result.error : result.already ? "Já credenciado" : "Bem-vindo(a)!";
  return (
    <div
      role="status"
      aria-live="assertive"
      className={`animate-rise rounded-lg border p-6 ${tone}`}
    >
      <p className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
        {!result.ok ? (
          <AlertTriangle className="size-5" />
        ) : result.already ? (
          <Info className="size-5" />
        ) : (
          <CheckCircle2 className="size-5" />
        )}
        {title}
      </p>
      {g && (
        <div className="text-fg mt-3">
          <p className="text-3xl font-semibold tracking-tight">{g.name}</p>
          <p className="text-fg-muted mt-1 text-lg">
            {[g.company, g.category].filter(Boolean).join(" · ") || "Convite individual"}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {g.table && (
              <span className="bg-surface text-fg rounded-md px-3 py-1.5 text-lg font-semibold">
                {g.table}
              </span>
            )}
            {result.ok && result.already && g.checkedInAt && (
              <span className="text-fg-muted text-sm">
                às{" "}
                {new Date(g.checkedInAt).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone,
                })}
              </span>
            )}
            {result.ok && !result.already && (
              <Button variant="ghost" size="sm" onClick={() => onUndo(g)}>
                <RotateCcw /> Desfazer
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
