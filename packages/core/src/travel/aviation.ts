/**
 * Catálogo inicial de aviação (companhias e aeroportos) com fuso IANA de cada
 * aeroporto. É semeado nas tabelas globais Airline/Airport na primeira vez que
 * um projeto usa voos; o operador pode cadastrar outros livremente.
 */

export const AIRLINES: readonly (readonly [code: string, name: string])[] = [
  ["LA", "LATAM Airlines"],
  ["JJ", "LATAM Airlines Brasil"],
  ["G3", "GOL Linhas Aéreas"],
  ["AD", "Azul Linhas Aéreas"],
  ["TP", "TAP Air Portugal"],
  ["LH", "Lufthansa"],
  ["UX", "Air Europa"],
  ["IB", "Iberia"],
  ["I2", "Iberia Express"],
  ["LX", "Swiss International Air Lines"],
  ["BA", "British Airways"],
  ["AF", "Air France"],
  ["KL", "KLM"],
  ["AZ", "ITA Airways"],
  ["AA", "American Airlines"],
  ["UA", "United Airlines"],
  ["DL", "Delta Air Lines"],
  ["EK", "Emirates"],
  ["QR", "Qatar Airways"],
  ["EY", "Etihad Airways"],
  ["TK", "Turkish Airlines"],
  ["ET", "Ethiopian Airlines"],
  ["CM", "Copa Airlines"],
  ["AV", "Avianca"],
  ["AR", "Aerolíneas Argentinas"],
  ["H2", "Sky Airline"],
  ["AM", "Aeroméxico"],
  ["CA", "Air China"],
];

export const AIRPORTS: readonly (readonly [
  iata: string,
  name: string,
  city: string,
  country: string,
  timezone: string,
])[] = [
  ["GRU", "Aeroporto Internacional de Guarulhos", "São Paulo", "BR", "America/Sao_Paulo"],
  ["CGH", "Aeroporto de Congonhas", "São Paulo", "BR", "America/Sao_Paulo"],
  ["VCP", "Aeroporto de Viracopos", "Campinas", "BR", "America/Sao_Paulo"],
  ["GIG", "Aeroporto Internacional do Galeão", "Rio de Janeiro", "BR", "America/Sao_Paulo"],
  ["SDU", "Aeroporto Santos Dumont", "Rio de Janeiro", "BR", "America/Sao_Paulo"],
  ["BSB", "Aeroporto Internacional de Brasília", "Brasília", "BR", "America/Sao_Paulo"],
  ["CNF", "Aeroporto Internacional de Confins", "Belo Horizonte", "BR", "America/Sao_Paulo"],
  ["POA", "Aeroporto Salgado Filho", "Porto Alegre", "BR", "America/Sao_Paulo"],
  ["CWB", "Aeroporto Afonso Pena", "Curitiba", "BR", "America/Sao_Paulo"],
  ["FLN", "Aeroporto Hercílio Luz", "Florianópolis", "BR", "America/Sao_Paulo"],
  ["SSA", "Aeroporto de Salvador", "Salvador", "BR", "America/Bahia"],
  ["REC", "Aeroporto do Recife", "Recife", "BR", "America/Recife"],
  ["FOR", "Aeroporto Pinto Martins", "Fortaleza", "BR", "America/Fortaleza"],
  ["NAT", "Aeroporto de São Gonçalo do Amarante", "Natal", "BR", "America/Fortaleza"],
  ["MCZ", "Aeroporto Zumbi dos Palmares", "Maceió", "BR", "America/Maceio"],
  ["BEL", "Aeroporto Internacional de Belém", "Belém", "BR", "America/Belem"],
  ["MAO", "Aeroporto Eduardo Gomes", "Manaus", "BR", "America/Manaus"],
  ["CGB", "Aeroporto Marechal Rondon", "Cuiabá", "BR", "America/Cuiaba"],
  ["CGR", "Aeroporto de Campo Grande", "Campo Grande", "BR", "America/Campo_Grande"],
  ["GYN", "Aeroporto Santa Genoveva", "Goiânia", "BR", "America/Sao_Paulo"],
  ["IGU", "Aeroporto das Cataratas", "Foz do Iguaçu", "BR", "America/Sao_Paulo"],
  ["MAD", "Aeroporto Adolfo Suárez Madrid-Barajas", "Madri", "ES", "Europe/Madrid"],
  ["BCN", "Aeroporto de Barcelona-El Prat", "Barcelona", "ES", "Europe/Madrid"],
  ["PMI", "Aeroporto de Palma de Mallorca", "Palma de Mallorca", "ES", "Europe/Madrid"],
  ["LIS", "Aeroporto Humberto Delgado", "Lisboa", "PT", "Europe/Lisbon"],
  ["OPO", "Aeroporto Francisco Sá Carneiro", "Porto", "PT", "Europe/Lisbon"],
  ["CDG", "Aeroporto Charles de Gaulle", "Paris", "FR", "Europe/Paris"],
  ["FRA", "Aeroporto de Frankfurt", "Frankfurt", "DE", "Europe/Berlin"],
  ["MUC", "Aeroporto de Munique", "Munique", "DE", "Europe/Berlin"],
  ["ZRH", "Aeroporto de Zurique", "Zurique", "CH", "Europe/Zurich"],
  ["LHR", "Aeroporto de Heathrow", "Londres", "GB", "Europe/London"],
  ["FCO", "Aeroporto Leonardo da Vinci-Fiumicino", "Roma", "IT", "Europe/Rome"],
  ["MXP", "Aeroporto de Milão-Malpensa", "Milão", "IT", "Europe/Rome"],
  ["AMS", "Aeroporto de Schiphol", "Amsterdã", "NL", "Europe/Amsterdam"],
  ["IST", "Aeroporto de Istambul", "Istambul", "TR", "Europe/Istanbul"],
  ["JFK", "Aeroporto John F. Kennedy", "Nova York", "US", "America/New_York"],
  ["MIA", "Aeroporto Internacional de Miami", "Miami", "US", "America/New_York"],
  ["MCO", "Aeroporto Internacional de Orlando", "Orlando", "US", "America/New_York"],
  ["LAS", "Aeroporto Harry Reid", "Las Vegas", "US", "America/Los_Angeles"],
  ["CUN", "Aeroporto Internacional de Cancún", "Cancún", "MX", "America/Cancun"],
  ["PTY", "Aeroporto de Tocumen", "Cidade do Panamá", "PA", "America/Panama"],
  ["PUJ", "Aeroporto de Punta Cana", "Punta Cana", "DO", "America/Santo_Domingo"],
  ["EZE", "Aeroporto de Ezeiza", "Buenos Aires", "AR", "America/Argentina/Buenos_Aires"],
  ["AEP", "Aeroparque Jorge Newbery", "Buenos Aires", "AR", "America/Argentina/Buenos_Aires"],
  ["SCL", "Aeroporto Arturo Merino Benítez", "Santiago", "CL", "America/Santiago"],
  ["DXB", "Aeroporto Internacional de Dubai", "Dubai", "AE", "Asia/Dubai"],
  ["DOH", "Aeroporto Internacional Hamad", "Doha", "QA", "Asia/Qatar"],
  ["CAN", "Aeroporto Internacional de Baiyun", "Guangzhou", "CN", "Asia/Shanghai"],
  ["PEK", "Aeroporto Internacional de Pequim", "Pequim", "CN", "Asia/Shanghai"],
  ["PVG", "Aeroporto de Pudong", "Xangai", "CN", "Asia/Shanghai"],
  ["TLV", "Aeroporto Ben Gurion", "Tel Aviv", "IL", "Asia/Jerusalem"],
];

export const AIRPORT_TIMEZONE: ReadonlyMap<string, string> = new Map(
  AIRPORTS.map(([iata, , , , tz]) => [iata, tz]),
);

/** Escopo do voo pelos países de origem e destino. */
export function flightScope(originCountry: string, destCountry: string) {
  return originCountry && destCountry && originCountry === destCountry
    ? ("DOMESTIC" as const)
    : ("INTERNATIONAL" as const);
}
