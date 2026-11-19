import { notFound } from "next/navigation";
import { enabledProjectFeatures } from "@mais/core";
import { TemplateEditor, type TemplateDraft } from "@/components/communication/template-editor";
import { guard } from "@/server/auth";
import { communicationBase, projectOptions, requireCommunication } from "@/server/communication";
import { modulesForTenant } from "@/server/modules";

/** Carrega o necessário para o editor (novo ou existente). */
export async function TemplateEditorPage({
  ws,
  tenant,
  id,
}: {
  ws: string;
  tenant: string;
  id: string | null;
}) {
  const ctx = await guard(requireCommunication(tenant));
  const [projects, emailChannel, row, modules, toggles] = await Promise.all([
    projectOptions(ctx),
    ctx.db.messagingChannel.findFirst({
      where: { kind: "EMAIL", projectId: null, active: true },
      select: { fromName: true },
    }),
    id ? ctx.db.messageTemplate.findFirst({ where: { id, archivedAt: null } }) : null,
    modulesForTenant(ctx.tenant),
    ctx.db.project.findMany({
      where: { archivedAt: null },
      select: { id: true, features: true },
      take: 200,
    }),
  ]);
  // Recursos ligados por projeto: o editor esconde variáveis sem dado (ex.: {{mesa}} sem mapa de mesas)
  const fieldScope = {
    modules: [...modules],
    projects: Object.fromEntries(
      toggles.map((p) => [p.id, [...enabledProjectFeatures(p.features, modules)]]),
    ),
  };
  if (id && !row) notFound();
  const initial: TemplateDraft | null = row
    ? {
        id: row.id,
        projectId: row.projectId,
        purpose: row.purpose,
        name: row.name,
        emailSubject: row.emailSubject,
        emailBody: row.emailBody,
        whatsappBody: row.whatsappBody,
        includeActions: row.includeActions,
      }
    : null;
  return (
    <TemplateEditor
      key={row?.id ?? "new"}
      tenant={tenant}
      base={communicationBase(ws, tenant)}
      initial={initial}
      projects={projects}
      fromLabel={emailChannel?.fromName || ctx.tenant.name}
      defaultTestEmail={ctx.viewer.user.email}
      canEdit={["ADMIN", "MANAGER"].includes(ctx.role)}
      fieldScope={fieldScope}
    />
  );
}
