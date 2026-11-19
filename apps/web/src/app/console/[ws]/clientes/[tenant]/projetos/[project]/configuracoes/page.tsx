import { MODULES, PROJECT_FEATURES, type ProjectFeature } from "@mais/core";
import { SortingSettings } from "@/components/sorting/sorting-settings";
import { FormSection } from "@/components/ui";
import { guard } from "@/server/auth";
import { requireProject } from "@/server/projects";
import { projectSortingSettings } from "@/server/sorting";
import { toDateInput } from "../../../(gestao)/projetos/format";
import { ProjectSettingsForm } from "./settings";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; project: string }>;
}) {
  const { ws, tenant, project: slug } = await params;
  const p = await guard(requireProject(ws, tenant, slug));
  const tz = p.project.timezone ?? p.tenant.timezone;
  const [categories, groups, sorting] = await Promise.all([
    p.db.registrationCategory.findMany({
      where: { projectId: p.projectId },
      orderBy: { sortOrder: "asc" },
    }),
    p.db.projectGroup.findMany({ where: { projectId: p.projectId }, orderBy: { name: "asc" } }),
    projectSortingSettings(p),
  ]);
  const requires: Partial<Record<ProjectFeature, string>> = {};
  for (const f of PROJECT_FEATURES) {
    if (p.available.has(f)) continue;
    const mod = Object.values(MODULES).find((m) => m.features.includes(f));
    if (mod) requires[f] = mod.name;
  }
  const toggled = new Set(p.project.features.filter((t) => t.enabled).map((t) => t.feature));

  return (
    <>
      <ProjectSettingsForm
        ws={ws}
        tenant={tenant}
        projectId={p.projectId}
        canEdit={p.canEdit}
        canArchive={p.role === "ADMIN" || p.role === "MANAGER"}
        travel={[
          "INCENTIVE_TRIP",
          "TECHNICAL_IMMERSION",
          "SPORTS_EXPERIENCE",
          "CORPORATE_TRAVEL",
        ].includes(p.project.type)}
        status={p.project.status}
        bannerUrl={p.project.bannerFileId ? `/api/files/${p.project.bannerFileId}` : null}
        data={{
          name: p.project.name,
          code: p.project.code,
          description: p.project.description,
          startsAt: toDateInput(p.project.startsAt, tz),
          endsAt: toDateInput(p.project.endsAt, tz),
          timezone: tz,
          venueName: p.project.venueName,
          venueAddress: p.project.venueAddress,
          destination: p.project.destination,
        }}
        enabled={[...toggled]}
        available={[...p.available]}
        requires={requires}
        categories={categories.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
        groups={groups.map((g) => ({ id: g.id, name: g.name, color: g.color }))}
      />
      <div className="border-border mt-6 max-w-4xl border-t pt-6">
        <FormSection
          title="Ordenação das listas"
          description="Ordem dos relatórios, CSV, etiquetas, credenciais, check-in e vouchers deste projeto. Na hora de gerar ainda dá para trocar."
        >
          <SortingSettings
            tenant={tenant}
            projectId={p.projectId}
            {...sorting}
            canEdit={p.canEdit}
          />
        </FormSection>
      </div>
    </>
  );
}
