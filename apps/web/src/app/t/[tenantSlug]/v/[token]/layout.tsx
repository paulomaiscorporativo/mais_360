import { notFound } from "next/navigation";
import { loadTravelerPortal } from "@/server/traveler-portal";

/** Link inválido, inscrição cancelada ou projeto sem portal → 404 real, antes do streaming. */
export default async function TravelerPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string; token: string }>;
}) {
  const { tenantSlug, token } = await params;
  if (!(await loadTravelerPortal(tenantSlug, token))) notFound();
  return children;
}
