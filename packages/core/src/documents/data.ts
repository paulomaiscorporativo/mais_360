/**
 * Dados que alimentam um documento. Montados pelo servidor a partir do banco
 * (inscrição, pessoa, projeto, cliente, voos, hospedagem…) e entregues ao
 * renderizador já como valores simples — o motor não conhece o Prisma.
 */

export type DocFlight = {
  flightNumber: string;
  airlineName?: string;
  airlineCode?: string;
  /** Imagem do logo da companhia (id de arquivo, resolvido pelo carregador de assets). */
  airlineLogoFileId?: string;
  operatedBy?: string;
  originIata: string;
  originName?: string;
  destIata: string;
  destName?: string;
  departure?: Date | string | null;
  arrival?: Date | string | null;
  seat?: string;
  locator?: string;
  cabin?: string;
};

export type DocStay = {
  name: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  checkIn?: Date | string | null;
  checkOut?: Date | string | null;
  room?: string;
  roomType?: string;
  confirmation?: string;
};

export type DocItineraryItem = {
  date?: Date | string | null;
  startTime?: string;
  endTime?: string;
  title: string;
  location?: string;
};

export type DocumentData = {
  /** Fuso para formatar datas (do projeto ou do cliente). */
  timezone?: string;
  /** Data de emissão (padrão: agora). */
  issuedAt?: Date;
  tenant?: {
    name?: string;
    logoFileId?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
  };
  project?: {
    name?: string;
    code?: string;
    startsAt?: Date | string | null;
    endsAt?: Date | string | null;
    venueName?: string;
    venueAddress?: string;
    destination?: string;
    logoFileId?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };
  person?: {
    firstName?: string;
    lastName?: string;
    badgeName?: string;
    socialName?: string;
    email?: string;
    phone?: string;
    cpf?: string;
    rg?: string;
    passportNumber?: string;
    passportExpiry?: Date | string | null;
    birthDate?: Date | string | null;
    nationality?: string;
    jobTitle?: string;
    city?: string;
    state?: string;
    dietary?: string;
    emergencyName?: string;
    emergencyPhone?: string;
    photoFileId?: string;
  };
  organization?: { name?: string };
  registration?: {
    role?: string; // RegistrationRole
    status?: string;
    category?: string;
    categoryColor?: string;
    group?: string;
    groupColor?: string;
    displayCompany?: string;
    displayJobTitle?: string;
    shortCode?: string;
    /** Conteúdo do QR (link público /c/<token> ou o próprio código). */
    qrValue?: string;
    table?: string;
    seat?: string;
  };
  flights?: DocFlight[];
  stays?: DocStay[];
  itinerary?: DocItineraryItem[];
  /** Campos livres do cliente: custom.<chave>. */
  custom?: Record<string, string | number | null | undefined>;
};
