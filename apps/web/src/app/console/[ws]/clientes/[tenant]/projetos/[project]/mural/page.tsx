import { formatInZone, muralState, sortMural, toLocalInput } from "@mais/core";
import { guard } from "@/server/auth";
import { requireProjectFeature } from "@/server/projects";
import { audienceOptions, projectTz } from "@/server/travel";
import { MuralManager, type MuralRow } from "./mural";

export default async function MuralPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project } = await params;
  const p = await guard(requireProjectFeature(ws, tenant, project, "MURAL"));
  const tz = projectTz(p);
  const [posts, options] = await Promise.all([
    p.db.muralPost.findMany({ where: { projectId: p.projectId } }),
    audienceOptions(p.db, p.projectId),
  ]);
  const now = new Date();
  const rows: MuralRow[] = sortMural(posts).map((m) => ({
    id: m.id,
    title: m.title,
    message: m.message,
    audience: m.audience,
    audienceId: m.audienceId,
    urgent: m.urgent,
    pinned: m.pinned,
    active: m.active,
    publishAt: toLocalInput(m.publishAt, tz),
    expiresAt: toLocalInput(m.expiresAt, tz),
    publishLabel: formatInZone(m.publishAt, tz, "datetime"),
    expiresLabel: m.expiresAt ? formatInZone(m.expiresAt, tz, "datetime") : "",
    author: m.author,
    state: muralState(m, now),
  }));
  return (
    <MuralManager
      tenant={tenant}
      projectId={p.projectId}
      canEdit={p.canEdit}
      posts={rows}
      options={options}
    />
  );
}
