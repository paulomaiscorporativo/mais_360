import { Printer } from "lucide-react";
import { BatchSortBar } from "@/components/sorting/batch-sort-bar";
import { guard } from "@/server/auth";
import { projectBase, requireProjectFeature } from "@/server/projects";
import { batchSortProps } from "@/server/sorting";
import { CheckinDesk } from "./desk";

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  const p = await guard(requireProjectFeature(ws, tenant, project, "INVITES"));
  const where = {
    projectId: p.projectId,
    role: "GUEST" as const,
    status: { not: "CANCELED" as const },
  };
  const [total, checked, confirmed, sorting] = await Promise.all([
    p.db.registration.count({ where }),
    p.db.registration.count({ where: { ...where, checkedInAt: { not: null } } }),
    p.db.registration.count({ where: { ...where, status: "CONFIRMED" } }),
    batchSortProps(p),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <CheckinDesk
        tenant={tenant}
        projectId={p.projectId}
        timeZone={p.project.timezone ?? p.tenant.timezone}
        initial={{ total, checked, confirmed }}
      />
      <BatchSortBar
        {...sorting}
        links={[
          {
            label: "Imprimir lista de check-in",
            href: `${projectBase(ws, tenant, project)}/convites/checkin/lista`,
            icon: <Printer />,
            newTab: true,
          },
        ]}
      />
    </div>
  );
}
