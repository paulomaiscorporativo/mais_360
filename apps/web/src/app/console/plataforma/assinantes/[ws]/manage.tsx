"use client";

import { CalendarPlus, ChevronDown, CreditCard, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Field, Input, Notice, Textarea } from "@/components/ui";
import { Select, Switch } from "@/components/ui/controls";
import {
  ConfirmDialog,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Sheet,
} from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import {
  changeWorkspacePlan,
  changeWorkspaceStatus,
  extendWorkspaceTrial,
  updateWorkspaceDetails,
} from "../actions";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

type StatusAction = {
  action: "ACTIVATE" | "MARK_PAST_DUE" | "SUSPEND" | "REACTIVATE" | "CANCEL";
  label: string;
  effect: string;
  destructive: boolean;
  to: string;
};

type Props = {
  workspace: {
    id: string;
    name: string;
    status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED";
    legalName: string;
    document: string;
    billingEmail: string;
    whiteLabel: boolean;
    trialEndsAt: string | null;
    planId: string | null;
  };
  plans: { id: string; name: string; priceCents: number }[];
  statusActions: StatusAction[];
};

type Open = "details" | "plan" | "trial" | StatusAction["action"] | null;

/** Ações do superadmin na página do assinante: dados, plano, teste e situação. */
export function WorkspaceActions({ workspace, plans, statusActions }: Props) {
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const current = statusActions.find((a) => a.action === open);

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button>
            Gerenciar <ChevronDown />
          </Button>
        </MenuTrigger>
        <MenuContent className="min-w-60">
          <MenuItem onSelect={() => setOpen("details")}>
            <Pencil /> Editar dados
          </MenuItem>
          <MenuItem onSelect={() => setOpen("plan")}>
            <CreditCard /> Trocar plano
          </MenuItem>
          {workspace.status === "TRIAL" && (
            <MenuItem onSelect={() => setOpen("trial")}>
              <CalendarPlus /> Estender teste
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuLabel>Situação</MenuLabel>
          {statusActions.map((a) => (
            <MenuItem
              key={a.action}
              tone={a.destructive ? "danger" : undefined}
              onSelect={() => setOpen(a.action)}
            >
              {a.label}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>

      <DetailsSheet open={open === "details"} onClose={close} workspace={workspace} />
      <PlanSheet open={open === "plan"} onClose={close} workspace={workspace} plans={plans} />
      <TrialSheet open={open === "trial"} onClose={close} workspace={workspace} />
      {current && (
        <StatusDialog key={current.action} action={current} workspace={workspace} onClose={close} />
      )}
    </>
  );
}

function useSubmit() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  function submit<T>(
    run: () => Promise<
      { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> }
    >,
    onOk: (data: T) => void,
  ) {
    setErrors({});
    start(async () => {
      const r = await run();
      if (r.ok) {
        onOk(r.data);
        router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
      }
    });
  }
  return { pending, errors, submit };
}

function DetailsSheet({
  open,
  onClose,
  workspace,
}: {
  open: boolean;
  onClose: () => void;
  workspace: Props["workspace"];
}) {
  const { pending, errors, submit } = useSubmit();
  const [f, setF] = useState({
    name: workspace.name,
    legalName: workspace.legalName,
    document: workspace.document,
    billingEmail: workspace.billingEmail,
    whiteLabel: workspace.whiteLabel,
  });
  const save = () =>
    submit(
      () => updateWorkspaceDetails({ workspaceId: workspace.id, ...f }),
      () => {
        toast.success("Dados do assinante salvos.");
        onClose();
      },
    );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Editar dados"
      description="Identificação e cobrança do assinante."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={pending}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Nome" error={errors.name}>
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Field label="Razão social" optional error={errors.legalName}>
          {({ id }) => (
            <Input
              id={id}
              value={f.legalName}
              onChange={(e) => setF({ ...f, legalName: e.target.value })}
            />
          )}
        </Field>
        <Field label="CNPJ" optional error={errors.document} hint="Só os números ou com pontuação.">
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              inputMode="numeric"
              value={f.document}
              onChange={(e) => setF({ ...f, document: e.target.value })}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Field label="E-mail de cobrança" optional error={errors.billingEmail}>
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              type="email"
              value={f.billingEmail}
              onChange={(e) => setF({ ...f, billingEmail: e.target.value })}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <label className="border-border bg-surface-muted flex cursor-pointer items-start justify-between gap-4 rounded-md border p-4">
          <span>
            <span className="block text-base font-medium">Marca própria (white-label)</span>
            <span className="text-fg-subtle mt-0.5 block text-sm">
              Os clientes deste assinante não veem a marca da plataforma.
            </span>
          </span>
          <Switch
            checked={f.whiteLabel}
            onCheckedChange={(whiteLabel) => setF({ ...f, whiteLabel })}
          />
        </label>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

function PlanSheet({
  open,
  onClose,
  workspace,
  plans,
}: {
  open: boolean;
  onClose: () => void;
  workspace: Props["workspace"];
  plans: Props["plans"];
}) {
  const { pending, errors, submit } = useSubmit();
  const [planId, setPlanId] = useState(workspace.planId ?? plans[0]?.id ?? "");
  const save = () =>
    submit(
      () => changeWorkspacePlan({ workspaceId: workspace.id, planId }),
      (d) => {
        toast.success(`Plano alterado para ${d.plan}.`);
        onClose();
      },
    );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Trocar plano"
      description={`Plano de ${workspace.name}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={pending} disabled={planId === workspace.planId}>
            Trocar plano
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Novo plano" error={errors.planId}>
          {({ id }) => (
            <Select
              id={id}
              value={planId}
              onValueChange={setPlanId}
              options={plans.map((p) => ({
                value: p.id,
                label: p.name,
                description: p.priceCents
                  ? `${brl.format(p.priceCents / 100)}/mês`
                  : "Sob consulta",
              }))}
            />
          )}
        </Field>
        <Notice tone="info">
          Vale na hora. Módulos que não fazem parte do novo plano deixam de aparecer para os
          clientes do assinante (as configurações ficam guardadas e voltam se o plano voltar).
        </Notice>
      </div>
    </Sheet>
  );
}

function TrialSheet({
  open,
  onClose,
  workspace,
}: {
  open: boolean;
  onClose: () => void;
  workspace: Props["workspace"];
}) {
  const { pending, errors, submit } = useSubmit();
  const [days, setDays] = useState(7);
  const save = () =>
    submit(
      () => extendWorkspaceTrial({ workspaceId: workspace.id, days }),
      () => {
        toast.success(`Teste estendido em ${days} ${days === 1 ? "dia" : "dias"}.`);
        onClose();
      },
    );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Estender teste"
      description={
        workspace.trialEndsAt
          ? "Os dias são somados ao fim atual do teste (ou a hoje, se já venceu)."
          : "O teste ainda não tem data de fim; os dias contam a partir de hoje."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={pending}>
            Estender
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Dias a mais" error={errors.days} hint="De 1 a 90 dias.">
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 0)}
              trailing={<span className="pr-1 text-sm">dias</span>}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

function StatusDialog({
  action,
  workspace,
  onClose,
}: {
  action: StatusAction;
  workspace: Props["workspace"];
  onClose: () => void;
}) {
  const { pending, errors, submit } = useSubmit();
  const [reason, setReason] = useState("");
  const confirm = () =>
    submit(
      () =>
        changeWorkspaceStatus({
          workspaceId: workspace.id,
          action: action.action,
          expected: workspace.status,
          reason,
        }),
      () => {
        toast.success(`${workspace.name}: ${action.to.toLowerCase()}.`);
        onClose();
      },
    );

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${action.label}: ${workspace.name}?`}
      description={action.effect}
      confirmLabel={action.label}
      tone={action.destructive ? "danger" : "primary"}
      loading={pending}
      onConfirm={confirm}
    >
      <Field
        label="Motivo"
        error={errors.reason}
        hint="Fica no histórico do assinante. Ex.: boleto de outubro vencido há 30 dias."
      >
        {({ id, invalid, describedBy }) => (
          <Textarea
            id={id}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            maxLength={500}
            autoFocus
          />
        )}
      </Field>
    </ConfirmDialog>
  );
}
