import "server-only";
import { cache } from "react";
import { Avatar } from "@/components/ui";
import { termsWithDefaults } from "@/config/terms";
import { PRODUCT } from "@/config/product";
import { resolveBrand } from "@/server/brand";
import { modulesForTenant } from "@/server/modules";
import { tenantPublicBase } from "@/server/public-links";
import { tenantDb } from "@/server/tenant-db";
import { resolvePublicTenant } from "@/server/tenant-resolve";

/**
 * Área do associado — cliente ativo com o módulo de viagens corporativas.
 * Sem o módulo, a área não existe (404 na página).
 */
export const loadMemberArea = cache(async (tenantSlug: string) => {
  const tenant = await resolvePublicTenant(tenantSlug);
  if (!tenant || tenant.status !== "ACTIVE") return null;
  if (!(await modulesForTenant(tenant)).has("CORPORATE_TRAVEL")) return null;
  const terms = termsWithDefaults(
    await tenantDb({ tenantId: tenant.id }).tenantTerm.findMany({
      select: { key: true, value: true },
    }),
  );
  // Links absolutos: no subdomínio do cliente a rota /t/<slug> é reescrita pelo proxy
  const base = `${await tenantPublicBase(tenant)}/viagens`;
  return { tenant, terms, brand: resolveBrand(tenant), base };
});

/** Cabeçalho com a marca do cliente (Experiência: generoso, mobile-first). */
export function MemberShell({
  tenant,
  title,
  subtitle,
  aside,
  showProduct,
  children,
}: {
  tenant: { name: string; branding: { logoFileId: string | null } | null };
  /** Falso em white-label: a marca do produto não aparece. */
  showProduct: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const logo = tenant.branding?.logoFileId ? `/api/files/${tenant.branding.logoFileId}` : null;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="bg-brand text-brand-fg relative overflow-hidden px-5 pt-6 pb-8 sm:mt-8 sm:rounded-t-lg sm:px-10">
        <div className="pointer-events-none absolute -top-20 -right-20 size-72 rounded-full border border-current opacity-[0.08]" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt={tenant.name}
                className="h-9 w-auto max-w-[140px] rounded-sm bg-white/95 object-contain p-1"
              />
            ) : (
              <Avatar
                name={tenant.name}
                size="md"
                square
                className="bg-white/15 text-current ring-0"
              />
            )}
            <span className="truncate text-sm font-medium opacity-80">{tenant.name}</span>
          </div>
          {aside}
        </div>
        <h1 className="font-display relative mt-6 text-[30px] leading-[1.1] tracking-[-0.01em] sm:text-[36px]">
          {title}
        </h1>
        {subtitle && <p className="relative mt-2 text-base opacity-90">{subtitle}</p>}
      </header>
      <main className="bg-surface flex-1 px-5 py-8 sm:mb-8 sm:rounded-b-lg sm:border sm:border-t-0 sm:px-10">
        {children}
      </main>
      {showProduct && (
        <p className="text-fg-faint pb-6 text-center text-xs">{PRODUCT.lines.travel}</p>
      )}
    </div>
  );
}
