/**
 * Dicionário de nomenclatura do cliente (TenantTerm). Cada cliente chama seus
 * membros e empresas como quiser — "Associado", "Colaborador", "Expositor".
 */
export const TERM_DEFS = [
  {
    key: "member.singular",
    label: "Membro (singular)",
    default: "Membro",
    examples: ["Associado", "Colaborador", "Cliente", "Revendedor"],
  },
  {
    key: "member.plural",
    label: "Membro (plural)",
    default: "Membros",
    examples: ["Associados", "Colaboradores", "Clientes", "Revendedores"],
  },
  {
    key: "org.singular",
    label: "Empresa do membro (singular)",
    default: "Empresa",
    examples: ["Frigorífico", "Distribuidora", "Filial", "Loja"],
  },
  {
    key: "org.plural",
    label: "Empresa do membro (plural)",
    default: "Empresas",
    examples: ["Frigoríficos", "Distribuidoras", "Filiais", "Lojas"],
  },
  {
    key: "project.event",
    label: "Evento",
    default: "Evento",
    examples: ["Convenção", "Feira", "Congresso", "Encontro"],
  },
  {
    key: "project.trip",
    label: "Viagem",
    default: "Viagem",
    examples: ["Viagem de incentivo", "Missão", "Imersão"],
  },
] as const;

export type TermKey = (typeof TERM_DEFS)[number]["key"];

export function termsWithDefaults(rows: { key: string; value: string }[]): Record<TermKey, string> {
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(TERM_DEFS.map((d) => [d.key, map[d.key] || d.default])) as Record<
    TermKey,
    string
  >;
}

export const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (UTC−3)" },
  { value: "America/Manaus", label: "Manaus (UTC−4)" },
  { value: "America/Cuiaba", label: "Cuiabá (UTC−4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (UTC−5)" },
  { value: "America/Noronha", label: "Fernando de Noronha (UTC−2)" },
  { value: "Europe/Lisbon", label: "Lisboa" },
  { value: "America/New_York", label: "Nova York" },
] as const;

/**
 * Subdomínios que nunca podem ser endereço de cliente (<slug>.mais.tur.br):
 * infraestrutura, console e rotas internas. Validado no assistente e no servidor.
 */
export const RESERVED_SLUGS = new Set([
  "360",
  "www",
  "app",
  "api",
  "admin",
  "console",
  "mail",
  "smtp",
  "webmail",
  "ftp",
  "cdn",
  "static",
  "assets",
  "status",
  "docs",
  "help",
  "suporte",
  "blog",
  "login",
  "auth",
  "kiosk",
  "totem",
  "dev",
  "staging",
  // rotas internas do app
  "plataforma",
  "novo",
  "t",
  "_host",
  "entrar",
]);

export const BRAND_PRESETS = [
  "#002042",
  "#123f6d",
  "#1690d0",
  "#0f766e",
  "#6ba63d",
  "#a0bf27",
  "#c2410c",
  "#b42a1f",
  "#7c3aed",
  "#1f2937",
];

/** Fontes que o cliente pode escolher (carregadas em app/fonts.ts). */
export const TENANT_FONT_NAMES = ["Instrument Sans", "Inter", "Rubik", "Manrope"] as const;
export type TenantFontName = (typeof TENANT_FONT_NAMES)[number];
