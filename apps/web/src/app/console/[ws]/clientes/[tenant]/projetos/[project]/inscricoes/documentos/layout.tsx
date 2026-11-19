import { guard } from "@/server/auth";
import { notFound } from "@/server/errors";
import { requireProject } from "@/server/projects";

/** Documentos em lote exigem o módulo de documentos: sem ele → 404 real, antes do streaming. */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  await guard(
    requireProject(ws, tenant, project).then((p) => {
      if (!p.modules.has("DOCUMENTS")) throw notFound("Módulo de documentos não contratado.");
      return p;
    }),
  );
  return children;
}
