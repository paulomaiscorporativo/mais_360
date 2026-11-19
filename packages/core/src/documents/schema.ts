import { z } from "zod";

/**
 * Modelo de documento ÚNICO da plataforma.
 *
 * Unifica o voucher da ABIEC (seções automáticas + PDF de fundo com campos
 * posicionados) e a etiqueta do credenciamento (layout em mm para impressora
 * térmica), cobrindo também crachás completos, certificados e listas.
 *
 * Unidades: posições e tamanhos em milímetros, a partir do canto superior
 * esquerdo da área FINAL (sem sangria). Fontes em pontos tipográficos (pt).
 */

export const DOCUMENT_KINDS = [
  "VOUCHER",
  "BADGE",
  "LABEL",
  "CERTIFICATE",
  "CONTRACT",
  "ROOMING_LIST",
  "OTHER",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Família tipográfica lógica; o renderizador decide qual arquivo de fonte usar. */
export const FONT_FAMILIES = ["sans", "serif", "mono"] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];
export const FONT_WEIGHTS = ["regular", "semibold", "bold"] as const;
export type FontWeight = (typeof FONT_WEIGHTS)[number];

/**
 * Cor: hexadecimal (#RRGGBB) ou referência ao tema/dados, resolvida no momento
 * da renderização. Os "on*" escolhem preto ou branco com o melhor contraste.
 */
export const COLOR_TOKENS = [
  "ink",
  "muted",
  "subtle",
  "line",
  "white",
  "black",
  "brand",
  "brandSecondary",
  "accent",
  "category",
  "onBrand",
  "onCategory",
  "onAccent",
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use #RRGGBB).");
export const colorSchema = z.union([hex, z.enum(COLOR_TOKENS)]);
export type ColorValue = z.infer<typeof colorSchema>;

const mm = z.number().finite();
const positiveMm = z.number().finite().positive();

/** Exibe o elemento só para certas categorias/papéis (ex.: faixa "EXPOSITOR"). */
export const conditionSchema = z
  .object({
    categories: z.array(z.string()).default([]),
    roles: z.array(z.string()).default([]),
    /** Campo que precisa ter valor para o elemento aparecer (ex.: "hotel.name"). */
    requiresField: z.string().optional(),
    /** Campo que precisa estar VAZIO (ex.: nome do evento só quando não há logo). */
    unlessField: z.string().optional(),
  })
  .partial();
export type ElementCondition = z.infer<typeof conditionSchema>;

const baseElement = {
  id: z.string().min(1),
  /** Nome amigável no editor ("Nome", "Faixa da categoria"). */
  label: z.string().default(""),
  x: mm,
  y: mm,
  /** Índice da página do documento (multipágina com PDF de fundo). */
  page: z.number().int().min(0).default(0),
  hidden: z.boolean().default(false),
  /** Repete em todas as páginas criadas por transbordo das seções automáticas. */
  repeat: z.boolean().default(false),
  when: conditionSchema.optional(),
  /** Rotação do elemento em graus (texto vertical em faixas laterais). */
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
};

export const textStyleSchema = z.object({
  font: z.enum(FONT_FAMILIES).default("sans"),
  weight: z.enum(FONT_WEIGHTS).default("regular"),
  size: z.number().positive().max(400).default(10),
  /** Menor tamanho aceito pelo ajuste automático. */
  minSize: z.number().positive().default(5),
  autoFit: z.boolean().default(true),
  maxLines: z.number().int().min(1).max(50).default(1),
  lineHeight: z.number().min(0.8).max(3).default(1.15),
  align: z.enum(["left", "center", "right"]).default("left"),
  valign: z.enum(["top", "middle", "bottom"]).default("middle"),
  color: colorSchema.default("ink"),
  uppercase: z.boolean().default(false),
  /** Espaçamento entre letras em pt (positivo abre, negativo fecha). */
  letterSpacing: z.number().min(-2).max(10).default(0),
  /** Fundo da caixa de texto (faixas, tarjas invertidas). */
  background: colorSchema.optional(),
  radius: z.number().min(0).default(0),
  padding: z.number().min(0).default(0),
});
export type TextStyle = z.infer<typeof textStyleSchema>;

export const textElementSchema = z.object({
  ...baseElement,
  type: z.literal("text"),
  w: positiveMm,
  h: positiveMm,
  /** Texto fixo; aceita campos no formato {{person.firstName}}. */
  text: z.string(),
  style: textStyleSchema.default(textStyleSchema.parse({})),
});

export const fieldElementSchema = z.object({
  ...baseElement,
  type: z.literal("field"),
  w: positiveMm,
  h: positiveMm,
  /** Chave do catálogo de campos (FIELD_CATALOG). */
  field: z.string().min(1),
  /** Texto usado quando o campo está vazio. */
  fallback: z.string().default(""),
  prefix: z.string().default(""),
  suffix: z.string().default(""),
  style: textStyleSchema.default(textStyleSchema.parse({})),
});

export const qrElementSchema = z.object({
  ...baseElement,
  type: z.literal("qrcode"),
  size: positiveMm,
  /** Campo cujo valor vai no QR (padrão: link público da inscrição). */
  field: z.string().default("registration.qrValue"),
  errorCorrection: z.enum(["L", "M", "Q", "H"]).default("M"),
  color: colorSchema.default("black"),
  /** Margem branca (em módulos) ao redor do código. */
  quietZone: z.number().int().min(0).max(8).default(0),
});

export const barcodeElementSchema = z.object({
  ...baseElement,
  type: z.literal("barcode"),
  w: positiveMm,
  h: positiveMm,
  field: z.string().default("registration.shortCode"),
  showText: z.boolean().default(false),
  color: colorSchema.default("black"),
});

export const imageSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("file"), fileId: z.string().min(1) }),
  /** Imagem vinda dos dados: tenant.logo, project.logo, person.photo. */
  z.object({ kind: z.literal("field"), field: z.string().min(1) }),
]);

export const imageElementSchema = z.object({
  ...baseElement,
  type: z.literal("image"),
  w: positiveMm,
  h: positiveMm,
  source: imageSourceSchema,
  fit: z.enum(["contain", "cover"]).default("contain"),
  align: z.enum(["left", "center", "right"]).default("center"),
  /** Recorte circular (foto do participante). */
  circle: z.boolean().default(false),
});

export const boxElementSchema = z.object({
  ...baseElement,
  type: z.literal("box"),
  w: positiveMm,
  h: positiveMm,
  fill: colorSchema.optional(),
  stroke: colorSchema.optional(),
  strokeWidth: z.number().min(0).default(0.3),
  radius: z.number().min(0).default(0),
  opacity: z.number().min(0).max(1).default(1),
});

export const VOUCHER_SECTION_KEYS = [
  "passenger",
  "flights",
  "accommodation",
  "itinerary",
  "emergency",
  "freeText",
] as const;
export type VoucherSectionKey = (typeof VOUCHER_SECTION_KEYS)[number];

export const voucherSectionSchema = z.object({
  key: z.enum(VOUCHER_SECTION_KEYS),
  title: z.string().optional(),
  /** Conteúdo do bloco de texto livre (aceita {{campos}}). */
  content: z.string().optional(),
});
export type VoucherSection = z.infer<typeof voucherSectionSchema>;

/**
 * Região onde as seções automáticas do voucher fluem. Se o conteúdo não couber,
 * novas páginas são criadas com os elementos marcados `repeat: true`.
 */
export const sectionsElementSchema = z.object({
  ...baseElement,
  type: z.literal("sections"),
  w: positiveMm,
  h: positiveMm,
  sections: z.array(voucherSectionSchema).min(1),
  accent: colorSchema.default("brand"),
  /** Topo da região nas páginas de continuação (padrão: o mesmo `y`). */
  continuationY: mm.optional(),
  continuationH: positiveMm.optional(),
});

export const elementSchema = z.discriminatedUnion("type", [
  textElementSchema,
  fieldElementSchema,
  qrElementSchema,
  barcodeElementSchema,
  imageElementSchema,
  boxElementSchema,
  sectionsElementSchema,
]);
export type DocumentElement = z.infer<typeof elementSchema>;
export type ElementType = DocumentElement["type"];
export type TextElement = z.infer<typeof textElementSchema>;
export type FieldElement = z.infer<typeof fieldElementSchema>;
export type QrElement = z.infer<typeof qrElementSchema>;
export type BarcodeElement = z.infer<typeof barcodeElementSchema>;
export type ImageElement = z.infer<typeof imageElementSchema>;
export type BoxElement = z.infer<typeof boxElementSchema>;
export type SectionsElement = z.infer<typeof sectionsElementSchema>;

/** Furo de cordão/presilha: área proibida para conteúdo. */
export const holeSchema = z.object({
  x: mm, // centro
  y: mm,
  diameter: positiveMm,
  shape: z.enum(["circle", "slot"]).default("circle"),
  /** Largura do furo oblongo (slot). */
  width: positiveMm.optional(),
});
export type Hole = z.infer<typeof holeSchema>;

export const backgroundSchema = z.object({
  kind: z.enum(["pdf", "image"]),
  fileId: z.string().min(1),
  /** No PDF de fundo: cada página do arquivo vira uma página do documento. */
  allPages: z.boolean().default(true),
  /** Página do fundo usada nas páginas de continuação (transbordo). null = sem fundo. */
  continuationPage: z.number().int().min(0).nullable().default(null),
});

export const pageSchema = z.object({
  /** Tamanho FINAL (corte), em mm. */
  width: positiveMm,
  height: positiveMm,
  /** Sangria para gráficas (estende fundo e elementos encostados na borda). */
  bleed: z.number().min(0).max(10).default(0),
  /** Margem de segurança: área livre de informação junto ao corte. */
  safeMargin: z.number().min(0).max(30).default(0),
  holes: z.array(holeSchema).default([]),
  /** Rotação na impressão: para impressoras que alimentam a etiqueta "deitada". */
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  /** Ajuste fino de posicionamento da impressora, em mm. */
  offsetX: z.number().min(-20).max(20).default(0),
  offsetY: z.number().min(-20).max(20).default(0),
  background: backgroundSchema.optional(),
  /** Cor de fundo da página (quando não há arte). */
  fill: colorSchema.optional(),
});
export type PageSetup = z.infer<typeof pageSchema>;

export const documentDefinitionSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  kind: z.enum(DOCUMENT_KINDS),
  page: pageSchema,
  elements: z.array(elementSchema).default([]),
  /** Saída preferida: térmica (HTML em mm) ou PDF. */
  output: z.enum(["pdf", "thermal"]).default("pdf"),
  /** Monocromático: força preto/branco (impressoras térmicas). */
  monochrome: z.boolean().default(false),
  /** Nome do arquivo gerado; aceita {{campos}}. */
  fileName: z.string().default("documento"),
});

/** Definição validada e com padrões aplicados (o que o renderizador recebe). */
export type DocumentDefinition = z.output<typeof documentDefinitionSchema>;
/** Definição como o editor/autor escreve (padrões opcionais). */
export type DocumentDefinitionInput = z.input<typeof documentDefinitionSchema>;

export function parseDefinition(input: unknown): DocumentDefinition {
  return documentDefinitionSchema.parse(input);
}

export function safeParseDefinition(input: unknown) {
  return documentDefinitionSchema.safeParse(input);
}
