/**
 * Catálogo de módulos contratáveis.
 *
 * Os identificadores espelham o enum `ModuleKey` do Prisma (@mais/db). O pacote
 * core não depende do banco: o teste `catalog.test.ts` garante que as listas
 * continuem iguais.
 */

export const MODULE_KEYS = [
  "COMMUNICATION",
  "CORPORATE_TRAVEL",
  "GROUP_TRAVEL",
  "EVENTS_INVITES",
  "ACCREDITATION",
  "SELF_SERVICE_KIOSK",
  "DOCUMENTS",
  "EXHIBITIONS",
  "INCENTIVE_GAMIFICATION",
  "FINANCE",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const PROJECT_FEATURES = [
  "REGISTRATION_FORM",
  "INVITES",
  "TABLES",
  "ACCREDITATION",
  "SELF_SERVICE",
  "FACE_RECOGNITION",
  "ACCESS_CONTROL",
  "NETWORKING",
  "FLIGHTS",
  "ACCOMMODATION",
  "ITINERARY",
  "CHECKLIST",
  "MURAL",
  "SUPPORT",
  "DOCUMENTS",
  "VOUCHERS",
  "STANDS",
] as const;

export type ProjectFeature = (typeof PROJECT_FEATURES)[number];

export type ModuleDefinition = {
  key: ModuleKey;
  name: string;
  summary: string;
  /** Módulos que precisam estar ativos para este funcionar. */
  requires: readonly ModuleKey[];
  /** Recursos de projeto que este módulo libera. */
  features: readonly ProjectFeature[];
};

export const MODULES: Readonly<Record<ModuleKey, ModuleDefinition>> = {
  COMMUNICATION: {
    key: "COMMUNICATION",
    name: "Comunicação",
    summary: "Mensagens personalizadas, réguas automáticas e disparos por e-mail e WhatsApp.",
    requires: [],
    features: [],
  },
  DOCUMENTS: {
    key: "DOCUMENTS",
    name: "Vouchers e documentos",
    summary: "Editor visual de vouchers, crachás, etiquetas, certificados e contratos.",
    requires: [],
    features: ["DOCUMENTS", "VOUCHERS"],
  },
  CORPORATE_TRAVEL: {
    key: "CORPORATE_TRAVEL",
    name: "Viagens corporativas",
    summary: "Solicitações, cotações, política de viagens, aprovações e centros de custo.",
    requires: ["COMMUNICATION"],
    features: [],
  },
  GROUP_TRAVEL: {
    key: "GROUP_TRAVEL",
    name: "Viagens de incentivo e grupos",
    summary: "Passageiros, voos, hospedagem, roteiro, checklist, mural e portal do viajante.",
    requires: ["COMMUNICATION", "DOCUMENTS"],
    features: [
      "REGISTRATION_FORM",
      "FLIGHTS",
      "ACCOMMODATION",
      "ITINERARY",
      "CHECKLIST",
      "MURAL",
      "SUPPORT",
    ],
  },
  EVENTS_INVITES: {
    key: "EVENTS_INVITES",
    name: "Eventos e convites",
    summary:
      "Empresas com cota, convites digitais com QR, confirmação de presença e mapa de mesas.",
    requires: ["COMMUNICATION"],
    features: ["REGISTRATION_FORM", "INVITES", "TABLES"],
  },
  ACCREDITATION: {
    key: "ACCREDITATION",
    name: "Credenciamento e acesso",
    summary: "Inscrições, balcão, etiquetas e crachás, controle de acesso por área e networking.",
    requires: ["COMMUNICATION", "DOCUMENTS"],
    features: ["REGISTRATION_FORM", "ACCREDITATION", "ACCESS_CONTROL", "NETWORKING"],
  },
  SELF_SERVICE_KIOSK: {
    key: "SELF_SERVICE_KIOSK",
    name: "Autoatendimento e reconhecimento facial",
    summary: "Totens de autocredenciamento com leitura facial, QR ou login e impressão automática.",
    requires: ["ACCREDITATION"],
    features: ["SELF_SERVICE", "FACE_RECOGNITION"],
  },
  EXHIBITIONS: {
    key: "EXHIBITIONS",
    name: "Feiras, stands e patrocínio",
    summary: "Mapa de stands, cotas, reservas, propostas, contratos e assinatura eletrônica.",
    requires: ["COMMUNICATION", "DOCUMENTS"],
    features: ["STANDS"],
  },
  INCENTIVE_GAMIFICATION: {
    key: "INCENTIVE_GAMIFICATION",
    name: "Incentivo e gamificação",
    summary: "Campanhas de metas, moedas, ranking e resgate em experiências.",
    requires: ["COMMUNICATION"],
    features: [],
  },
  FINANCE: {
    key: "FINANCE",
    name: "Financeiro",
    summary: "Custo, venda e fee por serviço, faturamento e contas a pagar.",
    requires: [],
    features: [],
  },
};
