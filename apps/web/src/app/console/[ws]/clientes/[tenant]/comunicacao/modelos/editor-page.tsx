import { notFound } from "next/navigation";
import { TemplateEditor, type TemplateDraft } from "@/components/communication/template-editor";
import { guard } from "@/server/auth";
import { communicationBase, projectOptions, requireCommunication } from "@/server/communication";

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
  const [projects, emailChannel, row] = await Promise.all([
    projectOptions(ctx),
    ctx.db.messagingChannel.findFirst({
      where: { kind: "EMAIL", projectId: null, active: true },
      select: { fromName: true },
    }),
    id ? ctx.db.messageTemplate.findFirst({ where: { id, archivedAt: null } }) : null,
  ]);
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
    />
  );
}
