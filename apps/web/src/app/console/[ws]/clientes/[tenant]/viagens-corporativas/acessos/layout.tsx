import { notFound } from "next/navigation";
import { guard } from "@/server/auth";
import { requireCorporateTravel } from "@/server/corporate-travel";

/** Só administrador e gestor do cliente liberam acessos: sem permissão, 404 antes do streaming. */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const c = await guard(requireCorporateTravel((await params).tenant));
  if (!c.canConfigure) notFound();
  return children;
}
