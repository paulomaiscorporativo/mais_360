import { guard } from "@/server/auth";
import { requireProjectFeature } from "@/server/projects";

/** Checagem do recurso antes de qualquer streaming: desligado ou sem acesso → 404 real. */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  await guard(requireProjectFeature(ws, tenant, project, "FLIGHTS"));
  return children;
}
