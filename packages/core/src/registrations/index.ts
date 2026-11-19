import { foldText } from "../people";

/**
 * Regras puras das inscrições: códigos públicos e importação de planilhas.
 * A aleatoriedade é injetada (o core não depende de node:crypto).
 */

export type RandomInt = (maxExclusive: number) => number;

/**
 * Código curto de 6 dígitos, único no projeto — digitável na recepção e no totem.
 * Com o espaço quase cheio (improvável), passa para 8 dígitos.
 */
export function makeShortCode(randomInt: RandomInt, isTaken: (code: string) => boolean): string {
  for (let i = 0; i < 60; i++) {
    const c = String(randomInt(1_000_000)).padStart(6, "0");
    if (!isTaken(c)) return c;
  }
  for (;;) {
    const c = String(randomInt(100_000_000)).padStart(8, "0");
    if (!isTaken(c)) return c;
  }
}

const TOKEN_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Segredo dos links públicos (/c/<token>): 22 caracteres ≈ 128 bits. */
export function makeToken(randomInt: RandomInt, length = 22): string {
  let out = "";
  for (let i = 0; i < length; i++) out += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  return out;
}

// ---------------------------------------------------------------------------
// Importação de planilha — mapeamento automático de colunas
// ---------------------------------------------------------------------------

export const IMPORT_FIELDS = [
  {
    key: "fullName",
    label: "Nome completo",
    guess: ["nome completo", "full name", "participante"],
  },
  { key: "firstName", label: "Nome", guess: ["nome", "primeiro nome", "first name", "name"] },
  {
    key: "lastName",
    label: "Sobrenome",
    guess: ["sobrenome", "last name", "ultimo nome", "surname"],
  },
  {
    key: "badgeName",
    label: "Nome no crachá",
    guess: ["nome no cracha", "nome cracha", "cracha", "badge"],
  },
  { key: "email", label: "E-mail", guess: ["e-mail", "email", "mail", "correio"] },
  {
    key: "phone",
    label: "WhatsApp / telefone",
    guess: ["whatsapp", "celular", "telefone", "fone", "phone", "mobile"],
  },
  { key: "cpf", label: "CPF", guess: ["cpf", "documento"] },
  {
    key: "organization",
    label: "Empresa",
    guess: ["empresa", "company", "organizacao", "instituicao", "razao social"],
  },
  {
    key: "jobTitle",
    label: "Cargo",
    guess: ["cargo", "funcao", "job title", "titulo", "position"],
  },
  { key: "city", label: "Cidade", guess: ["cidade", "city", "municipio"] },
  { key: "state", label: "UF", guess: ["uf", "estado", "state"] },
  {
    key: "category",
    label: "Categoria",
    guess: ["categoria", "tipo de inscricao", "perfil", "category", "tipo"],
  },
  { key: "group", label: "Grupo", guess: ["grupo", "turma", "onibus", "cor", "group"] },
  {
    key: "consent",
    label: "Autoriza compartilhar contato",
    guess: ["autorizo", "consentimento", "compartilhamento", "lgpd"],
  },
  {
    key: "externalId",
    label: "ID da inscrição",
    guess: ["id", "id inscricao", "inscricao", "codigo", "registration id"],
  },
  {
    key: "notes",
    label: "Observações",
    guess: ["observacoes", "observacao", "obs", "notas", "notes"],
  },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export type ColumnMapping = Partial<Record<ImportFieldKey, number>>;

/**
 * Sugere o mapeamento coluna → campo pelo cabeçalho. Primeiro casamentos exatos,
 * depois "contém". Uma coluna só vai para um campo; "nome" não captura "sobrenome".
 */
export function guessColumnMapping(headers: readonly string[]): ColumnMapping {
  const norm = headers.map((h) =>
    foldText(h)
      .replace(/[_*:.]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  const used = new Set<number>();
  const mapping: ColumnMapping = {};

  const assign = (key: ImportFieldKey, test: (h: string, g: string) => boolean) => {
    if (mapping[key] !== undefined) return;
    const field = IMPORT_FIELDS.find((f) => f.key === key)!;
    for (const g of field.guess) {
      const idx = norm.findIndex((h, i) => !used.has(i) && h !== "" && test(h, g));
      if (idx >= 0) {
        mapping[key] = idx;
        used.add(idx);
        return;
      }
    }
  };

  for (const f of IMPORT_FIELDS) assign(f.key, (h, g) => h === g);
  for (const f of IMPORT_FIELDS) {
    assign(f.key, (h, g) => {
      if (g.length < 3) return false;
      if (f.key === "firstName" && h.includes("sobrenome")) return false;
      if (f.key === "firstName" && (h.includes("cracha") || h.includes("completo"))) return false;
      return h.includes(g);
    });
  }
  // Uma só coluna "Nome" com nome e sobrenome juntos → trata como nome completo
  if (
    mapping.firstName !== undefined &&
    mapping.lastName === undefined &&
    mapping.fullName === undefined
  ) {
    mapping.fullName = mapping.firstName;
    delete mapping.firstName;
  }
  return mapping;
}

export type ImportRow = Partial<Record<ImportFieldKey, string>>;

/** Aplica o mapeamento a uma linha crua da planilha. */
export function applyMapping(row: readonly unknown[], mapping: ColumnMapping): ImportRow {
  const out: ImportRow = {};
  for (const [key, idx] of Object.entries(mapping) as [ImportFieldKey, number][]) {
    const v = row[idx];
    const s = v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim();
    if (s) out[key] = s;
  }
  return out;
}

export function rowHasName(r: ImportRow): boolean {
  return !!(r.fullName || r.firstName || r.lastName);
}
