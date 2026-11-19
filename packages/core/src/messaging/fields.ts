import { calendarDaysUntil, formatDateBR, formatTimeBR } from "./timezone";

/**
 * Campos dinâmicos das mensagens: {{nome}}, {{link_cracha}}, {{dias_restantes}}…
 *
 * O contexto é montado pelo servidor (@mais/messaging) a partir do banco; aqui
 * fica só a transformação contexto → valores, que é pura e testável.
 */

export type FieldContextKind =
  "pessoa" | "inscricao" | "projeto" | "cliente" | "convite" | "viagem";

export type MessageFieldDefinition = {
  key: string;
  label: string;
  context: FieldContextKind;
  example: string;
  /** Campo é um link (o editor mostra como botão/ícone) */
  isLink?: boolean;
};

export const MESSAGE_FIELDS: readonly MessageFieldDefinition[] = [
  // Pessoa
  { key: "nome", label: "Nome completo", context: "pessoa", example: "Maria Fernanda Souza" },
  { key: "primeiro_nome", label: "Primeiro nome", context: "pessoa", example: "Maria" },
  { key: "sobrenome", label: "Sobrenome", context: "pessoa", example: "Souza" },
  { key: "nome_cracha", label: "Nome no crachá", context: "pessoa", example: "Maria Souza" },
  { key: "email", label: "E-mail", context: "pessoa", example: "maria@empresa.com.br" },
  { key: "telefone", label: "Telefone", context: "pessoa", example: "+55 (11) 99999-8888" },
  { key: "empresa", label: "Empresa", context: "pessoa", example: "Frigorífico Exemplo" },
  { key: "cargo", label: "Cargo", context: "pessoa", example: "Diretora Comercial" },
  // Inscrição
  { key: "categoria", label: "Categoria", context: "inscricao", example: "Visitante" },
  { key: "codigo", label: "Código de acesso (6 dígitos)", context: "inscricao", example: "482913" },
  {
    key: "status_inscricao",
    label: "Situação da inscrição",
    context: "inscricao",
    example: "Confirmada",
  },
  {
    key: "link_cracha",
    label: "Link do crachá digital",
    context: "inscricao",
    example: "https://…/c/abc",
    isLink: true,
  },
  {
    key: "link_confirmar",
    label: "Link para confirmar presença",
    context: "inscricao",
    example: "https://…/c/abc?confirmar=1",
    isLink: true,
  },
  // Projeto
  {
    key: "projeto",
    label: "Nome do evento/viagem",
    context: "projeto",
    example: "SIRAN Summit 2026",
  },
  { key: "data_inicio", label: "Data de início", context: "projeto", example: "10/11/2026" },
  { key: "hora_inicio", label: "Horário de início", context: "projeto", example: "19:30" },
  { key: "data_fim", label: "Data de término", context: "projeto", example: "11/11/2026" },
  { key: "dias_restantes", label: "Dias até o início", context: "projeto", example: "7" },
  { key: "local", label: "Local", context: "projeto", example: "Casa Bizutt" },
  {
    key: "endereco",
    label: "Endereço",
    context: "projeto",
    example: "Rua do Ator, 577 — São Paulo/SP",
  },
  {
    key: "link_mapa",
    label: "Link do mapa",
    context: "projeto",
    example: "https://www.google.com/maps/…",
    isLink: true,
  },
  { key: "destino", label: "Destino", context: "projeto", example: "Mallorca, Espanha" },
  // Cliente
  { key: "cliente", label: "Nome do cliente", context: "cliente", example: "ABIEC" },
  // Convite
  { key: "mesa", label: "Mesa e cadeira", context: "convite", example: "Mesa 5, cadeira 3" },
  { key: "traje", label: "Traje", context: "convite", example: "Esporte fino" },
  {
    key: "empresa_convidante",
    label: "Empresa que convidou",
    context: "convite",
    example: "Distribuidora Exemplo",
  },
  { key: "data_limite", label: "Data-limite das cotas", context: "convite", example: "31/10/2026" },
  {
    key: "login",
    label: "Login da plataforma",
    context: "convite",
    example: "distribuidoraexemplo",
  },
  {
    key: "link_plataforma",
    label: "Link da plataforma",
    context: "convite",
    example: "https://abiec.mais.tur.br",
    isLink: true,
  },
  // Viagem (linha direta)
  {
    key: "protocolo",
    label: "Protocolo da solicitação",
    context: "viagem",
    example: "LD-2026-0042",
  },
  { key: "origem", label: "Origem", context: "viagem", example: "São Paulo (GRU)" },
  { key: "data_ida", label: "Data de ida", context: "viagem", example: "02/12/2026" },
  { key: "data_volta", label: "Data de volta", context: "viagem", example: "08/12/2026" },
  {
    key: "link_solicitacao",
    label: "Link da solicitação",
    context: "viagem",
    example: "https://…/app/solicitacoes/…",
    isLink: true,
  },
];

export const FIELD_CONTEXT_LABELS: Record<FieldContextKind, string> = {
  pessoa: "Pessoa",
  inscricao: "Inscrição",
  projeto: "Evento / viagem",
  cliente: "Cliente",
  convite: "Convite",
  viagem: "Solicitação de viagem",
};

const FIELD_KEYS = new Set(MESSAGE_FIELDS.map((f) => f.key));
export const isKnownField = (key: string) => FIELD_KEYS.has(key);

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

export type RegistrationStatus =
  "PENDING" | "INVITED" | "CONFIRMED" | "DECLINED" | "WAITLIST" | "CANCELED";

export type MessageContext = {
  /** Fuso para datas e "dias restantes" (do projeto ou do cliente) */
  timeZone: string;
  tenant: { name: string };
  person: {
    firstName: string;
    lastName?: string;
    badgeName?: string;
    email?: string;
    phone?: string;
    company?: string;
    jobTitle?: string;
  };
  registration?: {
    status: RegistrationStatus;
    checkedIn: boolean;
    category?: string;
    shortCode?: string;
    badgeUrl?: string;
    confirmUrl?: string;
  };
  project?: {
    name: string;
    startsAt?: Date | null;
    endsAt?: Date | null;
    venueName?: string;
    venueAddress?: string;
    destination?: string;
  };
  invite?: {
    table?: number | null;
    seat?: number | null;
    dressCode?: string;
    invitingCompany?: string;
    deadline?: Date | null;
    login?: string;
    platformUrl?: string;
  };
  travel?: {
    protocol?: string;
    origin?: string;
    destination?: string;
    departDate?: Date | null;
    returnDate?: Date | null;
    requestUrl?: string;
  };
};

const STATUS_LABEL: Record<RegistrationStatus, string> = {
  PENDING: "Pendente",
  INVITED: "Convidado",
  CONFIRMED: "Confirmada",
  DECLINED: "Recusada",
  WAITLIST: "Lista de espera",
  CANCELED: "Cancelada",
};

export function mapsUrl(venueName?: string, venueAddress?: string): string {
  const q = [venueName, venueAddress].filter(Boolean).join(" ").trim();
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : "";
}

function seatLabel(table?: number | null, seat?: number | null): string {
  if (table == null) return "";
  return seat != null ? `Mesa ${table}, cadeira ${seat}` : `Mesa ${table}`;
}

/** Converte o contexto nos valores de cada campo. Campos ausentes viram "". */
export function buildFieldValues(
  ctx: MessageContext,
  now: Date = new Date(),
): Record<string, string> {
  const tz = ctx.timeZone;
  const date = (d?: Date | null) => (d ? formatDateBR(d, tz) : "");
  const p = ctx.person;
  const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  const start = ctx.project?.startsAt ?? null;
  const days = start ? Math.max(0, calendarDaysUntil(start, now, tz)) : null;

  return {
    nome: fullName,
    primeiro_nome: p.firstName ?? "",
    sobrenome: p.lastName ?? "",
    nome_cracha: p.badgeName || fullName,
    email: p.email ?? "",
    telefone: p.phone ?? "",
    empresa: p.company ?? "",
    cargo: p.jobTitle ?? "",

    categoria: ctx.registration?.category ?? "",
    codigo: ctx.registration?.shortCode ?? "",
    status_inscricao: ctx.registration ? STATUS_LABEL[ctx.registration.status] : "",
    link_cracha: ctx.registration?.badgeUrl ?? "",
    link_confirmar: ctx.registration?.confirmUrl ?? "",

    projeto: ctx.project?.name ?? "",
    data_inicio: date(start),
    hora_inicio: start ? formatTimeBR(start, tz) : "",
    data_fim: date(ctx.project?.endsAt),
    dias_restantes: days == null ? "" : String(days),
    local: ctx.project?.venueName ?? "",
    endereco: ctx.project?.venueAddress ?? "",
    link_mapa: mapsUrl(ctx.project?.venueName, ctx.project?.venueAddress),
    destino: ctx.project?.destination ?? ctx.travel?.destination ?? "",

    cliente: ctx.tenant.name,

    mesa: seatLabel(ctx.invite?.table, ctx.invite?.seat),
    traje: ctx.invite?.dressCode ?? "",
    empresa_convidante: ctx.invite?.invitingCompany ?? "",
    data_limite: date(ctx.invite?.deadline),
    login: ctx.invite?.login ?? "",
    link_plataforma: ctx.invite?.platformUrl ?? "",

    protocolo: ctx.travel?.protocol ?? "",
    origem: ctx.travel?.origin ?? "",
    data_ida: date(ctx.travel?.departDate),
    data_volta: date(ctx.travel?.returnDate),
    link_solicitacao: ctx.travel?.requestUrl ?? "",
  };
}

/** Contexto fictício para pré-visualizar um modelo quando ainda não há inscritos. */
export function sampleContext(
  timeZone = "America/Sao_Paulo",
  now: Date = new Date(),
): MessageContext {
  const inAWeek = new Date(now.getTime() + 7 * 86_400_000);
  return {
    timeZone,
    tenant: { name: "Cliente Exemplo" },
    person: {
      firstName: "Maria",
      lastName: "Exemplo",
      email: "maria@exemplo.com.br",
      phone: "+55 (11) 99999-8888",
      company: "Empresa Exemplo",
      jobTitle: "Diretora Comercial",
    },
    registration: {
      status: "INVITED",
      checkedIn: false,
      category: "Visitante",
      shortCode: "123456",
      badgeUrl: "https://exemplo.mais.tur.br/c/exemplo",
      confirmUrl: "https://exemplo.mais.tur.br/c/exemplo?confirmar=1",
    },
    project: {
      name: "Evento Exemplo 2026",
      startsAt: inAWeek,
      venueName: "Centro de Convenções",
      venueAddress: "Av. Exemplo, 1000 — São Paulo/SP",
    },
    invite: { table: 5, seat: 3, dressCode: "Esporte fino" },
  };
}
