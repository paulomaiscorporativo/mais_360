/**
 * Identidade do produto. Fonte ÚNICA do nome comercial — trocar aqui troca em
 * console, login, títulos, e-mails do sistema e seed.
 *
 * Em clientes/assinantes com white-label, a marca do produto não aparece:
 * entra a do cliente (ver `resolveBrand` em src/server/brand.ts).
 */
export const PRODUCT = {
  name: "Plataforma Mais",
  tagline: "Gestão de viagens e eventos corporativos.",
  byline: "por Mais Corporativo",
  supportEmail: "suporte@maiscorporativo.tur.br",
  /** Cor institucional do produto (usada quando não há cliente no contexto). */
  brandColor: "#002042",
} as const;

export type Product = typeof PRODUCT;
