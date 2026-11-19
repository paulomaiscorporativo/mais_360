import { notFound } from "next/navigation";
import { guard } from "@/server/auth";
import { requireCorporateTravel } from "@/server/corporate-travel";

/** Solicitação inexistente (ou de outro cliente) → 404 antes do streaming. */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string; id: string }>;
}) {
  const { tenant, id } = await params;
  const c = await guard(requireCorporateTravel(tenant));
  if (id.length > 40 || !(await c.db.travelRequest.count({ where: { id } }))) notFound();
  return children;
}
