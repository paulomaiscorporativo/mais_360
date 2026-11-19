import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { MODULE_KEYS, MODULES, type ModuleKey } from "@mais/core";
import { Badge, PageHeader } from "@/components/ui";
import { MODULE_UI } from "@/config/modules-ui";
import { guard, requirePlatformRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Planos" };

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("pt-BR");

const LIMITS: { key: string; label: string }[] = [
  { key: "tenants", label: "Clientes" },
  { key: "activeProjects", label: "Projetos ativos" },
  { key: "registrationsPerMonth", label: "Inscrições por mês" },
  { key: "whatsappPerMonth", label: "Mensagens de WhatsApp por mês" },
  { key: "kiosks", label: "Totens de autoatendimento" },
  { key: "users", label: "Usuários" },
];

export default async function PlansPage() {
  await guard(requirePlatformRole(["SUPERADMIN", "SUPPORT"]));
  const plans = await prisma.plan.findMany({
    where: { archivedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { subscriptions: true } } },
  });

  const limitValue = (limits: unknown, key: string) => {
    const v = (limits as Record<string, number | undefined> | null)?.[key];
    if (v === undefined) return "Ilimitado";
    if (v === 0) return <Minus className="text-fg-faint mx-auto size-4" aria-label="Não incluso" />;
    return num.format(v);
  };

  return (
    <>
      <PageHeader
        title="Planos"
        description="O que cada assinante pode usar e revender aos próprios clientes."
      />
      <div className="border-border bg-surface scrollbar-thin overflow-x-auto rounded-md border shadow-sm">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-border border-b">
              <th scope="col" className="text-fg-subtle px-5 py-5 align-bottom text-xs font-medium">
                Recursos
              </th>
              {plans.map((p, i) => (
                <th
                  key={p.id}
                  scope="col"
                  className={cn(
                    "w-[20.6%] px-4 py-5 text-center align-top font-normal",
                    i === 1 && "bg-brand-subtle/50",
                  )}
                >
                  <div className="flex h-5 justify-center">
                    {i === 1 && (
                      <Badge tone="brand" size="sm">
                        Mais escolhido
                      </Badge>
                    )}
                  </div>
                  <div className="text-md mt-2 font-semibold">{p.name}</div>
                  <div className="tabular mt-1 text-xl font-semibold tracking-tight">
                    {p.priceCents ? brl.format(p.priceCents / 100) : "Sob consulta"}
                    {p.priceCents > 0 && (
                      <span className="text-fg-subtle text-sm font-normal"> /mês</span>
                    )}
                  </div>
                  <p className="text-fg-subtle mx-auto mt-2 max-w-[220px] text-sm">
                    {p.description}
                  </p>
                  <p className="text-fg-faint mt-3 text-xs">
                    {p._count.subscriptions}{" "}
                    {p._count.subscriptions === 1 ? "assinante" : "assinantes"}
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th
                colSpan={plans.length + 1}
                className="bg-surface-muted text-fg-subtle px-5 py-2 text-xs font-medium"
              >
                Módulos
              </th>
            </tr>
            {MODULE_KEYS.map((m: ModuleKey) => {
              const Icon = MODULE_UI[m].icon;
              return (
                <tr key={m} className="border-border border-b">
                  <th scope="row" className="px-5 py-3 font-normal">
                    <span className="flex items-center gap-2.5">
                      <Icon className="text-fg-subtle size-4" />
                      {MODULES[m].name}
                    </span>
                  </th>
                  {plans.map((p, i) => (
                    <td
                      key={p.id}
                      className={cn("px-4 py-3 text-center", i === 1 && "bg-brand-subtle/50")}
                    >
                      {p.modules.includes(m) ? (
                        <Check
                          className="text-success mx-auto size-4"
                          strokeWidth={2.5}
                          aria-label="Incluso"
                        />
                      ) : (
                        <Minus className="text-fg-faint mx-auto size-4" aria-label="Não incluso" />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr>
              <th
                colSpan={plans.length + 1}
                className="bg-surface-muted text-fg-subtle px-5 py-2 text-xs font-medium"
              >
                Limites
              </th>
            </tr>
            {LIMITS.map((l) => (
              <tr key={l.key} className="border-border border-b last:border-b-0">
                <th scope="row" className="px-5 py-3 font-normal">
                  {l.label}
                </th>
                {plans.map((p, i) => (
                  <td
                    key={p.id}
                    className={cn(
                      "tabular text-fg-muted px-4 py-3 text-center",
                      i === 1 && "bg-brand-subtle/50",
                    )}
                  >
                    {limitValue(p.limits, l.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
