import type { DocFlight, DocumentData } from "./data";
import {
  ROLE_LABELS,
  formatCpf,
  formatDate,
  formatDateTime,
  formatPeriod,
  formatPhone,
  formatTime,
} from "./format";

/**
 * Catálogo de campos dinâmicos dos documentos. O editor visual lista estes
 * campos (filtrados pelo contexto do tipo de documento) e o renderizador usa
 * `resolveField` para obter o texto final.
 */

export type FieldContext = "registration" | "traveler" | "project";

export type FieldGroup =
  "Pessoa" | "Inscrição" | "Empresa" | "Projeto" | "Cliente" | "Hospedagem" | "Voos" | "Emissão";

export type FieldDefinition = {
  key: string;
  label: string;
  group: FieldGroup;
  contexts: readonly FieldContext[];
  /** Valor de exemplo para a pré-visualização do editor. */
  sample: string;
  /** true = devolve id de arquivo (imagem), não texto. */
  image?: boolean;
  resolve: (d: DocumentData, tz: string) => string;
};

const ALL: readonly FieldContext[] = ["registration", "traveler", "project"];
const PEOPLE: readonly FieldContext[] = ["registration", "traveler"];
const TRAVEL: readonly FieldContext[] = ["traveler"];

const s = (v: string | undefined | null) => (v ?? "").trim();
const join = (sep: string, ...xs: (string | undefined | null)[]) =>
  xs.map(s).filter(Boolean).join(sep);

function fullName(d: DocumentData) {
  return join(" ", d.person?.firstName, d.person?.lastName);
}

function firstStay(d: DocumentData) {
  return d.stays?.[0];
}

function sortedFlights(d: DocumentData): DocFlight[] {
  const t = (x: DocFlight) => (x.departure ? new Date(x.departure).getTime() : 0);
  return [...(d.flights ?? [])].sort((a, b) => t(a) - t(b));
}

export function flightLine(f: DocFlight, tz: string): string {
  return join(
    "  ·  ",
    join(" · ", f.flightNumber, f.airlineName || f.airlineCode),
    `${f.originIata} → ${f.destIata}`,
    f.departure ? formatDateTime(f.departure, tz) : "",
    f.seat ? `Assento ${f.seat}` : "",
  );
}

export const FIELD_CATALOG: readonly FieldDefinition[] = [
  // ── Pessoa ──
  {
    key: "person.badgeName",
    label: "Nome no crachá",
    group: "Pessoa",
    contexts: PEOPLE,
    sample: "Viviane Pinatti",
    resolve: (d) => s(d.person?.badgeName) || s(d.person?.socialName) || fullName(d),
  },
  {
    key: "person.fullName",
    label: "Nome completo",
    group: "Pessoa",
    contexts: PEOPLE,
    sample: "Viviane Souza Pinatti",
    resolve: (d) => s(d.person?.socialName) || fullName(d),
  },
  {
    key: "person.firstName",
    label: "Primeiro nome",
    group: "Pessoa",
    contexts: PEOPLE,
    sample: "Viviane",
    resolve: (d) => s(d.person?.firstName),
  },
  {
    key: "person.lastName",
    label: "Sobrenome",
    group: "Pessoa",
    contexts: PEOPLE,
    sample: "Pinatti",
    resolve: (d) => s(d.person?.lastName),
  },
  {
    key: "person.jobTitle",
    label: "Cargo",
    group: "Pessoa",
    contexts: PEOPLE,
    sample: "Diretora Comercial",
    resolve: (d) => s(d.registration?.displayJobTitle) || s(d.person?.jobTitle),
  },
  {
    key: "person.email",
    label: "E-mail",
    group: "Pessoa",
    contexts: PEOPLE,
    sample: "viviane@empresa.com.br",
    resolve: (d) => s(d.person?.email),
  },
  {
    key: "person.phone",
    label: "Telefone",
    group: "Pessoa",
    contexts: PEOPLE,
    sample: "(18) 99876-5432",
    resolve: (d) => formatPhone(d.person?.phone),
  },
  {
    key: "person.cpf",
    label: "CPF",
    group: "Pessoa",
    contexts: PEOPLE,
    sample: "111.222.333-44",
    resolve: (d) => formatCpf(d.person?.cpf),
  },
  {
    key: "person.rg",
    label: "RG",
    group: "Pessoa",
    contexts: TRAVEL,
    sample: "12.345.678-9",
    resolve: (d) => s(d.person?.rg),
  },
  {
    key: "person.passport",
    label: "Passaporte",
    group: "Pessoa",
    contexts: TRAVEL,
    sample: "FX123456",
    resolve: (d) => s(d.person?.passportNumber),
  },
  {
    key: "person.passportExpiry",
    label: "Validade do passaporte",
    group: "Pessoa",
    contexts: TRAVEL,
    sample: "12/08/2031",
    resolve: (d, tz) => formatDate(d.person?.passportExpiry, tz),
  },
  {
    key: "person.birthDate",
    label: "Data de nascimento",
    group: "Pessoa",
    contexts: TRAVEL,
    sample: "03/05/1984",
    resolve: (d, tz) => formatDate(d.person?.birthDate, tz),
  },
  {
    key: "person.nationality",
    label: "Nacionalidade",
    group: "Pessoa",
    contexts: TRAVEL,
    sample: "Brasileira",
    resolve: (d) => s(d.person?.nationality),
  },
  {
    key: "person.city",
    label: "Cidade/UF",
    group: "Pessoa",
    contexts: PEOPLE,
    sample: "Presidente Prudente/SP",
    resolve: (d) => join("/", d.person?.city, d.person?.state),
  },
  {
    key: "person.dietary",
    label: "Restrições alimentares",
    group: "Pessoa",
    contexts: PEOPLE,
    sample: "Sem lactose",
    resolve: (d) => s(d.person?.dietary),
  },
  {
    key: "person.emergency",
    label: "Contato de emergência",
    group: "Pessoa",
    contexts: TRAVEL,
    sample: "Carlos · (18) 99111-2233",
    resolve: (d) => join(" · ", d.person?.emergencyName, formatPhone(d.person?.emergencyPhone)),
  },
  {
    key: "person.photo",
    label: "Foto",
    group: "Pessoa",
    contexts: PEOPLE,
    sample: "",
    image: true,
    resolve: (d) => s(d.person?.photoFileId),
  },

  // ── Empresa e inscrição ──
  {
    key: "organization.name",
    label: "Empresa",
    group: "Empresa",
    contexts: PEOPLE,
    sample: "Mitte Tecnologia",
    resolve: (d) => s(d.registration?.displayCompany) || s(d.organization?.name),
  },
  {
    key: "registration.category",
    label: "Categoria",
    group: "Inscrição",
    contexts: PEOPLE,
    sample: "Visitante",
    resolve: (d) => s(d.registration?.category),
  },
  {
    key: "registration.role",
    label: "Papel",
    group: "Inscrição",
    contexts: PEOPLE,
    sample: "Participante",
    resolve: (d) => ROLE_LABELS[d.registration?.role ?? ""] ?? s(d.registration?.role),
  },
  {
    key: "registration.group",
    label: "Grupo",
    group: "Inscrição",
    contexts: PEOPLE,
    sample: "Grupo Azul",
    resolve: (d) => s(d.registration?.group),
  },
  {
    key: "registration.shortCode",
    label: "Código do crachá",
    group: "Inscrição",
    contexts: PEOPLE,
    sample: "482913",
    resolve: (d) => s(d.registration?.shortCode),
  },
  {
    key: "registration.qrValue",
    label: "Conteúdo do QR",
    group: "Inscrição",
    contexts: PEOPLE,
    sample: "https://mais.tur.br/c/exemplo",
    resolve: (d) => s(d.registration?.qrValue) || s(d.registration?.shortCode),
  },
  {
    key: "registration.table",
    label: "Mesa e lugar",
    group: "Inscrição",
    contexts: ["registration"],
    sample: "Mesa 12 · Lugar 4",
    resolve: (d) =>
      join(
        " · ",
        d.registration?.table ? `Mesa ${d.registration.table}` : "",
        d.registration?.seat ? `Lugar ${d.registration.seat}` : "",
      ),
  },

  // ── Projeto e cliente ──
  {
    key: "project.name",
    label: "Nome do projeto/evento",
    group: "Projeto",
    contexts: ALL,
    sample: "SIRAN Summit 2026",
    resolve: (d) => s(d.project?.name),
  },
  {
    key: "project.period",
    label: "Período",
    group: "Projeto",
    contexts: ALL,
    sample: "10 a 11 de novembro de 2026",
    resolve: (d, tz) => formatPeriod(d.project?.startsAt, d.project?.endsAt, tz),
  },
  {
    key: "project.venue",
    label: "Local",
    group: "Projeto",
    contexts: ALL,
    sample: "Centro de Eventos · Presidente Prudente",
    resolve: (d) => join(" · ", d.project?.venueName, d.project?.venueAddress),
  },
  {
    key: "project.destination",
    label: "Destino",
    group: "Projeto",
    contexts: ALL,
    sample: "Mallorca, Espanha",
    resolve: (d) => s(d.project?.destination),
  },
  {
    key: "project.code",
    label: "Código do projeto",
    group: "Projeto",
    contexts: ALL,
    sample: "OS-2026-114",
    resolve: (d) => s(d.project?.code),
  },
  {
    key: "project.logo",
    label: "Logo do projeto",
    group: "Projeto",
    contexts: ALL,
    sample: "",
    image: true,
    resolve: (d) => s(d.project?.logoFileId) || s(d.tenant?.logoFileId),
  },
  {
    key: "tenant.name",
    label: "Cliente",
    group: "Cliente",
    contexts: ALL,
    sample: "ABIEC",
    resolve: (d) => s(d.tenant?.name),
  },
  {
    key: "tenant.logo",
    label: "Logo do cliente",
    group: "Cliente",
    contexts: ALL,
    sample: "",
    image: true,
    resolve: (d) => s(d.tenant?.logoFileId),
  },

  // ── Hospedagem ──
  {
    key: "hotel.name",
    label: "Hotel",
    group: "Hospedagem",
    contexts: TRAVEL,
    sample: "Hotel Nixe Palace",
    resolve: (d) => s(firstStay(d)?.name),
  },
  {
    key: "hotel.address",
    label: "Endereço do hotel",
    group: "Hospedagem",
    contexts: TRAVEL,
    sample: "Av. Joan Miró, 269 · Palma",
    resolve: (d) => {
      const h = firstStay(d);
      return join(", ", h?.address, h?.city, h?.country);
    },
  },
  {
    key: "hotel.checkIn",
    label: "Check-in",
    group: "Hospedagem",
    contexts: TRAVEL,
    sample: "12/05/2026",
    resolve: (d, tz) => formatDate(firstStay(d)?.checkIn, tz),
  },
  {
    key: "hotel.checkOut",
    label: "Check-out",
    group: "Hospedagem",
    contexts: TRAVEL,
    sample: "17/05/2026",
    resolve: (d, tz) => formatDate(firstStay(d)?.checkOut, tz),
  },
  {
    key: "hotel.room",
    label: "Quarto",
    group: "Hospedagem",
    contexts: TRAVEL,
    sample: "514",
    resolve: (d) => s(firstStay(d)?.room),
  },
  {
    key: "hotel.roomType",
    label: "Tipo de quarto",
    group: "Hospedagem",
    contexts: TRAVEL,
    sample: "Duplo vista mar",
    resolve: (d) => s(firstStay(d)?.roomType),
  },

  // ── Voos ──
  {
    key: "flights.first",
    label: "Primeiro voo (uma linha)",
    group: "Voos",
    contexts: TRAVEL,
    sample: "LA8065 · LATAM  ·  GRU → MAD  ·  12/05/2026 às 23h55",
    resolve: (d, tz) => {
      const f = sortedFlights(d)[0];
      return f ? flightLine(f, tz) : "";
    },
  },
  {
    key: "flights.summary",
    label: "Voos (todos os trechos)",
    group: "Voos",
    contexts: TRAVEL,
    sample: "LA8065 · GRU → MAD\nUX6091 · MAD → PMI",
    resolve: (d, tz) =>
      sortedFlights(d)
        .map((f) => flightLine(f, tz))
        .join("\n"),
  },
  {
    key: "flights.locator",
    label: "Localizador principal",
    group: "Voos",
    contexts: TRAVEL,
    sample: "XJ7KQ2",
    resolve: (d) => s(sortedFlights(d).find((f) => f.locator)?.locator),
  },

  // ── Emissão ──
  {
    key: "issue.date",
    label: "Data de emissão",
    group: "Emissão",
    contexts: ALL,
    sample: "18/11/2026",
    resolve: (d, tz) => formatDate(d.issuedAt ?? new Date(), tz),
  },
  {
    key: "issue.time",
    label: "Hora de emissão",
    group: "Emissão",
    contexts: ALL,
    sample: "14h30",
    resolve: (d, tz) => formatTime(d.issuedAt ?? new Date(), tz),
  },
];

const BY_KEY = new Map(FIELD_CATALOG.map((f) => [f.key, f]));

/** Contextos de campo aceitos por cada tipo de documento. */
export const KIND_CONTEXTS: Readonly<Record<string, readonly FieldContext[]>> = {
  BADGE: ["registration", "project"],
  LABEL: ["registration", "project"],
  CERTIFICATE: ["registration", "project"],
  VOUCHER: ["traveler", "project"],
  ROOMING_LIST: ["project"],
  CONTRACT: ["project"],
  OTHER: ["registration", "traveler", "project"],
};

export function fieldsForKind(kind: string): FieldDefinition[] {
  const ctx = KIND_CONTEXTS[kind] ?? KIND_CONTEXTS.OTHER ?? [];
  return FIELD_CATALOG.filter((f) => f.contexts.some((c) => ctx.includes(c)));
}

export function getField(key: string): FieldDefinition | undefined {
  return BY_KEY.get(key);
}

/**
 * Valor de um campo. Aceita também `custom.<chave>` (campos livres do cliente).
 * Campo desconhecido → string vazia (nunca lança: um modelo antigo não pode
 * derrubar a impressão no balcão).
 */
export function resolveField(data: DocumentData, key: string): string {
  const tz = data.timezone || "America/Sao_Paulo";
  if (key.startsWith("custom.")) {
    const v = data.custom?.[key.slice(7)];
    return v === null || v === undefined ? "" : String(v);
  }
  const def = BY_KEY.get(key);
  if (!def) return "";
  try {
    return def.resolve(data, tz);
  } catch {
    return "";
  }
}

/** Valores de exemplo para a pré-visualização do editor. */
export function sampleValue(key: string): string {
  return BY_KEY.get(key)?.sample ?? "";
}

/**
 * Substitui {{campo}} pelo valor; campos desconhecidos viram vazio.
 * `extra` traz valores do renderizador, como {{page.number}} e {{page.count}}.
 */
export function interpolate(
  text: string,
  data: DocumentData,
  extra: Record<string, string> = {},
): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) =>
    key in extra ? (extra[key] ?? "") : resolveField(data, key),
  );
}
