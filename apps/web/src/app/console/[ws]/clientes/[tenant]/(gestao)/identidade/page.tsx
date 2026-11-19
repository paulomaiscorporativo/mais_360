import type { Metadata } from "next";
import { TENANT_FONT_NAMES, type TenantFontName } from "@/config/terms";
import { guard, requireTenant } from "@/server/auth";
import { FormSection } from "@/components/ui";
import { BrandForm } from "./form";
import { ImageUpload } from "./image-upload";

export const metadata: Metadata = { title: "Identidade visual" };

export default async function BrandPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const ctx = await guard(requireTenant(slug));
  const b = ctx.tenant.branding;
  const font = (TENANT_FONT_NAMES as readonly string[]).includes(b?.fontFamily ?? "")
    ? (b!.fontFamily as TenantFontName)
    : "Instrument Sans";
  const canEdit = ctx.role === "ADMIN";
  const file = (id: string | null | undefined) => (id ? `/api/files/${id}` : null);
  return (
    <>
      <FormSection
        title="Logotipos"
        description="Aparecem no portal, no formulário de inscrição, nos e-mails e nos crachás. Use PNG com fundo transparente."
        className="mb-8"
      >
        <ImageUpload
          tenant={slug}
          target="logo"
          label="Logo principal"
          hint="Para fundos claros. Até 5 MB."
          current={file(b?.logoFileId)}
          disabled={!canEdit}
        />
        <ImageUpload
          tenant={slug}
          target="logoDark"
          label="Logo para fundo escuro"
          hint="Versão clara, usada sobre a cor da marca."
          current={file(b?.logoDarkFileId)}
          dark
          disabled={!canEdit}
        />
      </FormSection>
      <BrandForm
        tenant={slug}
        name={ctx.tenant.name}
        canEdit={canEdit}
        whiteLabel={ctx.workspace.whiteLabel}
        initial={{
          primaryColor: b?.primaryColor ?? "#002042",
          accentColor: b?.accentColor ?? "#a0bf27",
          fontFamily: font,
          showMaisBrand: b?.showMaisBrand ?? true,
        }}
      />
    </>
  );
}
