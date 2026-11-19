import type { TenantFontName } from "@/config/terms";
import {
  Geist_Mono,
  Inter,
  Instrument_Sans,
  Instrument_Serif,
  Manrope,
  Rubik,
} from "next/font/google";

/** Fonte da interface (DESIGN.md). */
export const fontUi = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

/** Display editorial — só na Experiência e em títulos de capa. */
export const fontDisplay = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display-serif",
  display: "swap",
});

/** Códigos: código curto, localizador, protocolo. */
export const fontCode = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-code",
  display: "swap",
});

// Fontes que o cliente pode escolher na identidade visual. Sem preload: só
// baixam quando a página de um cliente que as usa é aberta.
const rubik = Rubik({
  subsets: ["latin"],
  variable: "--font-rubik",
  display: "swap",
  preload: false,
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  preload: false,
});

export const TENANT_FONTS: Record<TenantFontName, { cssVar: string; className: string }> = {
  "Instrument Sans": { cssVar: "--font-ui", className: "" },
  Inter: { cssVar: "--font-inter", className: inter.variable },
  Rubik: { cssVar: "--font-rubik", className: rubik.variable },
  Manrope: { cssVar: "--font-manrope", className: manrope.variable },
};

export function tenantFont(name: string | null | undefined) {
  return TENANT_FONTS[(name ?? "") as TenantFontName] ?? TENANT_FONTS["Instrument Sans"];
}

export const rootFontClasses = [fontUi.variable, fontDisplay.variable, fontCode.variable].join(" ");
