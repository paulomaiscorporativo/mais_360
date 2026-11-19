import "server-only";
import { buildBrandTheme, themeCss } from "@mais/core";
import { PRODUCT } from "@/config/product";

type BrandSource = {
  name: string;
  branding?: {
    primaryColor: string;
    fontFamily: string;
    showMaisBrand: boolean;
    logoFileId: string | null;
  } | null;
  workspace?: { whiteLabel: boolean; name: string } | null;
};

/**
 * Marca aplicada numa tela do cliente. Com white-label no assinante (ou o
 * cliente desligando a assinatura), o nome do produto não aparece.
 */
export function resolveBrand(tenant: BrandSource | null) {
  const color = tenant?.branding?.primaryColor ?? PRODUCT.brandColor;
  const theme = buildBrandTheme(color);
  const whiteLabel =
    !!tenant && (tenant.workspace?.whiteLabel || tenant.branding?.showMaisBrand === false);
  return {
    name: tenant?.name ?? PRODUCT.name,
    productName: whiteLabel ? null : PRODUCT.name,
    fontFamily: tenant?.branding?.fontFamily ?? "Instrument Sans",
    logoFileId: tenant?.branding?.logoFileId ?? null,
    theme,
    css: themeCss(theme),
    scopedCss: (selector: string) => themeCss(theme, selector),
  };
}
