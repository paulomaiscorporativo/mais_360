import { guard } from "@/server/auth";
import { requireProjectFeature } from "@/server/projects";
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
  const [total, checked, confirmed] = await Promise.all([
    p.db.registration.count({ where }),
    p.db.registration.count({ where: { ...where, checkedInAt: { not: null } } }),
    p.db.registration.count({ where: { ...where, status: "CONFIRMED" } }),
  ]);
  return (
    <CheckinDesk
      tenant={tenant}
      projectId={p.projectId}
      operator={p.viewer.user.name}
      initial={{ total, checked, confirmed }}
    />
  );
}
