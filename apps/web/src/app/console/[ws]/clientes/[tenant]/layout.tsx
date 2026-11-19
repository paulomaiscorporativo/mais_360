import { guard, requireTenant } from "@/server/auth";

/**
 * Checagem de acesso ao cliente ANTES de qualquer limite de Suspense, para que
 * cliente inexistente ou sem acesso responda HTTP 404 de verdade (o streaming
 * ainda não começou). Cabeçalho e abas ficam em (gestao)/layout.tsx; o projeto
 * tem o próprio cabeçalho em projetos/[project]/layout.tsx.
 */
export default async function TenantGuardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  await guard(requireTenant((await params).tenant));
  return children;
}
