import { z } from "zod";
import type { ProjectFeature } from "../modules/catalog";

/**
 * Modelos de projeto por tipologia (BLUEPRINT, seção 5). Cada modelo pré-liga
 * os recursos típicos; o que o cliente não contratou é descartado na criação
 * (ver enabledProjectFeatures em @mais/core/modules).
 */

export const PROJECT_TYPES = [
  "INCENTIVE_TRIP",
  "CORPORATE_EVENT",
  "TRADE_SHOW",
  "TECHNICAL_IMMERSION",
  "SPORTS_EXPERIENCE",
  "CORPORATE_TRAVEL",
  "INCENTIVE_CAMPAIGN",
  "OTHER",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_STATUSES = [
  "PLANNING",
  "REGISTRATION_OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "ARCHIVED",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Planejamento",
  REGISTRATION_OPEN: "Inscrições abertas",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluído",
  ARCHIVED: "Arquivado",
};

export type ProjectTemplate = {
  type: ProjectType;
  name: string;
  summary: string;
  features: readonly ProjectFeature[];
  /** Categorias de inscrição sugeridas (nome, cor). */
  categories: readonly { name: string; color: string }[];
};

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    type: "INCENTIVE_TRIP",
    name: "Viagem de incentivo",
    summary: "Grupo premiado: aéreo, hotel, roteiro, mural e portal do viajante.",
    features: [
      "REGISTRATION_FORM",
      "FLIGHTS",
      "ACCOMMODATION",
      "ITINERARY",
      "CHECKLIST",
      "MURAL",
      "SUPPORT",
      "DOCUMENTS",
      "VOUCHERS",
    ],
    categories: [
      { name: "Premiado", color: "#0f766e" },
      { name: "Acompanhante", color: "#64748b" },
      { name: "Staff", color: "#334155" },
    ],
  },
  {
    type: "CORPORATE_EVENT",
    name: "Evento corporativo",
    summary: "Convenção, jantar ou lançamento: convites, mesas e credenciamento.",
    features: ["REGISTRATION_FORM", "INVITES", "TABLES", "ACCREDITATION", "DOCUMENTS"],
    categories: [
      { name: "Convidado", color: "#1d4ed8" },
      { name: "Palestrante", color: "#b45309" },
      { name: "Imprensa", color: "#7c3aed" },
      { name: "Organização", color: "#334155" },
    ],
  },
  {
    type: "TRADE_SHOW",
    name: "Feira de negócios",
    summary: "Stands e patrocínio, inscrição de visitantes, credenciamento e acesso.",
    features: [
      "REGISTRATION_FORM",
      "STANDS",
      "ACCREDITATION",
      "SELF_SERVICE",
      "ACCESS_CONTROL",
      "NETWORKING",
      "DOCUMENTS",
    ],
    categories: [
      { name: "Visitante", color: "#0369a1" },
      { name: "Expositor", color: "#65a30d" },
      { name: "Palestrante", color: "#b45309" },
      { name: "Imprensa", color: "#7c3aed" },
      { name: "Organização", color: "#334155" },
    ],
  },
  {
    type: "TECHNICAL_IMMERSION",
    name: "Imersão técnica",
    summary: "Missão internacional: viagem, agenda de visitas e documentos.",
    features: [
      "REGISTRATION_FORM",
      "FLIGHTS",
      "ACCOMMODATION",
      "ITINERARY",
      "CHECKLIST",
      "SUPPORT",
      "DOCUMENTS",
      "VOUCHERS",
    ],
    categories: [
      { name: "Executivo", color: "#0f766e" },
      { name: "Staff", color: "#334155" },
    ],
  },
  {
    type: "SPORTS_EXPERIENCE",
    name: "Experiência esportiva",
    summary: "Hospitalidade em grandes eventos esportivos: viagem, ingressos e roteiro.",
    features: [
      "REGISTRATION_FORM",
      "FLIGHTS",
      "ACCOMMODATION",
      "ITINERARY",
      "MURAL",
      "SUPPORT",
      "VOUCHERS",
    ],
    categories: [
      { name: "Convidado", color: "#b91c1c" },
      { name: "Anfitrião", color: "#334155" },
    ],
  },
  {
    type: "CORPORATE_TRAVEL",
    name: "Viagem corporativa",
    summary: "Deslocamento de equipe: aéreo, hotel e documentos de viagem.",
    features: ["FLIGHTS", "ACCOMMODATION", "DOCUMENTS", "VOUCHERS"],
    categories: [{ name: "Colaborador", color: "#0369a1" }],
  },
  {
    type: "INCENTIVE_CAMPAIGN",
    name: "Campanha de incentivo",
    summary: "Metas e premiação; a viagem do grupo vencedor vira outro projeto.",
    features: ["REGISTRATION_FORM"],
    categories: [{ name: "Participante", color: "#0f766e" }],
  },
  {
    type: "OTHER",
    name: "Em branco",
    summary: "Comece sem recursos ligados e escolha um a um.",
    features: [],
    categories: [],
  },
];

export function projectTemplate(type: ProjectType): ProjectTemplate {
  return (
    PROJECT_TEMPLATES.find((t) => t.type === type) ??
    PROJECT_TEMPLATES[PROJECT_TEMPLATES.length - 1]!
  );
}

export const PROJECT_FEATURE_LABELS: Record<ProjectFeature, { label: string; summary: string }> = {
  REGISTRATION_FORM: {
    label: "Formulário de inscrição",
    summary: "Link público com a marca do cliente.",
  },
  INVITES: {
    label: "Convites e cotas",
    summary: "Empresas com cota, convite digital com QR e RSVP.",
  },
  TABLES: { label: "Mapa de mesas", summary: "Salão com mesas e lugares marcados." },
  ACCREDITATION: { label: "Credenciamento", summary: "Balcão, etiquetas, crachás e check-in." },
  SELF_SERVICE: { label: "Autoatendimento", summary: "Totem de autocredenciamento com impressão." },
  FACE_RECOGNITION: {
    label: "Reconhecimento facial",
    summary: "Identificação no totem (com consentimento).",
  },
  ACCESS_CONTROL: {
    label: "Controle de acesso",
    summary: "Entrada e saída por área, até offline.",
  },
  NETWORKING: { label: "Networking", summary: "Troca de contatos lendo o crachá." },
  FLIGHTS: { label: "Voos", summary: "Trechos, localizadores e status ao vivo." },
  ACCOMMODATION: { label: "Hospedagem", summary: "Hotéis, quartos e rooming list." },
  ITINERARY: { label: "Roteiro", summary: "Programação dia a dia." },
  CHECKLIST: { label: "Checklist", summary: "Tarefas operacionais com responsáveis." },
  MURAL: { label: "Mural", summary: "Recados segmentados aos participantes." },
  SUPPORT: { label: "Suporte", summary: "Chamados do participante com a equipe." },
  DOCUMENTS: { label: "Documentos", summary: "Arquivos gerais e individuais." },
  VOUCHERS: { label: "Vouchers", summary: "Vouchers gerados pelo motor de documentos." },
  STANDS: { label: "Stands", summary: "Planta, cotas, reservas e contratos." },
};

/**
 * Project.settings (Json) — validado aqui; cada módulo da Onda 2 pode acrescentar
 * a própria chave (ex.: settings.invites), sempre com default.
 */
export const projectSettingsSchema = z
  .object({
    form: z
      .object({
        open: z.boolean().default(true),
        welcome: z.string().max(2000).default(""),
        askCpf: z.boolean().default(true),
        requireCpf: z.boolean().default(false),
        askCompany: z.boolean().default(true),
        askJobTitle: z.boolean().default(true),
        askCity: z.boolean().default(false),
        /** Categoria atribuída a quem se inscreve pelo link público (id). */
        defaultCategoryId: z.string().nullable().default(null),
        /** "Autorizo compartilhar meus contatos" (networking). */
        askContactSharing: z.boolean().default(false),
        successMessage: z.string().max(1000).default(""),
      })
      .default({
        open: true,
        welcome: "",
        askCpf: true,
        requireCpf: false,
        askCompany: true,
        askJobTitle: true,
        askCity: false,
        defaultCategoryId: null,
        askContactSharing: false,
        successMessage: "",
      }),
  })
  .passthrough();

export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

/** Lê settings com defaults, tolerando Json antigo ou inválido. */
export function readProjectSettings(raw: unknown): ProjectSettings {
  const r = projectSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : projectSettingsSchema.parse({});
}

export const RESERVED_PROJECT_SLUGS = new Set(["novo", "new", "editar", "configuracoes"]);
