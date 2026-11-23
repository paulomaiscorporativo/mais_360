"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { Select, Switch } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { InviteLinkPanel } from "@/components/team/invite-link";
import { createWorkspace } from "./actions";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

type Plan = { id: string; name: string; priceCents: number };

export function NewWorkspaceButton({ plans }: { plans: Plan[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{
    slug: string;
    ownerEmail: string;
    invite: { link: string; expiresAt: string } | null;
  } | null>(null);
  const [f, setF] = useState({
    name: "",
    slug: "",
    slugTouched: false,
    legalName: "",
    document: "",
    billingEmail: "",
    planId: plans[1]?.id ?? plans[0]?.id ?? "",
    trialDays: 14,
    whiteLabel: false,
    ownerName: "",
    ownerEmail: "",
  });
  const set = (patch: Partial<typeof f>) =>
    setF((cur) => {
      const n = { ...cur, ...patch };
      if (patch.name !== undefined && !cur.slugTouched) n.slug = slugify(patch.name);
      return n;
    });

  function submit() {
    setErrors({});
    start(async () => {
      const r = await createWorkspace({
        name: f.name,
        slug: f.slug,
        legalName: f.legalName,
        document: f.document,
        billingEmail: f.billingEmail,
        planId: f.planId,
        trialDays: f.trialDays,
        whiteLabel: f.whiteLabel,
        owner: { name: f.ownerName, email: f.ownerEmail },
      });
      if (r.ok) setDone(r.data);
      else {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Novo assinante
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={done ? "Assinante criado" : "Novo assinante"}
        description={
          done ? undefined : "Conta da empresa que contrata a plataforma, com plano e responsável."
        }
        footer={
          done ? (
            <Button asChild>
              <Link href={`/console/${done.slug}`}>Abrir assinante</Link>
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={submit} loading={pending}>
                Criar assinante
              </Button>
            </>
          )
        }
      >
        {done ? (
          done.invite ? (
            <InviteLinkPanel
              email={done.ownerEmail}
              link={done.invite.link}
              expiresAt={done.invite.expiresAt}
            />
          ) : (
            <Notice tone="success" title={`${done.ownerEmail} já tinha conta`}>
              A pessoa foi definida como dona do novo assinante e recebeu um aviso por e-mail.
            </Notice>
          )
        ) : (
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field label="Nome" error={errors.name}>
              {({ id, invalid }) => (
                <Input
                  id={id}
                  value={f.name}
                  onChange={(e) => set({ name: e.target.value })}
                  aria-invalid={invalid || undefined}
                  autoFocus
                />
              )}
            </Field>
            <Field label="Identificador" error={errors.slug} hint="Usado na URL do console.">
              {({ id, invalid }) => (
                <Input
                  id={id}
                  value={f.slug}
                  onChange={(e) => set({ slug: e.target.value.toLowerCase(), slugTouched: true })}
                  className="font-mono"
                  aria-invalid={invalid || undefined}
                />
              )}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Razão social" optional>
                {({ id }) => (
                  <Input
                    id={id}
                    value={f.legalName}
                    onChange={(e) => set({ legalName: e.target.value })}
                  />
                )}
              </Field>
              <Field label="CNPJ" optional>
                {({ id }) => (
                  <Input
                    id={id}
                    value={f.document}
                    inputMode="numeric"
                    onChange={(e) => set({ document: e.target.value })}
                  />
                )}
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Plano" error={errors.planId}>
                {({ id }) => (
                  <Select
                    id={id}
                    value={f.planId}
                    onValueChange={(planId) => set({ planId })}
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
              <Field label="Período de teste" hint="0 = começa ativo.">
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    max={90}
                    value={f.trialDays}
                    onChange={(e) => set({ trialDays: Number(e.target.value) || 0 })}
                    trailing={<span className="pr-1 text-sm">dias</span>}
                  />
                )}
              </Field>
            </div>
            <Field label="E-mail de cobrança" optional error={errors.billingEmail}>
              {({ id, invalid }) => (
                <Input
                  id={id}
                  type="email"
                  value={f.billingEmail}
                  onChange={(e) => set({ billingEmail: e.target.value })}
                  aria-invalid={invalid || undefined}
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
                onCheckedChange={(whiteLabel) => set({ whiteLabel })}
              />
            </label>
            <div className="border-border border-t pt-5">
              <p className="mb-4 text-sm font-medium">Responsável pela conta</p>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Nome" error={errors["owner.name"]}>
                  {({ id, invalid }) => (
                    <Input
                      id={id}
                      value={f.ownerName}
                      onChange={(e) => set({ ownerName: e.target.value })}
                      aria-invalid={invalid || undefined}
                    />
                  )}
                </Field>
                <Field label="E-mail" error={errors["owner.email"]}>
                  {({ id, invalid }) => (
                    <Input
                      id={id}
                      type="email"
                      value={f.ownerEmail}
                      onChange={(e) => set({ ownerEmail: e.target.value })}
                      aria-invalid={invalid || undefined}
                    />
                  )}
                </Field>
              </div>
            </div>
            <button type="submit" hidden />
          </form>
        )}
      </Sheet>
    </>
  );
}
