import type { Metadata } from "next";
import { availableProjectFeatures } from "@mais/core";
import {
  PLATFORM_DEFAULT_SORT,
  SAMPLE_SORT_ROWS,
  availableSortOptions,
  readSortingSettings,
} from "@mais/core/sorting";
import { FormSection } from "@/components/ui";
import { SortingSettings } from "@/components/sorting/sorting-settings";
import { guard, requireTenant } from "@/server/auth";
import { modulesForTenant } from "@/server/modules";

export const metadata: Metadata = { title: "Ordenação das listas" };

export default async function TenantSortingPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const ctx = await guard(requireTenant(slug));
  const modules = await modulesForTenant(ctx.tenant);
  // No cliente valem os recursos que os módulos contratados liberam; cada
  // projeto ajusta depois ao que ligou (ex.: sem mapa de mesas).
  const options = availableSortOptions({
    features: availableProjectFeatures(modules),
    hasCategories: true,
    hasGroups: true,
  });

  return (
    <div className="max-w-4xl">
      <FormSection
        title="Ordenação das listas"
        description="Ordem padrão dos relatórios, CSV, etiquetas, credenciais, listas de check-in e vouchers em lote. Cada projeto pode ter a sua, e dá para trocar na hora de gerar."
      >
        <SortingSettings
          tenant={slug}
          own={readSortingSettings(ctx.tenant.settings)}
          inherited={PLATFORM_DEFAULT_SORT}
          inheritedFrom="Padrão da plataforma"
          options={options}
          sample={SAMPLE_SORT_ROWS}
          canEdit={ctx.role === "ADMIN" || ctx.role === "MANAGER"}
        />
      </FormSection>
    </div>
  );
}
