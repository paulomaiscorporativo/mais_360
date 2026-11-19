import type { DocumentData } from "./data";

/** Dados de exemplo para a pré-visualização do editor e para os testes. */
export const SAMPLE_REGISTRATION: DocumentData = {
  timezone: "America/Sao_Paulo",
  tenant: { name: "SIRAN", primaryColor: "#0f3d2e", secondaryColor: "#0b2a20", accentColor: "#a0bf27" },
  project: {
    name: "SIRAN Summit 2026",
    startsAt: "2026-11-10T11:00:00Z",
    endsAt: "2026-11-11T21:00:00Z",
    venueName: "Centro de Eventos",
    venueAddress: "Presidente Prudente/SP",
  },
  person: {
    firstName: "Viviane",
    lastName: "Pinatti",
    badgeName: "Viviane Pinatti",
    jobTitle: "Diretora Comercial",
    email: "viviane@mitte.com.br",
    phone: "5518998765432",
    cpf: "11122233344",
    city: "Presidente Prudente",
    state: "SP",
  },
  organization: { name: "Mitte Tecnologia Agropecuária" },
  registration: {
    role: "ATTENDEE",
    category: "Visitante",
    categoryColor: "#1d6b52",
    shortCode: "482913",
    qrValue: "https://comitiva.mais.tur.br/c/7f3a9c2e41b04d8e",
  },
};

export const SAMPLE_TRAVELER: DocumentData = {
  timezone: "America/Sao_Paulo",
  issuedAt: new Date("2026-11-18T17:30:00Z"),
  tenant: { name: "ABIEC", primaryColor: "#123f6d", secondaryColor: "#0b2a4a", accentColor: "#6ba63d" },
  project: {
    name: "Missão Comercial ABIEC — Espanha",
    startsAt: "2027-05-12T12:00:00Z",
    endsAt: "2027-05-19T12:00:00Z",
    destination: "Madri e Palma de Mallorca, Espanha",
  },
  person: {
    firstName: "João",
    lastName: "Araújo Simões",
    cpf: "11122233344",
    passportNumber: "FX123456",
    passportExpiry: "2031-08-12T12:00:00Z",
    birthDate: "1979-03-05T12:00:00Z",
    nationality: "Brasileira",
    emergencyName: "Mariângela Simões",
    emergencyPhone: "5511991112233",
    dietary: "Sem glúten",
  },
  organization: { name: "Frigorífico Exemplo S.A." },
  registration: { role: "TRAVELER", category: "Diretoria", group: "Grupo Azul" },
  flights: [
    { flightNumber: "LA8065", airlineName: "LATAM", airlineCode: "LA", originIata: "GRU", originName: "São Paulo/Guarulhos",
      destIata: "MAD", destName: "Madri/Barajas", departure: "2027-05-13T02:55:00Z", arrival: "2027-05-13T15:45:00Z", seat: "23C", locator: "XJ7KQ2", cabin: "Econômica" },
    { flightNumber: "UX6091", airlineName: "Air Europa", airlineCode: "UX", operatedBy: "Air Nostrum", originIata: "MAD", originName: "Madri/Barajas",
      destIata: "PMI", destName: "Palma de Mallorca", departure: "2027-05-13T18:20:00Z", arrival: "2027-05-13T19:35:00Z", seat: "08A", locator: "XJ7KQ2" },
    { flightNumber: "LA8064", airlineName: "LATAM", airlineCode: "LA", originIata: "MAD", originName: "Madri/Barajas",
      destIata: "GRU", destName: "São Paulo/Guarulhos", departure: "2027-05-19T11:10:00Z", arrival: "2027-05-19T19:05:00Z", seat: "24D", locator: "XJ7KQ2" },
  ],
  stays: [
    { name: "Hotel Nixe Palace", address: "Av. Joan Miró, 269", city: "Palma de Mallorca", country: "Espanha",
      checkIn: "2027-05-13T18:00:00Z", checkOut: "2027-05-16T12:00:00Z", room: "514", roomType: "Duplo vista mar", confirmation: "NX-88412" },
    { name: "Hotel Villa Magna", address: "Paseo de la Castellana, 22", city: "Madri", country: "Espanha",
      checkIn: "2027-05-16T18:00:00Z", checkOut: "2027-05-19T08:00:00Z", room: "1208", roomType: "Single executivo" },
  ],
  itinerary: [
    { date: "2027-05-14T12:00:00Z", startTime: "09:30", title: "Visita técnica — Mercapalma", location: "Palma" },
    { date: "2027-05-14T12:00:00Z", startTime: "20:00", title: "Jantar de boas-vindas", location: "Es Baluard" },
    { date: "2027-05-15T12:00:00Z", startTime: "10:00", title: "Rodada de negócios com importadores", location: "Hotel Nixe Palace" },
    { date: "2027-05-17T12:00:00Z", startTime: "09:00", title: "Feira Meat Attraction — credenciamento", location: "IFEMA Madri" },
  ],
};
