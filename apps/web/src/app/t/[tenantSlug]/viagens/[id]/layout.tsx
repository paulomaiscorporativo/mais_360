import { notFound, redirect } from "next/navigation";
import { currentMember } from "@/server/member-portal";
import { loadMemberArea } from "../shell";

/**
 * A solicitação precisa ser do associado logado — checado antes do streaming
 * (id de outra pessoa ou inexistente responde 404 de verdade).
 */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string; id: string }>;
}) {
  const { tenantSlug, id } = await params;
  const area = await loadMemberArea(tenantSlug);
  if (!area) notFound();
  const m = await currentMember(tenantSlug);
  if (!m || m.person.mustChangePassword) redirect(area.base);
  if (id.length > 40) notFound();
  const own = await m.db.travelRequest.count({ where: { id, requesterPersonId: m.person.id } });
  if (!own) notFound();
  return children;
}
