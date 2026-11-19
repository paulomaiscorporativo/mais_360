import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { guard, requireWorkspace } from "@/server/auth";
import { modulesForWorkspace } from "@/server/modules";
import { rootDomain } from "@/server/urls";
import { TenantWizard } from "./wizard";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NewTenantPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { workspace } = await guard(requireWorkspace(ws, "ADMIN"));
  const allowed = [...(await modulesForWorkspace(workspace.id))];

  return (
    <>
      <PageHeader
        title="Novo cliente"
        crumbs={[
          { label: "Clientes", href: `/console/${workspace.slug}` },
          { label: "Novo cliente" },
        ]}
      />
      <TenantWizard
        ws={workspace.slug}
        allowed={allowed}
        rootDomain={rootDomain()}
        whiteLabel={workspace.whiteLabel}
      />
    </>
  );
}
