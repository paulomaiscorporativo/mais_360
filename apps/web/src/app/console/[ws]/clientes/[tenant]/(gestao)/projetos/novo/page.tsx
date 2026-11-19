import { MODULES, PROJECT_FEATURES, availableProjectFeatures, type ProjectFeature } from "@mais/core";
import { guard, requireTenant } from "@/server/auth";
import { modulesForTenant } from "@/server/modules";
import { ProjectWizard } from "./wizard";

export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { ws, tenant: slug } = await params;
  const ctx = await guard(requireTenant(slug, "MANAGER"));
  const active = await modulesForTenant(ctx.tenant);
  const available = availableProjectFeatures(active);

  // Para cada recurso indisponível, o módulo que o liberaria (explicação na tela).
  const requires: Partial<Record<ProjectFeature, string>> = {};
  for (const f of PROJECT_FEATURES) {
    if (available.has(f)) continue;
    const mod = Object.values(MODULES).find((m) => m.features.includes(f));
    if (mod) requires[f] = mod.name;
  }

  return (
    <ProjectWizard
      ws={ws}
      tenant={slug}
      timezone={ctx.tenant.timezone}
      available={[...available]}
      requires={requires}
    />
  );
}
