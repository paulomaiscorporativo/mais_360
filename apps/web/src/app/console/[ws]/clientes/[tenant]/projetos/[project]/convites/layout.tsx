import { BarChart3, Building2, ScanLine, Settings2, Users } from "lucide-react";
import { LinkTabs } from "@/components/ui/tabs";
import { guard } from "@/server/auth";
import { projectBase, requireProjectFeature } from "@/server/projects";

/**
 * Módulo Eventos e convites (Mais 360 Events). A checagem do recurso INVITES
 * acontece aqui, antes de qualquer streaming — recurso desligado vira 404 real.
 */
export default async function InvitesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  const p = await guard(requireProjectFeature(ws, tenant, project, "INVITES"));
  const base = `${projectBase(ws, tenant, project)}/convites`;
  const [guests, companies] = await Promise.all([
    p.db.eventInvite.count({
      where: { projectId: p.projectId, registration: { status: { not: "CANCELED" } } },
    }),
    p.db.companyQuota.count({ where: { projectId: p.projectId } }),
  ]);
  const items = [
    { href: base, label: "Convidados", icon: <Users className="size-4" />, exact: true, count: guests },
    { href: `${base}/empresas`, label: "Empresas", icon: <Building2 className="size-4" />, count: companies },
    { href: `${base}/checkin`, label: "Check-in", icon: <ScanLine className="size-4" /> },
    { href: `${base}/relatorios`, label: "Relatórios", icon: <BarChart3 className="size-4" /> },
  ];
  if (p.canEdit)
    items.push({ href: `${base}/configuracoes`, label: "Evento", icon: <Settings2 className="size-4" /> });
  return (
    <div className="flex flex-col gap-6">
      <LinkTabs items={items} className="-mt-2" />
      {children}
    </div>
  );
}
