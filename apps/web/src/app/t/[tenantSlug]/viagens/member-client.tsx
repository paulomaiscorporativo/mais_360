"use client";

import { Check, KeyRound, LogIn, LogOut, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TextField } from "@/components/travel/kit";
import { Button, Notice } from "@/components/ui";
import { Checkbox } from "@/components/ui/controls";
import { ConfirmDialog, Sheet } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { cancelRequest, changePassword, chooseQuote, signIn, signOut } from "./actions";

type Result<T> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const run = <T,>(fn: () => Promise<Result<T>>, onOk?: (d: T) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setError(r.error);
        return;
      }
      setErrors({});
      setError(null);
      onOk?.(r.data);
      router.refresh();
    });
  return { run, pending, errors, error };
}

const big = "h-12 text-md";

/** Entrada do associado com e-mail e senha. */
export function MemberLogin({
  tenantSlug,
  memberLabel,
}: {
  tenantSlug: string;
  memberLabel: string;
}) {
  const { run, pending, errors, error } = useAction();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => signIn({ tenantSlug, email, password, remember }));
      }}
    >
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Entrar</h2>
        <p className="text-fg-muted mt-1 text-base">
          Área do {memberLabel.toLowerCase()}: peça viagens, compare as opções e receba os
          documentos.
        </p>
      </div>
      <TextField
        label="E-mail"
        type="email"
        autoComplete="email"
        inputClassName={big}
        value={email}
        onChange={setEmail}
        error={errors.email}
      />
      <TextField
        label="Senha"
        type="password"
        autoComplete="current-password"
        inputClassName={big}
        value={password}
        onChange={setPassword}
        error={errors.password}
      />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
        Manter conectado neste aparelho
      </label>
      {error && !Object.keys(errors).length && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" size="lg" block loading={pending}>
        <LogIn /> Entrar
      </Button>
      <p className="text-fg-subtle text-sm">
        Não tem senha ou esqueceu? A equipe que atende você gera uma senha provisória.
      </p>
    </form>
  );
}

/** Troca obrigatória da senha provisória (e troca voluntária). */
export function MemberPasswordForm({
  tenantSlug,
  required,
  onDone,
}: {
  tenantSlug: string;
  required?: boolean;
  onDone?: () => void;
}) {
  const { run, pending, errors, error } = useAction();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => changePassword({ tenantSlug, current, next }),
          () => {
            toast.success("Senha alterada.");
            onDone?.();
          },
        );
      }}
    >
      {required && (
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Crie sua senha</h2>
          <p className="text-fg-muted mt-1 text-base">
            Você entrou com uma senha provisória. Escolha uma senha sua para continuar.
          </p>
        </div>
      )}
      <TextField
        label={required ? "Senha provisória" : "Senha atual"}
        type="password"
        autoComplete="current-password"
        inputClassName={big}
        value={current}
        onChange={setCurrent}
        error={errors.current}
      />
      <TextField
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        inputClassName={big}
        value={next}
        onChange={setNext}
        error={errors.next}
        hint="Pelo menos 10 caracteres, com letras e números."
      />
      {error && !Object.keys(errors).length && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" size="lg" block loading={pending}>
        <KeyRound /> Salvar senha
      </Button>
    </form>
  );
}

export function MemberMenu({ tenantSlug }: { tenantSlug: string }) {
  const { run, pending } = useAction();
  const [pwd, setPwd] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="text-current hover:bg-white/10 hover:text-current"
        onClick={() => setPwd(true)}
      >
        <KeyRound /> <span className="hidden sm:inline">Senha</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-current hover:bg-white/10 hover:text-current"
        loading={pending}
        onClick={() => run(() => signOut({ tenantSlug }))}
      >
        <LogOut /> Sair
      </Button>
      <Sheet open={pwd} onOpenChange={setPwd} title="Trocar senha">
        <MemberPasswordForm tenantSlug={tenantSlug} onDone={() => setPwd(false)} />
      </Sheet>
    </div>
  );
}

/**
 * Escolha de uma opção. Fora da política, pede a justificativa (quando a
 * política exige) e avisa que segue para aprovação.
 */
export function ChooseQuoteButton({
  tenantSlug,
  requestId,
  quoteId,
  quoteTitle,
  outOfPolicy,
  needsJustification,
  disabled,
}: {
  tenantSlug: string;
  requestId: string;
  quoteId: string;
  quoteTitle: string;
  outOfPolicy: boolean;
  needsJustification: boolean;
  disabled?: boolean;
}) {
  const { run, pending, errors, error } = useAction();
  const [open, setOpen] = useState(false);
  const [justification, setJustification] = useState("");
  return (
    <>
      <Button size="lg" block disabled={disabled} onClick={() => setOpen(true)}>
        <Check /> Escolher esta opção
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Confirmar escolha"
        description={quoteTitle}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Voltar
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                run(
                  () => chooseQuote({ tenantSlug, requestId, quoteId, justification }),
                  (d) => {
                    setOpen(false);
                    toast.success(
                      d.status === "AWAITING_APPROVAL"
                        ? "Escolha enviada para aprovação."
                        : "Escolha confirmada. A equipe segue para a emissão.",
                    );
                  },
                )
              }
            >
              Confirmar escolha
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {outOfPolicy ? (
            <Notice tone="warning" title="Esta opção está fora da política de viagem">
              A escolha não é bloqueada, mas pode precisar da aprovação do responsável.
              {needsJustification ? " Conte por que esta opção é a melhor para a viagem." : ""}
            </Notice>
          ) : (
            <p className="text-fg-muted text-base">
              Ao confirmar, a equipe segue para a emissão (ou para a aprovação, se o seu cliente
              exigir). Os preços podem mudar até a emissão.
            </p>
          )}
          <TextField
            label="Justificativa"
            optional={!(outOfPolicy && needsJustification)}
            multiline
            rows={4}
            value={justification}
            onChange={setJustification}
            error={errors.justification}
          />
          {error && !Object.keys(errors).length && <Notice tone="danger">{error}</Notice>}
        </div>
      </Sheet>
    </>
  );
}

export function CancelRequestButton({
  tenantSlug,
  requestId,
}: {
  tenantSlug: string;
  requestId: string;
}) {
  const { run, pending, error } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button variant="danger-ghost" onClick={() => setOpen(true)}>
        <XCircle /> Cancelar solicitação
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancelar esta solicitação?"
        description="A equipe para de cotar e as opções deixam de valer. Para viajar depois, faça uma nova solicitação."
        confirmLabel="Cancelar solicitação"
        cancelLabel="Manter"
        tone="danger"
        loading={pending}
        onConfirm={() =>
          run(
            () => cancelRequest({ tenantSlug, requestId, reason }),
            () => {
              setOpen(false);
              toast.success("Solicitação cancelada.");
            },
          )
        }
      >
        <TextField label="Motivo" optional multiline rows={2} value={reason} onChange={setReason} />
        {error && (
          <Notice tone="danger" className="mt-3">
            {error}
          </Notice>
        )}
      </ConfirmDialog>
    </>
  );
}
