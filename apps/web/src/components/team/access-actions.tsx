"use client";

import { KeyRound, MailPlus, RotateCcw, ShieldOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { UserAccessStatus } from "@mais/core";
import { Notice } from "@/components/ui";
import { ConfirmDialog, MenuItem, MenuSeparator } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { ResentInviteSheet } from "./invite-sheet";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type AccessTarget = {
  /** Chave da ação (id do vínculo ou do usuário, conforme a tela). */
  key: string;
  name: string;
  email: string;
  status: UserAccessStatus;
  isSelf: boolean;
  /** O administrador tem autoridade sobre TODOS os vínculos da pessoa. */
  canDeactivate: boolean;
};

type Handlers = {
  resend: (key: string) => Promise<Result<{ email: string; link: string; expiresAt: string }>>;
  reset: (key: string) => Promise<Result<{ email: string }>>;
  deactivate: (key: string) => Promise<Result<{ mode: "DEACTIVATED" | "UNLINKED" }>>;
  reactivate: (key: string) => Promise<Result<void>>;
  remove?: (key: string) => Promise<Result<void>>;
};

/**
 * Ações de acesso por membro (reenviar convite, redefinir senha, desativar,
 * reativar, remover), compartilhadas pelas telas de equipe. Devolve os itens
 * do menu de cada linha e os diálogos de confirmação.
 */
export function useAccessActions({
  handlers,
  contextLabel,
}: {
  handlers: Handlers;
  /** "deste cliente", "deste assinante", "da plataforma" */
  contextLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<{
    kind: "reset" | "deactivate" | "remove";
    target: AccessTarget;
  } | null>(null);
  const [resent, setResent] = useState<{ email: string; link: string; expiresAt: string } | null>(
    null,
  );

  const run = <T,>(fn: () => Promise<Result<T>>, onOk: (data: T) => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        onOk(r.data);
        router.refresh();
      } else toast.error(r.error);
    });

  const resend = (t: AccessTarget) => run(() => handlers.resend(t.key), setResent);
  const reactivate = (t: AccessTarget) =>
    run(
      () => handlers.reactivate(t.key),
      () => toast.success(`${t.name} pode entrar de novo.`),
    );

  function onConfirm() {
    if (!confirm) return;
    const { kind, target: t } = confirm;
    if (kind === "reset")
      run(
        () => handlers.reset(t.key),
        (d) => {
          toast.success(`Link de redefinição enviado para ${d.email}.`);
          setConfirm(null);
        },
      );
    if (kind === "deactivate")
      run(
        () => handlers.deactivate(t.key),
        (d) => {
          toast.success(
            d.mode === "DEACTIVATED"
              ? `${t.name} foi desconectado e não consegue mais entrar.`
              : `${t.name} não tem mais acesso ${contextLabel}.`,
          );
          setConfirm(null);
        },
      );
    if (kind === "remove" && handlers.remove)
      run(
        () => handlers.remove!(t.key),
        () => {
          toast.success(`${t.name} não tem mais acesso ${contextLabel}.`);
          setConfirm(null);
        },
      );
  }

  function menuItems(t: AccessTarget) {
    if (t.isSelf) return null;
    return (
      <>
        <MenuSeparator />
        {t.status === "INVITED" && (
          <MenuItem onSelect={() => resend(t)}>
            <MailPlus /> Reenviar convite
          </MenuItem>
        )}
        {t.status === "ACTIVE" && (
          <MenuItem onSelect={() => setConfirm({ kind: "reset", target: t })}>
            <KeyRound /> Enviar link de redefinição de senha
          </MenuItem>
        )}
        {t.status === "DISABLED" ? (
          t.canDeactivate && (
            <MenuItem onSelect={() => reactivate(t)}>
              <RotateCcw /> Reativar acesso
            </MenuItem>
          )
        ) : (
          <MenuItem tone="danger" onSelect={() => setConfirm({ kind: "deactivate", target: t })}>
            <ShieldOff /> Desativar acesso
          </MenuItem>
        )}
        {handlers.remove && (
          <MenuItem tone="danger" onSelect={() => setConfirm({ kind: "remove", target: t })}>
            <Trash2 /> Remover {contextLabel}
          </MenuItem>
        )}
      </>
    );
  }

  const t = confirm?.target;
  const unlinkOnly = confirm?.kind === "deactivate" && !t?.canDeactivate;
  const dialog = {
    reset: {
      title: `Enviar link de redefinição para ${t?.name ?? ""}?`,
      description: `Enviaremos um link para ${t?.email ?? ""} que vale 1 hora. A senha atual continua valendo até a pessoa criar a nova.`,
      confirmLabel: "Enviar link",
      tone: "primary" as const,
    },
    deactivate: unlinkOnly
      ? {
          title: `Remover o acesso de ${t?.name ?? ""} ${contextLabel}?`,
          description: `A conta não será desativada: a pessoa também tem acesso a clientes ou assinantes que você não administra. Removeremos apenas o acesso ${contextLabel}.`,
          confirmLabel: "Remover acesso",
          tone: "danger" as const,
        }
      : {
          title: `Desativar o acesso de ${t?.name ?? ""}?`,
          description:
            "A conta fica bloqueada e as sessões abertas caem na hora. Os vínculos e o histórico são mantidos; dá para reativar depois.",
          confirmLabel: "Desativar acesso",
          tone: "danger" as const,
        },
    remove: {
      title: `Remover ${t?.name ?? ""}?`,
      description: `A pessoa perde o acesso ${contextLabel} imediatamente. A conta e o histórico são preservados.`,
      confirmLabel: "Remover acesso",
      tone: "danger" as const,
    },
  }[confirm?.kind ?? "reset"];

  const dialogs = (
    <>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={dialog.title}
        description={dialog.description}
        confirmLabel={dialog.confirmLabel}
        tone={dialog.tone}
        loading={pending}
        onConfirm={onConfirm}
      >
        {unlinkOnly && (
          <Notice tone="info" title="Por que não desativar a conta?">
            Desativar bloqueia a pessoa em toda a plataforma. Isso só pode ser feito por quem
            administra todos os acessos dela.
          </Notice>
        )}
      </ConfirmDialog>
      <ResentInviteSheet result={resent} onClose={() => setResent(null)} />
    </>
  );

  return { menuItems, dialogs, pending };
}
