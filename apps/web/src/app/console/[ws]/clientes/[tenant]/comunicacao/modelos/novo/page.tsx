import type { Metadata } from "next";
import { TemplateEditorPage } from "../editor-page";

export const metadata: Metadata = { title: "Novo modelo" };

export default async function NewTemplatePage({
  params,
}: {
  params: Promise<{ ws: string; tenant: string }>;
}) {
  const { ws, tenant } = await params;
  return <TemplateEditorPage ws={ws} tenant={tenant} id={null} />;
}
