import { notFound } from "next/navigation";
import { tenantFont } from "@/app/fonts";
import { resolveBrand } from "@/server/brand";
import { resolvePublicTenant } from "@/server/tenant-resolve";
import { cn } from "@/lib/cn";

/**
 * Área pública do cliente ("Experiência" em DESIGN.md): a marca do cliente
 * manda — cor, fonte e, com white-label, sem a marca do produto.
 */
export default async function TenantPublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await resolvePublicTenant(tenantSlug);
  if (!tenant || tenant.status !== "ACTIVE") notFound();
  const brand = resolveBrand(tenant);
  const font = tenantFont(brand.fontFamily);

  return (
    <div
      className={cn("tenant-scope bg-surface font-tenant text-md min-h-dvh", font.className)}
      style={{ "--tenant-font": `var(${font.cssVar})` } as React.CSSProperties}
    >
      <style>{brand.scopedCss(".tenant-scope")}</style>
      {children}
    </div>
  );
}
