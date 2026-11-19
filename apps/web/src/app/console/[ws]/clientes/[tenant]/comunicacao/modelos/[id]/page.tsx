import type { Metadata } from "next";
import { TemplateEditorPage } from "../editor-page";

export const metadata: Metadata = { title: "Modelo de mensagem" };

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string; id: string }>;
}) {
  const { ws, tenant, id } = await params;
  return <TemplateEditorPage ws={ws} tenant={tenant} id={id} />;
}
