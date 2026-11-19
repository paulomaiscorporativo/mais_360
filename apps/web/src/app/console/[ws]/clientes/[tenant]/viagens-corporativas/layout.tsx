import { Briefcase } from "lucide-react";
import { Badge } from "@/components/ui";
import { TravelNav } from "@/components/corporate-travel/subnav";
import { PRODUCT } from "@/config/product";
import { guard } from "@/server/auth";
import { corporateTravelBase, requireCorporateTravel } from "@/server/corporate-travel";

/**
 * Mais 360 Travel no console do cliente. A checagem do módulo acontece aqui,
 * antes de qualquer streaming: cliente sem CORPORATE_TRAVEL → 404 real.
 */
export default async function CorporateTravelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { ws, tenant } = await params;
  const c = await guard(requireCorporateTravel(tenant));
  const [open, awaiting] = await Promise.all([
    c.db.travelRequest.count({ where: { status: { in: ["NEW", "IN_PROGRESS", "APPROVED"] } } }),
    c.db.travelRequest.count({ where: { status: "AWAITING_APPROVAL" } }),
  ]);
  const base = corporateTravelBase(ws, tenant);
  const items = [
    { href: "", label: "Solicitações", count: open, exact: true },
    { href: "aprovacoes", label: "Aprovações", count: awaiting },
    { href: "politica", label: "Política" },
    ...(c.canConfigure ? [{ href: "acessos", label: "Acessos" }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-brand-subtle text-brand-subtle-fg grid size-9 shrink-0 place-items-center rounded-md [&_svg]:size-[18px]">
            <Briefcase />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-md font-semibold tracking-tight">Viagens corporativas</h2>
              <Badge size="sm">{PRODUCT.lines.travel}</Badge>
            </div>
            <p className="text-fg-subtle text-sm">
              {c.tenant.name}: solicitações, cotações, política e aprovações.
            </p>
          </div>
        </div>
        <TravelNav base={base} items={items} />
      </div>
      {children}
    </div>
  );
}
