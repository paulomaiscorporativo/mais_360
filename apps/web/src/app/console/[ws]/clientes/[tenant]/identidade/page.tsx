import type { Metadata } from "next";
import { TENANT_FONT_NAMES, type TenantFontName } from "@/config/terms";
import { guard, requireTenant } from "@/server/auth";
import { BrandForm } from "./form";

export const metadata: Metadata = { title: "Identidade visual" };

export default async function BrandPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const ctx = await guard(requireTenant(slug));
  const b = ctx.tenant.branding;
  const font = (TENANT_FONT_NAMES as readonly string[]).includes(b?.fontFamily ?? "")
    ? (b!.fontFamily as TenantFontName)
    : "Instrument Sans";
  return (
    <BrandForm
      tenant={slug}
      name={ctx.tenant.name}
      canEdit={ctx.role === "ADMIN"}
      whiteLabel={ctx.workspace.whiteLabel}
      initial={{
        primaryColor: b?.primaryColor ?? "#002042",
        accentColor: b?.accentColor ?? "#a0bf27",
        fontFamily: font,
        showMaisBrand: b?.showMaisBrand ?? true,
      }}
    />
  );
}
