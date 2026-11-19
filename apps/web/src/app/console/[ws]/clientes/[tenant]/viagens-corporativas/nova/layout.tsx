import { notFound } from "next/navigation";
import { guard } from "@/server/auth";
import { requireCorporateTravel } from "@/server/corporate-travel";

/** Só a equipe de atendimento registra pedidos: sem permissão, 404 antes do streaming. */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const c = await guard(requireCorporateTravel((await params).tenant));
  if (!c.canAttend) notFound();
  return children;
}
